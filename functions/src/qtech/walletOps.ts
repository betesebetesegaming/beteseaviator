import * as crypto from "crypto";
import { logger } from "firebase-functions/v2";
import {
  db,
  FieldValue,
  getSettings,
  round2,
  walletRead,
  walletWrite,
  bumpDailyStats,
  bumpPlatformStats,
  bumpAgentGgr,
  bumpAgentStats,
  todayIso,
} from "../helpers";
import { applyBetWagering } from "../wagering";
import { onReferralFirstBet } from "../referrals";
import type { QTechErrorCode } from "./responses";

export class QTechHttpError extends Error {
  code: QTechErrorCode;
  status: number;

  constructor(code: QTechErrorCode, status: number, message?: string) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}

export type StoredQTechTxn = {
  txnId: string;
  playerId: string;
  kind: "withdrawal" | "deposit" | "rollback" | "reward";
  referenceId?: string;
  amount: number;
  balance: number;
  currency: string;
  payloadKey: string;
  betId?: string | null;
  roundId?: string | null;
  createdAt: FirebaseFirestore.FieldValue;
};

export function playableBalance(wallet: { balance: number; bonusBalance: number }): number {
  return round2(wallet.balance + wallet.bonusBalance);
}

/** QTech Common Wallet API — txnType on every bet/win request (section 3.3 / 3.4). */
export function parseQTechTxnType(body: Record<string, unknown>): "DEBIT" | "CREDIT" {
  const raw = String(body.txnType ?? "")
    .trim()
    .toUpperCase();
  if (raw === "DEBIT" || raw === "CREDIT") return raw;
  throw qtechError("REQUEST_DECLINED", 400, "Missing or invalid txnType (DEBIT or CREDIT required)");
}

export function payloadKey(body: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export function newReferenceId(): string {
  return `QT${Date.now().toString(36)}${crypto.randomBytes(4).toString("hex")}`.toUpperCase();
}

export async function loadPlayer(uid: string): Promise<{
  uid: string;
  blocked: boolean;
  currency: string;
}> {
  const [userSnap, walletSnap] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`wallets/${uid}`).get(),
  ]);
  if (!userSnap.exists || userSnap.data()?.role !== "player") {
    return { uid, blocked: true, currency: "GMD" };
  }
  const status = userSnap.data()?.status;
  const frozen = walletSnap.exists && Boolean(walletSnap.data()?.frozen);
  return {
    uid,
    blocked: status !== "active" || frozen,
    currency: String(walletSnap.data()?.currency || "GMD"),
  };
}

export async function getBalanceForPlayer(uid: string): Promise<{ balance: number; currency: string }> {
  const player = await loadPlayer(uid);
  if (player.blocked) {
    throw qtechError("ACCOUNT_BLOCKED", 403);
  }
  const walletSnap = await db.doc(`wallets/${uid}`).get();
  const balance = walletSnap.exists
    ? playableBalance({
        balance: Number(walletSnap.data()?.balance ?? 0),
        bonusBalance: Number(walletSnap.data()?.bonusBalance ?? 0),
      })
    : 0;
  return { balance, currency: player.currency };
}

export function qtechError(code: QTechErrorCode, status: number, message?: string): QTechHttpError {
  return new QTechHttpError(code, status, message);
}

export function parseQtechError(e: unknown): { code: QTechErrorCode; status: number; message?: string } {
  if (e instanceof QTechHttpError) {
    return { code: e.code, status: e.status, message: e.message };
  }
  return { code: "REQUEST_DECLINED", status: 400, message: e instanceof Error ? e.message : "Request declined" };
}

async function getStoredTxn(txnId: string): Promise<(StoredQTechTxn & { id: string }) | null> {
  const snap = await db.doc(`qtechTransactions/${txnId}`).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as StoredQTechTxn) };
}

