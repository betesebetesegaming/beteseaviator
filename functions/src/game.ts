import * as crypto from "crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import {
  db,
  rtdb,
  FieldValue,
  getSettings,
  requireRole,
  round2,
  todayIso,
  walletRead,
  walletWrite,
  bumpDailyStats,
  bumpPlatformStats,
  bumpAgentGgr,
} from "./helpers";
import { applyBetWagering } from "./wagering";
import { onReferralFirstBet } from "./referrals";

const BETTING_MS = 6_000; // betting window
const CRASHED_MS = 4_000; // crash display before next round
const DEFAULT_GROWTH = 0.06; // m(t) = e^(k*t)
const MAX_FLIGHT_MS = 120_000; // hard cap on a single flight

interface RoundNode {
  roundId: string;
  status: "betting" | "flying" | "crashed";
  phaseStart: number;
  bettingEndsAt: number;
  hash: string;
  growthRate: number;
  crashPoint?: number;
  serverSeed?: string;
  /** flight duration, written at takeoff so transitions are deterministic */
  flightMs?: number;
}

function multiplierAt(elapsedMs: number, growthRate: number): number {
  return Math.max(1, Math.exp(growthRate * (elapsedMs / 1000)));
}

function timeToMultiplierMs(m: number, growthRate: number): number {
  return (Math.log(Math.max(1, m)) / growthRate) * 1000;
}

/** Provably fair crash point: P(crash >= m) = rtp / m, derived from the seed. */
function crashPointFromSeed(serverSeed: string, roundId: string, rtp: number, maxM: number): number {
  const h = crypto.createHash("sha256").update(`${serverSeed}:${roundId}`).digest("hex");
  const u = parseInt(h.slice(0, 13), 16) / 2 ** 52; // uniform [0,1)
  const raw = rtp / (1 - u);
  const point = Math.max(1, Math.floor(raw * 100) / 100);
  return Math.min(point, maxM);
}

interface GameMeta {
  rtp: number;
  maxMultiplier: number;
  growthRate: number;
}

async function getGameMeta(gameId: string): Promise<GameMeta> {
  const snap = await db.doc(`games/${gameId}`).get();
  if (!snap.exists || snap.data()!.status !== "active") {
    throw new HttpsError("not-found", "Game not found or inactive.");
  }
  const data = snap.data()!;
  return {
    rtp: Number(data.rtp ?? 97) / 100,
    maxMultiplier: Number(data.settings?.maxMultiplier ?? 100),
    growthRate: Number(data.settings?.growthRate ?? DEFAULT_GROWTH),
  };
}

function newRound(meta: GameMeta, now: number): { node: RoundNode; serverSeed: string; crashPoint: number } {
  const serverSeed = crypto.randomBytes(32).toString("hex");
  const roundId = `R${now.toString(36)}${crypto.randomBytes(3).toString("hex")}`.toUpperCase();
  const hash = crypto.createHash("sha256").update(serverSeed).digest("hex");
  const crashPoint = crashPointFromSeed(serverSeed, roundId, meta.rtp, meta.maxMultiplier);
  return {
    node: {
      roundId,
      status: "betting",
      phaseStart: now,
      bettingEndsAt: now + BETTING_MS,
      hash,
      growthRate: meta.growthRate,
    },
    serverSeed,
    crashPoint,
  };
}

/**
 * Advances the round state machine for a game (serverless game loop).
 * Runs at most a handful of RTDB transactions; every caller (bets, cashouts,
 * client pokes, the minute tick) keeps the game moving. Returns the current node.
 */