async function findWithdrawalByReference(referenceId: string): Promise<(StoredQTechTxn & { id: string }) | null> {
  const q = await db
    .collection("qtechTransactions")
    .where("referenceId", "==", referenceId)
    .where("kind", "==", "withdrawal")
    .limit(1)
    .get();
  if (q.empty) return null;
  const doc = q.docs[0];
  return { id: doc.id, ...(doc.data() as StoredQTechTxn) };
}

async function findWithdrawalByBetId(betId: string): Promise<(StoredQTechTxn & { id: string }) | null> {
  const q = await db
    .collection("qtechTransactions")
    .where("betId", "==", betId)
    .where("kind", "==", "withdrawal")
    .limit(1)
    .get();
  if (q.empty) return null;
  const doc = q.docs[0];
  return { id: doc.id, ...(doc.data() as StoredQTechTxn) };
}

export async function processWithdrawal(
  body: Record<string, unknown>,
  currency: string
): Promise<{ balance: number; referenceId: string }> {
  const txnType = parseQTechTxnType(body);
  if (txnType !== "DEBIT") {
    throw qtechError("REQUEST_DECLINED", 400, "Withdrawals require txnType DEBIT");
  }

  const txnId = String(body.txnId ?? "");
  const playerId = String(body.playerId ?? "");
  const amount = round2(Number(body.amount));
  const key = payloadKey(body);

  if (!txnId || !playerId || !Number.isFinite(amount) || amount < 0) {
    throw qtechError("REQUEST_DECLINED", 400, "Invalid withdrawal payload");
  }

  logger.info("QTech withdrawal", { txnId, playerId, amount, roundId: body.roundId, gameId: body.gameId });

  const existing = await getStoredTxn(txnId);
  if (existing) {
    if (existing.payloadKey !== key) throw qtechError("REQUEST_DECLINED", 400, "Duplicate txnId with different payload");
    return { balance: existing.balance, referenceId: existing.referenceId || newReferenceId() };
  }

  const player = await loadPlayer(playerId);
  if (player.blocked) throw qtechError("ACCOUNT_BLOCKED", 403);
  if (String(body.currency ?? currency).toUpperCase() !== currency) {
    throw qtechError("REQUEST_DECLINED", 400, "Currency mismatch");
  }

  const referenceId = newReferenceId();
  let balanceAfter = 0;
  const settings = await getSettings();

  await db.runTransaction(async (tx) => {
    const dupSnap = await tx.get(db.doc(`qtechTransactions/${txnId}`));
    if (dupSnap.exists) {
      const dup = dupSnap.data() as StoredQTechTxn;
      balanceAfter = dup.balance;
      return;
    }

    const userSnap = await tx.get(db.doc(`users/${playerId}`));
    if (!userSnap.exists || userSnap.data()?.status !== "active") {
      throw qtechError("ACCOUNT_BLOCKED", 403);
    }

    const wallet = await walletRead(tx, playerId);
    if (wallet.frozen) throw qtechError("ACCOUNT_BLOCKED", 403);

    const total = playableBalance(wallet);
    if (amount > 0 && total < amount) {
      throw qtechError("INSUFFICIENT_FUNDS", 400);
    }

    if (amount > 0) {
      await onReferralFirstBet(tx, playerId, settings);

      const fromBonus = Math.min(wallet.bonusBalance, amount);
      walletWrite(tx, wallet, {
        uid: playerId,
        amount: -amount,
        type: "bet",
        description: `QTech bet (${String(body.gameId ?? "game")})`,
        meta: {
          source: "qtech",
          txnId,
          roundId: body.roundId,
          gameId: body.gameId,
        },
      });
      applyBetWagering(tx, playerId, wallet, amount, fromBonus, settings);

      const ancestors = (userSnap.data()?.ancestors as string[]) || [];
      const date = todayIso();
      bumpPlatformStats(tx, { totalBets: amount });
      bumpDailyStats(tx, date, { bets: amount });
      bumpAgentGgr(tx, ancestors, playerId, date, { bets: amount });
      for (const agentId of ancestors) {
        bumpAgentStats(tx, agentId, { totalBets: amount });
      }
    }

    balanceAfter = playableBalance(wallet);
    tx.set(db.doc(`qtechTransactions/${txnId}`), {
      txnId,
      playerId,
      kind: "withdrawal",
      referenceId,
      betId: txnId,
      roundId: body.roundId ? String(body.roundId) : null,
      amount,
      balance: balanceAfter,
      currency,
      payloadKey: key,
      createdAt: FieldValue.serverTimestamp(),
    } satisfies StoredQTechTxn);
  });

  if (!balanceAfter) {
    const stored = await getStoredTxn(txnId);
    balanceAfter = stored?.balance ?? 0;
  }

  return { balance: balanceAfter, referenceId: (await getStoredTxn(txnId))?.referenceId || referenceId };
}

export async function processDeposit(
  body: Record<string, unknown>,
  currency: string
): Promise<{ balance: number; referenceId: string }> {
  const txnType = parseQTechTxnType(body);
  if (txnType !== "CREDIT") {
    throw qtechError("REQUEST_DECLINED", 400, "Deposits require txnType CREDIT");
  }

  const txnId = String(body.txnId ?? "");
  const playerId = String(body.playerId ?? "");
  const amount = round2(Number(body.amount));
  const key = payloadKey(body);

  if (!txnId || !playerId || !Number.isFinite(amount) || amount < 0) {
    throw qtechError("REQUEST_DECLINED", 400, "Invalid deposit payload");
  }

  logger.info("QTech deposit", {
    txnId,
    playerId,
    amount,
    betId: body.betId,
    roundId: body.roundId,
    gameId: body.gameId,
  });

  const existing = await getStoredTxn(txnId);
  if (existing) {
    if (existing.payloadKey !== key) throw qtechError("REQUEST_DECLINED", 400, "Duplicate txnId with different payload");
    return { balance: existing.balance, referenceId: existing.referenceId || newReferenceId() };
  }

  const player = await loadPlayer(playerId);
  if (player.blocked) throw qtechError("ACCOUNT_BLOCKED", 403);

  const referenceId = newReferenceId();
  let balanceAfter = 0;

  await db.runTransaction(async (tx) => {
    const dupSnap = await tx.get(db.doc(`qtechTransactions/${txnId}`));
    if (dupSnap.exists) {
      balanceAfter = (dupSnap.data() as StoredQTechTxn).balance;
      return;
    }

    const userSnap = await tx.get(db.doc(`users/${playerId}`));
    const wallet = await walletRead(tx, playerId);

    if (amount > 0) {
      walletWrite(tx, wallet, {
        uid: playerId,
        amount,
        type: "win",
        description: `QTech win (${String(body.gameId ?? "game")})`,
        meta: {
          source: "qtech",
          txnId,
          roundId: body.roundId,
          betId: body.betId,
          gameId: body.gameId,
        },
      });

      const ancestors = (userSnap.data()?.ancestors as string[]) || [];
      const date = todayIso();
      bumpPlatformStats(tx, { totalWins: amount });
      bumpDailyStats(tx, date, { wins: amount });
      bumpAgentGgr(tx, ancestors, playerId, date, { wins: amount });
      for (const agentId of ancestors) {
        bumpAgentStats(tx, agentId, { totalWins: amount });
      }
    }

    balanceAfter = playableBalance(wallet);
    tx.set(db.doc(`qtechTransactions/${txnId}`), {
      txnId,
      playerId,
      kind: "deposit",
      referenceId,
      amount,
      balance: balanceAfter,
      currency,
      payloadKey: key,
      roundId: body.roundId ? String(body.roundId) : null,
      betId: body.betId ? String(body.betId) : null,
      createdAt: FieldValue.serverTimestamp(),
    } satisfies StoredQTechTxn);
  });

  return { balance: balanceAfter, referenceId };
}