export async function ensureRound(gameId: string): Promise<RoundNode> {
  const meta = await getGameMeta(gameId);
  const currentRef = rtdb.ref(`rounds/${gameId}/current`);

  for (let i = 0; i < 5; i++) {
    const now = Date.now();
    let pendingSecret: { roundId: string; serverSeed: string; crashPoint: number } | null = null;

    const result = await currentRef.transaction((node: RoundNode | null) => {
      pendingSecret = null;

      if (!node || !node.roundId) {
        const created = newRound(meta, now);
        pendingSecret = {
          roundId: created.node.roundId,
          serverSeed: created.serverSeed,
          crashPoint: created.crashPoint,
        };
        return created.node;
      }
      if (node.status === "betting" && now >= node.bettingEndsAt) {
        return { ...node, status: "flying", phaseStart: now } as RoundNode;
      }
      if (node.status === "flying") {
        // flight time is derived from the secret crash point — read below, after tx
        const flightMs = node.flightMs;
        if (flightMs !== undefined && now >= node.phaseStart + Math.min(flightMs, MAX_FLIGHT_MS)) {
          return { ...node, status: "crashed", phaseStart: now } as RoundNode;
        }
        return; // no change
      }
      if (node.status === "crashed" && now >= node.phaseStart + CRASHED_MS) {
        const created = newRound(meta, now);
        pendingSecret = {
          roundId: created.node.roundId,
          serverSeed: created.serverSeed,
          crashPoint: created.crashPoint,
        };
        return created.node;
      }
      return; // no change
    });

    const node = result.snapshot.val() as RoundNode | null;
    if (!node) continue;

    // persist the secret for a freshly created round
    if (pendingSecret !== null) {
      const s = pendingSecret as { roundId: string; serverSeed: string; crashPoint: number };
      await rtdb.ref(`roundSecrets/${gameId}/${s.roundId}`).set({
        serverSeed: s.serverSeed,
        crashPoint: s.crashPoint,
        createdAt: Date.now(),
      });
    }

    // when a round takes off we stamp its (secret-derived) flight duration
    if (node.status === "flying" && node.flightMs === undefined) {
      const secretSnap = await rtdb.ref(`roundSecrets/${gameId}/${node.roundId}`).get();
      const secret = secretSnap.val() as { crashPoint: number } | null;
      const crashPoint = secret?.crashPoint ?? 1;
      const flightMs = Math.min(timeToMultiplierMs(crashPoint, node.growthRate), MAX_FLIGHT_MS);
      await currentRef.transaction((n: RoundNode | null) => {
        if (n && n.roundId === node.roundId && n.flightMs === undefined) {
          return { ...n, flightMs };
        }
        return;
      });
      continue; // loop again — maybe the flight is already over
    }

    // a transition into "crashed" reveals the seed and settles the round
    if (node.status === "crashed" && node.crashPoint === undefined) {
      const secretSnap = await rtdb.ref(`roundSecrets/${gameId}/${node.roundId}`).get();
      const secret = secretSnap.val() as { crashPoint: number; serverSeed: string } | null;
      if (secret) {
        await currentRef.transaction((n: RoundNode | null) => {
          if (n && n.roundId === node.roundId && n.status === "crashed") {
            return { ...n, crashPoint: secret.crashPoint, serverSeed: secret.serverSeed };
          }
          return;
        });
        await rtdb.ref(`rounds/${gameId}/history/${node.roundId}`).set({
          crashPoint: secret.crashPoint,
          at: Date.now(),
        });
        await settleRound(gameId, node.roundId, secret.crashPoint, node.growthRate);
      }
    }

    // figure out whether more transitions are due right now
    const fresh = (await currentRef.get()).val() as RoundNode | null;
    if (!fresh) continue;
    const t = Date.now();
    const due =
      (fresh.status === "betting" && t >= fresh.bettingEndsAt) ||
      (fresh.status === "flying" &&
        fresh.flightMs !== undefined &&
        t >= fresh.phaseStart + fresh.flightMs) ||
      (fresh.status === "flying" && fresh.flightMs === undefined) ||
      (fresh.status === "crashed" && fresh.crashPoint === undefined) ||
      (fresh.status === "crashed" && t >= fresh.phaseStart + CRASHED_MS);
    if (!due) return fresh;
  }

  const final = (await currentRef.get()).val() as RoundNode;
  return final;
}

/**
 * Settles every still-active session of a crashed round. Idempotent: each
 * session settles in its own transaction that re-checks status under lock,
 * so double-crediting is impossible even if two callers race.
 */
async function settleRound(
  gameId: string,
  roundId: string,
  crashPoint: number,
  growthRate: number
): Promise<void> {
  const snap = await db
    .collection("gameSessions")
    .where("gameId", "==", gameId)
    .where("roundId", "==", roundId)
    .where("status", "==", "active")
    .get();
  if (snap.empty) return;

  const date = todayIso();
  for (const docSnap of snap.docs) {
    try {
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(docSnap.ref);
        if (!fresh.exists || fresh.data()!.status !== "active") return;
        const s = fresh.data()!;
        const autoAt = s.autoCashoutAt ? Number(s.autoCashoutAt) : null;
        const playerId = s.playerId as string;
        const betAmount = Number(s.betAmount);
        const ancestors = (s.ancestors as string[]) ?? [];

        if (autoAt && autoAt < crashPoint) {
          // auto cashout fired before the crash — pay the win
          const winAmount = round2(betAmount * autoAt);
          const wallet = await walletRead(tx, playerId);
          tx.update(docSnap.ref, {
            status: "won",
            cashoutMultiplier: autoAt,
            winAmount,
            settledAt: FieldValue.serverTimestamp(),
          });
          walletWrite(tx, wallet, {
            uid: playerId,
            amount: winAmount,
            type: "win",
            description: `Aviator win x${autoAt.toFixed(2)} (auto)`,
            meta: { gameId, roundId, sessionId: docSnap.id },
            ignoreFrozen: true,
          });
          bumpDailyStats(tx, date, { wins: winAmount });
          bumpPlatformStats(tx, { totalWins: winAmount });
          bumpAgentGgr(tx, ancestors, playerId, date, { wins: winAmount });
        } else {
          tx.update(docSnap.ref, {
            status: "lost",
            settledAt: FieldValue.serverTimestamp(),
          });
        }
      });
    } catch (e) {
      logger.error("settleRound: session settle failed", { sessionId: docSnap.id, e });
    }
  }
  void growthRate;
}

/** Sweep sessions stuck on rounds that are no longer current (safety net). */
async function sweepStaleSessions(gameId: string, currentRoundId: string): Promise<void> {
  const snap = await db
    .collection("gameSessions")
    .where("gameId", "==", gameId)
    .where("status", "==", "active")
    .limit(200)
    .get();
  for (const docSnap of snap.docs) {
    const s = docSnap.data();
    if (s.roundId === currentRoundId) continue;
    const secretSnap = await rtdb.ref(`roundSecrets/${gameId}/${s.roundId}`).get();
    const secret = secretSnap.val() as { crashPoint: number } | null;
    if (!secret) continue;
    await settleRound(gameId, s.roundId as string, secret.crashPoint, DEFAULT_GROWTH);
  }
}

// ---------------------------------------------------------------------------
// callables
// ---------------------------------------------------------------------------

export const placeBet = onCall(async (req) => {
  const { uid, profile } = await requireRole(req, ["player"]);
  const gameId = String(req.data?.gameId ?? "");
  const betAmount = round2(Number(req.data?.betAmount));
  const autoRaw = req.data?.autoCashoutAt;
  const settings = await getSettings();

  if (!gameId) throw new HttpsError("invalid-argument", "gameId is required.");
  if (!Number.isFinite(betAmount) || betAmount < settings.minBet || betAmount > settings.maxBet) {
    throw new HttpsError(
      "invalid-argument",
      `Bet must be between ${settings.minBet} and ${settings.maxBet} GMD.`
    );
  }
  let autoCashoutAt: number | null = null;
  if (autoRaw !== undefined && autoRaw !== null && autoRaw !== "") {
    autoCashoutAt = Number(autoRaw);
    if (
      !Number.isFinite(autoCashoutAt) ||
      autoCashoutAt < settings.minAutoCashout ||
      autoCashoutAt > settings.maxAutoCashout
    ) {
      throw new HttpsError(
        "invalid-argument",
        `Auto-cashout must be between ${settings.minAutoCashout} and ${settings.maxAutoCashout}.`
      );
    }
  }

  const round = await ensureRound(gameId);
  if (round.status !== "betting" || Date.now() >= round.bettingEndsAt) {
    throw new HttpsError("failed-precondition", "Betting is closed — wait for the next round.");
  }

  // one active bet per game per player
  const existing = await db
    .collection("gameSessions")
    .where("playerId", "==", uid)
    .where("gameId", "==", gameId)
    .where("status", "==", "active")
    .limit(1)
    .get();
  if (!existing.empty) {
    throw new HttpsError("failed-precondition", "You already have a bet in play.");
  }

  const sessionRef = db.collection("gameSessions").doc();
  const date = todayIso();

  const priorBetsSnap = await db
    .collection("gameSessions")
    .where("playerId", "==", uid)
    .limit(1)
    .get();
  const isFirstBet = priorBetsSnap.empty;

  await db.runTransaction(async (tx) => {
    const wallet = await walletRead(tx, uid);

    if (isFirstBet) {
      await onReferralFirstBet(tx, uid, settings);
    }

    const fromBonus = Math.min(wallet.bonusBalance, betAmount);
    walletWrite(tx, wallet, {
      uid,
      amount: -betAmount,
      type: "bet",
      description: "Aviator bet",
      meta: { gameId, roundId: round.roundId, sessionId: sessionRef.id },
    });
    applyBetWagering(tx, uid, wallet, betAmount, fromBonus, settings);
    tx.set(sessionRef, {
      playerId: uid,
      gameId,
      betAmount,
      autoCashoutAt,
      cashoutMultiplier: null,
      winAmount: null,
      status: "active",
      roundId: round.roundId,
      provablyFairHash: round.hash,
      ancestors: profile.ancestors ?? [],
      createdAt: FieldValue.serverTimestamp(),
    });
    bumpDailyStats(tx, date, { bets: betAmount, sessions: 1 });
    bumpPlatformStats(tx, { totalBets: betAmount });
    bumpAgentGgr(tx, profile.ancestors ?? [], uid, date, { bets: betAmount });
  });

  return { sessionId: sessionRef.id, roundId: round.roundId, hash: round.hash };
});