export async function processRollback(
  body: Record<string, unknown>,
  currency: string,
  opts: { betId?: string; referenceId?: string }
): Promise<{ balance: number; referenceId?: string }> {
  const txnId = String(body.txId ?? body.txnId ?? "");
  const playerId = String(body.playerId ?? "");
  const amount = round2(Number(body.amount));
  const key = payloadKey(body);

  if (!txnId || !playerId || !Number.isFinite(amount) || amount < 0) {
    throw qtechError("REQUEST_DECLINED", 400, "Invalid rollback payload");
  }

  const existing = await getStoredTxn(txnId);
  if (existing) {
    if (existing.payloadKey !== key) throw qtechError("REQUEST_DECLINED", 400, "Duplicate txnId with different payload");
    return { balance: existing.balance, referenceId: existing.referenceId };
  }

  let withdrawal: (StoredQTechTxn & { id: string }) | null = null;
  if (opts.betId) {
    withdrawal = await findWithdrawalByBetId(opts.betId);
  } else if (opts.referenceId) {
    withdrawal = await findWithdrawalByReference(opts.referenceId);
  }

  if (!withdrawal) {
    const bal = await getBalanceForPlayer(playerId);
    return { balance: bal.balance };
  }

  const referenceId = newReferenceId();
  let balanceAfter = 0;

  await db.runTransaction(async (tx) => {
    const dupSnap = await tx.get(db.doc(`qtechTransactions/${txnId}`));
    if (dupSnap.exists) {
      balanceAfter = (dupSnap.data() as StoredQTechTxn).balance;
      return;
    }

    const wallet = await walletRead(tx, playerId);
    if (amount > 0) {
      walletWrite(tx, wallet, {
        uid: playerId,
        amount,
        type: "refund",
        description: "QTech rollback",
        meta: { source: "qtech", txnId, betId: opts.betId, referenceId: opts.referenceId },
        ignoreFrozen: true,
      });
    }
    balanceAfter = playableBalance(wallet);
    tx.set(db.doc(`qtechTransactions/${txnId}`), {
      txnId,
      playerId,
      kind: "rollback",
      referenceId,
      amount,
      balance: balanceAfter,
      currency,
      payloadKey: key,
      betId: opts.betId || null,
      roundId: body.roundId ? String(body.roundId) : null,
      createdAt: FieldValue.serverTimestamp(),
    } satisfies StoredQTechTxn);
  });

  return { balance: balanceAfter, referenceId };
}

export async function processReward(
  body: Record<string, unknown>,
  currency: string
): Promise<{ balance: number; referenceId: string }> {
  const txnId = String(body.txnId ?? "");
  const playerId = String(body.playerId ?? "");
  const amount = round2(Number(body.amount));
  const key = payloadKey(body);

  if (!txnId || !playerId || !body.rewardType || !Number.isFinite(amount) || amount < 0) {
    throw qtechError("REQUEST_DECLINED", 400, "Invalid reward payload");
  }

  const existing = await getStoredTxn(txnId);
  if (existing) {
    if (existing.payloadKey !== key) throw qtechError("REQUEST_DECLINED", 400, "Duplicate txnId with different payload");
    return { balance: existing.balance, referenceId: existing.referenceId || newReferenceId() };
  }

  const player = await loadPlayer(playerId);
  if (player.blocked) throw qtechError("ACCOUNT_BLOCKED", 403);

  const referenceId = newReferenceId();
  let balanceAfter = 0;

  await db.runTransaction(async (tx) => {
    const wallet = await walletRead(tx, playerId);
    if (amount > 0) {
      walletWrite(tx, wallet, {
        uid: playerId,
        amount,
        type: "bonus",
        creditAsBonus: true,
        description: `QTech reward (${String(body.rewardTitle ?? "reward")})`,
        meta: { source: "qtech", txnId, rewardType: body.rewardType },
      });
    }
    balanceAfter = playableBalance(wallet);
    tx.set(db.doc(`qtechTransactions/${txnId}`), {
      txnId,
      playerId,
      kind: "reward",
      referenceId,
      amount,
      balance: balanceAfter,
      currency,
      payloadKey: key,
      createdAt: FieldValue.serverTimestamp(),
    } satisfies StoredQTechTxn);
  });

  return { balance: balanceAfter, referenceId };
}