export const cashout = onCall(async (req) => {
  const { uid } = await requireRole(req, ["player"]);
  const sessionId = String(req.data?.sessionId ?? "");
  if (!sessionId) throw new HttpsError("invalid-argument", "sessionId is required.");

  const sessionRef = db.doc(`gameSessions/${sessionId}`);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) throw new HttpsError("not-found", "Session not found.");
  const session = sessionSnap.data()!;
  if (session.playerId !== uid) throw new HttpsError("permission-denied", "Not your session.");
  if (session.status !== "active") {
    throw new HttpsError("failed-precondition", "Session already closed.");
  }

  const gameId = session.gameId as string;
  const round = await ensureRound(gameId);
  if (round.roundId !== session.roundId) {
    // round is over; settlement may still be in flight — let it finish
    throw new HttpsError("failed-precondition", "Round is over.");
  }
  if (round.status !== "flying") {
    throw new HttpsError("failed-precondition", "Plane is not flying.");
  }

  const secretSnap = await rtdb.ref(`roundSecrets/${gameId}/${round.roundId}`).get();
  const secret = secretSnap.val() as { crashPoint: number } | null;
  if (!secret) throw new HttpsError("internal", "Round secret missing.");

  const elapsed = Date.now() - round.phaseStart;
  const multiplier = Math.floor(multiplierAt(elapsed, round.growthRate) * 100) / 100;
  if (multiplier >= secret.crashPoint) {
    throw new HttpsError("failed-precondition", "Too late — the plane crashed.");
  }

  const betAmount = Number(session.betAmount);
  const winAmount = round2(betAmount * multiplier);
  const ancestors = (session.ancestors as string[]) ?? [];
  const date = todayIso();

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(sessionRef);
    if (!fresh.exists || fresh.data()!.status !== "active") {
      throw new HttpsError("failed-precondition", "Session already closed.");
    }
    const wallet = await walletRead(tx, uid);
    tx.update(sessionRef, {
      status: "won",
      cashoutMultiplier: multiplier,
      winAmount,
      settledAt: FieldValue.serverTimestamp(),
    });
    walletWrite(tx, wallet, {
      uid,
      amount: winAmount,
      type: "win",
      description: `Aviator win x${multiplier.toFixed(2)}`,
      meta: { gameId, roundId: round.roundId, sessionId },
      ignoreFrozen: true,
    });
    bumpDailyStats(tx, date, { wins: winAmount });
    bumpPlatformStats(tx, { totalWins: winAmount });
    bumpAgentGgr(tx, ancestors, uid, date, { wins: winAmount });
  });

  return { multiplier, winAmount };
});

/** Clients poke when they notice the phase is overdue; cheap and race-safe. */
export const pokeRound = onCall(async (req) => {
  const gameId = String(req.data?.gameId ?? "");
  if (!gameId) throw new HttpsError("invalid-argument", "gameId is required.");
  const { ensureNativeLobbyGames } = await import("./lobbyGames");
  await ensureNativeLobbyGames().catch(() => undefined);
  const round = await ensureRound(gameId);
  return { status: round.status, roundId: round.roundId };
});

/** Minute heartbeat: keeps rounds moving when idle and sweeps stragglers. */
export const gameTick = onSchedule("every 1 minutes", async () => {
  const { ensureNativeLobbyGames } = await import("./lobbyGames");
  await ensureNativeLobbyGames().catch(() => undefined);

  const games = await db.collection("games").where("status", "==", "active").get();
  for (const g of games.docs) {
    try {
      const round = await ensureRound(g.id);
      await sweepStaleSessions(g.id, round.roundId);
    } catch (e) {
      logger.error("gameTick failed for game", { gameId: g.id, e });
    }
  }
});
