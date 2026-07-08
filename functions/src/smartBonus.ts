/**
 * BETESE Smart Bonus — AI-powered player-retention / welcome-back engine.
 *
 * Fully additive: new collections (playerHealth, smartBonusOffers,
 * smartBonusEvents, smartBonusActive) + a nightly analysis job. It NEVER
 * touches the bet/deposit/withdraw money paths — bonus crediting reuses the
 * existing wallet + wagering engine (walletWrite + recordBonusWageringRequirement).
 */
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import {
  db,
  FieldValue,
  getSettings,
  requireRole,
  round2,
  walletRead,
  walletWrite,
  type Settings,
} from "./helpers";
import { playthroughRates, recordBonusWageringRequirement } from "./wagering";

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SmartBonusConfig {
  enabled: boolean;
  autoCreate: boolean;
  inactiveDays: number;
  minBonus: number;
  maxBonus: number;
  matchPercent: number;
  wagerMultiplier: number;
  expiryDays: number;
  maxConcurrent: number;
}

export function smartBonusConfig(settings: Settings): SmartBonusConfig {
  const raw = (settings as Settings & { smartBonus?: Partial<SmartBonusConfig> }).smartBonus ?? {};
  const fallbackMult = Number(settings.bonusWagerMultiplier ?? 3);
  return {
    enabled: raw.enabled === true,
    autoCreate: raw.autoCreate !== false,
    inactiveDays: clampNum(raw.inactiveDays, 30, 1, 365),
    minBonus: clampNum(raw.minBonus, 50, 0, 1_000_000),
    maxBonus: clampNum(raw.maxBonus, 1000, 0, 1_000_000),
    matchPercent: clampNum(raw.matchPercent, 1, 0.01, 5),
    wagerMultiplier: clampNum(raw.wagerMultiplier, fallbackMult, 0, 100),
    expiryDays: clampNum(raw.expiryDays, 7, 1, 90),
    maxConcurrent: clampNum(raw.maxConcurrent, 1, 1, 10),
  };
}

function clampNum(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// ---------------------------------------------------------------------------
// Health scoring (pure — deterministic, auditable)
// ---------------------------------------------------------------------------

export type HealthTier = "very_active" | "active" | "at_risk" | "inactive" | "dormant";

export interface PlayerMetrics {
  daysSinceLastLogin: number;
  daysSinceLastBet: number;
  daysSinceLastDeposit: number;
  avgDeposit: number;
  avgWeeklyDeposits: number;
  lifetimeDeposits: number;
  lifetimeGgr: number;
  activeBettingDays30: number;
  depositCount: number;
  betCount: number;
  bonusHistoryCount: number;
  bonusConversionCount: number;
}

/** Piecewise recency reward: full points when recent, decaying to a floor. */
function recencyPoints(days: number, max: number): number {
  if (!Number.isFinite(days)) return 0;
  if (days <= 3) return max;
  if (days <= 7) return max * 0.85;
  if (days <= 14) return max * 0.65;
  if (days <= 30) return max * 0.4;
  if (days <= 60) return max * 0.2;
  if (days <= 90) return max * 0.1;
  return max * 0.03;
}

/** 0–100 Player Health Score. Weights: bet recency 40, login 15, frequency 20, value 25. */
export function computeHealthScore(m: PlayerMetrics): number {
  const betRecency = recencyPoints(m.daysSinceLastBet, 40);
  const loginRecency = recencyPoints(m.daysSinceLastLogin, 15);
  const frequency = Math.min(20, (m.activeBettingDays30 / 30) * 20);
  // Log-scaled value so a whale doesn't dwarf everyone; ~50k lifetime ≈ full 25.
  const value = Math.min(25, (Math.log10(1 + Math.max(0, m.lifetimeDeposits)) / Math.log10(50_001)) * 25);
  return Math.max(0, Math.min(100, Math.round(betRecency + loginRecency + frequency + value)));
}

export function healthTier(score: number): HealthTier {
  if (score >= 90) return "very_active";
  if (score >= 70) return "active";
  if (score >= 40) return "at_risk";
  if (score >= 20) return "inactive";
  return "dormant";
}

export interface Recommendation {
  eligible: boolean;
  bonusAmount: number;
  matchDeposit: number;
  reason: string;
  ineligibleReason?: string;
}

/** Rule-based recommendation + plain-English "why" (transparency). */
export function recommendBonus(
  m: PlayerMetrics,
  cfg: SmartBonusConfig,
  ctx: { hasActiveOffer: boolean; outstandingBonusWager: boolean; abuse: boolean }
): Recommendation {
  const bonusAmount = round2(Math.min(cfg.maxBonus, Math.max(cfg.minBonus, Math.round(m.avgDeposit || 0))));
  const matchDeposit = round2(cfg.matchPercent > 0 ? bonusAmount / cfg.matchPercent : bonusAmount);

  let ineligibleReason: string | undefined;
  if (!cfg.enabled) ineligibleReason = "Smart Bonus engine disabled";
  else if (m.daysSinceLastBet < cfg.inactiveDays)
    ineligibleReason = `Active recently (last bet ${m.daysSinceLastBet}d ago)`;
  else if (m.avgDeposit <= 0) ineligibleReason = "No deposit history to size a bonus";
  else if (ctx.hasActiveOffer) ineligibleReason = "Already has an active Smart Bonus offer";
  else if (ctx.outstandingBonusWager) ineligibleReason = "Previous bonus wagering not complete";
  else if (ctx.abuse) ineligibleReason = "Flagged for bonus abuse";

  const returnedBefore = m.bonusConversionCount > 0;
  const reason =
    `Recommended because the player has been inactive for ${m.daysSinceLastBet} days, ` +
    `previously averaged ${round2(m.avgDeposit)} GMD across ${m.depositCount} deposit${m.depositCount === 1 ? "" : "s"}` +
    (m.lifetimeDeposits > 0 ? ` (${round2(m.lifetimeDeposits)} GMD lifetime)` : "") +
    `, and ${returnedBefore ? "has previously returned and converted a bonus after an offer" : "is a strong reactivation candidate"}.`;

  return { eligible: !ineligibleReason, bonusAmount, matchDeposit, reason, ineligibleReason };
}

// ---------------------------------------------------------------------------
// Metrics collection (nightly transaction scan — hot paths untouched)
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES = ["pending", "approved", "sent", "activated"] as const;
type OfferStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "sent"
  | "activated"
  | "expired"
  | "completed";

function isActiveStatus(status: unknown): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(String(status));
}

function daysSince(ms: number | null, nowMs: number): number {
  if (!ms || !Number.isFinite(ms)) return Infinity;
  return Math.max(0, Math.floor((nowMs - ms) / DAY_MS));
}

async function collectMetrics(
  uid: string,
  createdAtMs: number | null,
  nowMs: number,
  lastLoginMs: number | null
): Promise<PlayerMetrics> {
  const snap = await db
    .collection("transactions")
    .where("userId", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(500)
    .get();

  let lastBetMs: number | null = null;
  let lastDepositMs: number | null = null;
  let lastActivityMs: number | null = null;
  let depositSum = 0;
  let depositCount = 0;
  let betSum = 0;
  let winSum = 0;
  let betCount = 0;
  let bonusHistoryCount = 0;
  let bonusConversionCount = 0;
  const betDays = new Set<string>();
  const thirtyAgo = nowMs - 30 * DAY_MS;

  for (const doc of snap.docs) {
    const d = doc.data();
    const ts = d.createdAt as FirebaseFirestore.Timestamp | null;
    const ms = ts?.toMillis?.() ?? null;
    const type = String(d.type ?? "");
    const amount = Number(d.amount ?? 0);
    if (ms && (!lastActivityMs || ms > lastActivityMs)) lastActivityMs = ms;

    if (type === "deposit" && amount > 0) {
      depositSum += amount;
      depositCount += 1;
      if (ms && (!lastDepositMs || ms > lastDepositMs)) lastDepositMs = ms;
    } else if (type === "bet") {
      betSum += Math.abs(amount);
      betCount += 1;
      if (ms && (!lastBetMs || ms > lastBetMs)) lastBetMs = ms;
      if (ms && ms >= thirtyAgo) betDays.add(new Date(ms).toISOString().slice(0, 10));
    } else if (type === "win") {
      winSum += Math.abs(amount);
    } else if (type === "bonus" && amount > 0) {
      bonusHistoryCount += 1;
    }
    if (String(d.meta?.source ?? "") === "bonus_conversion") bonusConversionCount += 1;
  }

  const avgDeposit = depositCount > 0 ? round2(depositSum / depositCount) : 0;
  const firstMs = createdAtMs ?? lastActivityMs ?? nowMs;
  const weeks = Math.max(1, (nowMs - firstMs) / (7 * DAY_MS));

  // Prefer the real last-login ping; fall back to most recent ledger activity.
  const loginMs = Math.max(lastLoginMs ?? 0, lastActivityMs ?? 0) || null;

  return {
    daysSinceLastLogin: daysSince(loginMs ?? createdAtMs, nowMs),
    daysSinceLastBet: daysSince(lastBetMs ?? createdAtMs, nowMs),
    daysSinceLastDeposit: daysSince(lastDepositMs ?? createdAtMs, nowMs),
    avgDeposit,
    avgWeeklyDeposits: round2(depositCount / weeks),
    lifetimeDeposits: round2(depositSum),
    lifetimeGgr: round2(betSum - winSum),
    activeBettingDays30: betDays.size,
    depositCount,
    betCount,
    bonusHistoryCount,
    bonusConversionCount,
  };
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

interface EventArgs {
  offerId: string;
  userId: string;
  actorId: string;
  actorRole: string;
  action: string;
  detail?: string;
  meta?: Record<string, unknown>;
}

export function logSmartBonusEvent(tx: FirebaseFirestore.Transaction, args: EventArgs): void {
  tx.set(db.collection("smartBonusEvents").doc(), {
    ...args,
    detail: args.detail ?? "",
    meta: args.meta ?? {},
    at: FieldValue.serverTimestamp(),
  });
}

async function logSmartBonusEventDirect(args: EventArgs): Promise<void> {
  await db.collection("smartBonusEvents").add({
    ...args,
    detail: args.detail ?? "",
    meta: args.meta ?? {},
    at: FieldValue.serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Offer creation (single-active guarded via smartBonusActive/{uid} pointer)
// ---------------------------------------------------------------------------

interface OfferSeed {
  uid: string;
  userName: string;
  phone: string | null;
  agentId: string | null;
  ancestors: string[];
  playerNumber: number | null;
  healthScore: number;
  tier: HealthTier;
  daysInactive: number;
  bonusAmount: number;
  matchDeposit: number;
  wagerMultiplier: number;
  reason: string;
  source: "ai" | "agent_request";
  requestedByAgent?: string | null;
  expiryDays: number;
  actorId: string;
  actorRole: string;
}

/** Creates a pending offer if the player has no active one. Returns offer id or null. */
async function createOfferIfEligible(seed: OfferSeed): Promise<string | null> {
  const pointerRef = db.doc(`smartBonusActive/${seed.uid}`);
  return db.runTransaction(async (tx) => {
    const pointer = await tx.get(pointerRef);
    if (pointer.exists && isActiveStatus(pointer.data()?.status)) return null;

    const offerRef = db.collection("smartBonusOffers").doc();
    const now = Date.now();
    const expiresAt = new Date(now + seed.expiryDays * DAY_MS).toISOString();
    const wagerRequired = round2(seed.bonusAmount * seed.wagerMultiplier);

    tx.set(offerRef, {
      userId: seed.uid,
      userName: seed.userName,
      phone: seed.phone,
      agentId: seed.agentId,
      ancestors: seed.ancestors,
      playerNumber: seed.playerNumber,
      healthScore: seed.healthScore,
      tier: seed.tier,
      daysInactive: seed.daysInactive,
      bonusAmount: seed.bonusAmount,
      matchDeposit: seed.matchDeposit,
      wagerMultiplier: seed.wagerMultiplier,
      wagerRequired,
      reason: seed.reason,
      status: "pending" as OfferStatus,
      source: seed.source,
      requestedByAgent: seed.requestedByAgent ?? null,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(pointerRef, {
      userId: seed.uid,
      offerId: offerRef.id,
      status: "pending",
      updatedAt: FieldValue.serverTimestamp(),
    });
    logSmartBonusEvent(tx, {
      offerId: offerRef.id,
      userId: seed.uid,
      actorId: seed.actorId,
      actorRole: seed.actorRole,
      action: "created",
      detail: `${seed.source === "ai" ? "AI" : "Agent"} offer: ${seed.bonusAmount} GMD bonus on ${seed.matchDeposit} GMD deposit`,
    });
    return offerRef.id;
  });
}

// ---------------------------------------------------------------------------
// Nightly analysis engine
// ---------------------------------------------------------------------------

const MAX_PLAYERS_PER_RUN = 2000;

export async function runSmartBonusAnalysisCore(opts?: { dryRun?: boolean }): Promise<{
  analyzed: number;
  offersCreated: number;
  expired: number;
  completed: number;
}> {
  const settings = await getSettings();
  const cfg = smartBonusConfig(settings);
  const nowMs = Date.now();

  const expired = await expireStaleOffers(nowMs);
  const completed = await completeSettledOffers();

  if (!cfg.enabled) {
    logger.info("smartBonus analysis skipped (disabled)", { expired, completed });
    return { analyzed: 0, offersCreated: 0, expired, completed };
  }

  let analyzed = 0;
  let offersCreated = 0;
  const dryRun = opts?.dryRun === true;

  let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  while (analyzed < MAX_PLAYERS_PER_RUN) {
    let q = db
      .collection("users")
      .where("role", "==", "player")
      .where("status", "==", "active")
      .orderBy("__name__")
      .limit(200);
    if (last) q = q.startAfter(last.id);
    const page = await q.get();
    if (page.empty) break;
    last = page.docs[page.docs.length - 1];

    for (const userDoc of page.docs) {
      if (analyzed >= MAX_PLAYERS_PER_RUN) break;
      analyzed += 1;
      try {
        const created = await analyzePlayer(userDoc, cfg, nowMs, dryRun);
        if (created) offersCreated += 1;
      } catch (e) {
        logger.warn("smartBonus analyze player failed", { uid: userDoc.id, error: String(e) });
      }
    }
    if (page.size < 200) break;
  }

  logger.info("smartBonus analysis complete", { analyzed, offersCreated, expired, completed, dryRun });
  return { analyzed, offersCreated, expired, completed };
}

async function analyzePlayer(
  userDoc: FirebaseFirestore.QueryDocumentSnapshot,
  cfg: SmartBonusConfig,
  nowMs: number,
  dryRun: boolean
): Promise<boolean> {
  const uid = userDoc.id;
  const u = userDoc.data();
  const createdAtMs = (u.createdAt as FirebaseFirestore.Timestamp | null)?.toMillis?.() ?? null;

  const [walletSnap, pointerSnap, abuseSnap, activitySnap] = await Promise.all([
    db.doc(`wallets/${uid}`).get(),
    db.doc(`smartBonusActive/${uid}`).get(),
    db.doc(`smartBonusAbuse/${uid}`).get(),
    db.doc(`playerActivity/${uid}`).get(),
  ]);
  const lastLoginMs =
    (activitySnap.data()?.lastLoginAt as FirebaseFirestore.Timestamp | null)?.toMillis?.() ?? null;
  const metrics = await collectMetrics(uid, createdAtMs, nowMs, lastLoginMs);

  const score = computeHealthScore(metrics);
  const tier = healthTier(score);
  const wallet = walletSnap.data() ?? {};
  const outstandingBonusWager =
    Number(wallet.bonusWagerRequired ?? 0) - Number(wallet.bonusWagerProgress ?? 0) > 0.01;
  const hasActiveOffer = pointerSnap.exists && isActiveStatus(pointerSnap.data()?.status);
  const abuse = abuseSnap.exists && abuseSnap.data()?.blocked === true;

  const rec = recommendBonus(metrics, cfg, { hasActiveOffer, outstandingBonusWager, abuse });

  // Daily health snapshot (drives admin/marketer dashboards + explanations).
  await db.doc(`playerHealth/${uid}`).set(
    {
      uid,
      name: u.name ?? "",
      phone: u.phone ?? null,
      playerNumber: u.playerNumber ?? null,
      agentId: u.parentId ?? null,
      ancestors: (u.ancestors as string[] | undefined) ?? [],
      healthScore: score,
      tier,
      ...metrics,
      recommendedBonus: rec.bonusAmount,
      matchDeposit: rec.matchDeposit,
      eligible: rec.eligible,
      reason: rec.eligible ? rec.reason : "",
      ineligibleReason: rec.ineligibleReason ?? "",
      hasActiveOffer,
      analyzedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  if (dryRun || !rec.eligible || !cfg.autoCreate) return false;

  const offerId = await createOfferIfEligible({
    uid,
    userName: String(u.name ?? "Player"),
    phone: (u.phone as string | null) ?? null,
    agentId: (u.parentId as string | null) ?? null,
    ancestors: (u.ancestors as string[] | undefined) ?? [],
    playerNumber: (u.playerNumber as number | null) ?? null,
    healthScore: score,
    tier,
    daysInactive: metrics.daysSinceLastBet,
    bonusAmount: rec.bonusAmount,
    matchDeposit: rec.matchDeposit,
    wagerMultiplier: cfg.wagerMultiplier,
    reason: rec.reason,
    source: "ai",
    expiryDays: cfg.expiryDays,
    actorId: "system",
    actorRole: "system",
  });
  return offerId !== null;
}

/** Move pending/approved/sent offers past their expiry to "expired". */
async function expireStaleOffers(nowMs: number): Promise<number> {
  const nowIso = new Date(nowMs).toISOString();
  const snap = await db
    .collection("smartBonusOffers")
    .where("status", "in", ["pending", "approved", "sent"])
    .where("expiresAt", "<", nowIso)
    .limit(400)
    .get();
  let count = 0;
  for (const doc of snap.docs) {
    try {
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        const status = fresh.data()?.status;
        if (!["pending", "approved", "sent"].includes(String(status))) return;
        tx.update(doc.ref, { status: "expired", updatedAt: FieldValue.serverTimestamp() });
        tx.set(
          db.doc(`smartBonusActive/${fresh.data()?.userId}`),
          { status: "expired", updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
        logSmartBonusEvent(tx, {
          offerId: doc.id,
          userId: String(fresh.data()?.userId ?? ""),
          actorId: "system",
          actorRole: "system",
          action: "expired",
        });
      });
      count += 1;
    } catch (e) {
      logger.warn("expire offer failed", { offerId: doc.id, error: String(e) });
    }
  }
  return count;
}

/** Mark activated offers whose bonus wagering has cleared as "completed". */
async function completeSettledOffers(): Promise<number> {
  const snap = await db
    .collection("smartBonusOffers")
    .where("status", "==", "activated")
    .limit(400)
    .get();
  let count = 0;
  for (const doc of snap.docs) {
    const userId = String(doc.data()?.userId ?? "");
    if (!userId) continue;
    try {
      const walletSnap = await db.doc(`wallets/${userId}`).get();
      const w = walletSnap.data() ?? {};
      const outstanding =
        Number(w.bonusWagerRequired ?? 0) - Number(w.bonusWagerProgress ?? 0) > 0.01;
      if (outstanding) continue;
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(doc.ref);
        if (fresh.data()?.status !== "activated") return;
        tx.update(doc.ref, { status: "completed", completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        tx.set(
          db.doc(`smartBonusActive/${userId}`),
          { status: "completed", updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
        logSmartBonusEvent(tx, {
          offerId: doc.id,
          userId,
          actorId: "system",
          actorRole: "system",
          action: "completed",
          detail: "Bonus wagering complete — converted to cash",
        });
      });
      count += 1;
    } catch (e) {
      logger.warn("complete offer failed", { offerId: doc.id, error: String(e) });
    }
  }
  return count;
}

/** Every day at 02:00 (Dakar) — analyze all players and refresh recommendations. */
export const runSmartBonusAnalysis = onSchedule(
  { schedule: "0 2 * * *", timeZone: "Africa/Dakar", timeoutSeconds: 540, memory: "512MiB" },
  async () => {
    await runSmartBonusAnalysisCore();
  }
);

/** Admin can run the analysis on demand (first launch / testing). */
export const adminRunSmartBonusAnalysis = onCall(async (req) => {
  await requireRole(req, ["admin"]);
  return runSmartBonusAnalysisCore({ dryRun: req.data?.dryRun === true });
});

// ---------------------------------------------------------------------------
// Offer lifecycle callables
// ---------------------------------------------------------------------------

export const smartBonusApprove = onCall(async (req) => {
  const { uid } = await requireRole(req, ["admin"]);
  const offerId = String(req.data?.offerId ?? "");
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`smartBonusOffers/${offerId}`);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Offer not found.");
    const o = snap.data()!;
    if (o.status !== "pending") throw new HttpsError("failed-precondition", `Cannot approve a ${o.status} offer.`);
    tx.update(ref, { status: "approved", approvedBy: uid, approvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.set(db.doc(`smartBonusActive/${o.userId}`), { status: "approved", offerId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    logSmartBonusEvent(tx, { offerId, userId: String(o.userId), actorId: uid, actorRole: "admin", action: "approved" });
  });
  return { ok: true as const };
});

export const smartBonusEdit = onCall(async (req) => {
  const { uid } = await requireRole(req, ["admin"]);
  const offerId = String(req.data?.offerId ?? "");
  const settings = await getSettings();
  const cfg = smartBonusConfig(settings);
  const bonusAmount = round2(Number(req.data?.bonusAmount));
  if (!Number.isFinite(bonusAmount) || bonusAmount <= 0) {
    throw new HttpsError("invalid-argument", "bonusAmount must be positive.");
  }
  if (bonusAmount > cfg.maxBonus) {
    throw new HttpsError("invalid-argument", `Bonus exceeds configured maximum (${cfg.maxBonus} GMD).`);
  }
  const matchDeposit =
    req.data?.matchDeposit !== undefined
      ? round2(Number(req.data.matchDeposit))
      : round2(cfg.matchPercent > 0 ? bonusAmount / cfg.matchPercent : bonusAmount);
  if (!Number.isFinite(matchDeposit) || matchDeposit <= 0) {
    throw new HttpsError("invalid-argument", "matchDeposit must be positive.");
  }
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`smartBonusOffers/${offerId}`);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Offer not found.");
    const o = snap.data()!;
    if (o.status !== "pending" && o.status !== "approved") {
      throw new HttpsError("failed-precondition", `Cannot edit a ${o.status} offer.`);
    }
    tx.update(ref, {
      bonusAmount,
      matchDeposit,
      wagerRequired: round2(bonusAmount * Number(o.wagerMultiplier ?? cfg.wagerMultiplier)),
      updatedAt: FieldValue.serverTimestamp(),
    });
    logSmartBonusEvent(tx, {
      offerId,
      userId: String(o.userId),
      actorId: uid,
      actorRole: "admin",
      action: "edited",
      detail: `Bonus ${bonusAmount} GMD on ${matchDeposit} GMD deposit`,
    });
  });
  return { ok: true as const, bonusAmount, matchDeposit };
});

export const smartBonusReject = onCall(async (req) => {
  const { uid } = await requireRole(req, ["admin"]);
  const offerId = String(req.data?.offerId ?? "");
  const reason = String(req.data?.reason ?? "").trim().slice(0, 300);
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`smartBonusOffers/${offerId}`);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Offer not found.");
    const o = snap.data()!;
    if (o.status === "activated" || o.status === "completed") {
      throw new HttpsError("failed-precondition", "Cannot reject an activated offer.");
    }
    tx.update(ref, { status: "rejected", rejectedBy: uid, rejectReason: reason, updatedAt: FieldValue.serverTimestamp() });
    tx.set(db.doc(`smartBonusActive/${o.userId}`), { status: "rejected", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    logSmartBonusEvent(tx, { offerId, userId: String(o.userId), actorId: uid, actorRole: "admin", action: "rejected", detail: reason });
  });
  return { ok: true as const };
});

export const smartBonusSend = onCall(async (req) => {
  const { uid } = await requireRole(req, ["admin"]);
  const offerId = String(req.data?.offerId ?? "");
  const channel = String(req.data?.channel ?? "manual").slice(0, 20);
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`smartBonusOffers/${offerId}`);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Offer not found.");
    const o = snap.data()!;
    if (o.status !== "approved" && o.status !== "sent") {
      throw new HttpsError("failed-precondition", "Approve the offer before sending.");
    }
    tx.update(ref, { status: "sent", sentAt: FieldValue.serverTimestamp(), sentChannel: channel, updatedAt: FieldValue.serverTimestamp() });
    tx.set(db.doc(`smartBonusActive/${o.userId}`), { status: "sent", offerId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    logSmartBonusEvent(tx, { offerId, userId: String(o.userId), actorId: uid, actorRole: "admin", action: "sent", detail: channel });
  });
  return { ok: true as const };
});

/** Marketers can only REQUEST a welcome-back bonus for their own customers. */
export const agentRequestSmartBonus = onCall(async (req) => {
  const { uid, profile } = await requireRole(req, ["agent"]);
  const playerId = String(req.data?.playerId ?? "");
  if (!playerId) throw new HttpsError("invalid-argument", "playerId required.");

  const [playerSnap, healthSnap] = await Promise.all([
    db.doc(`users/${playerId}`).get(),
    db.doc(`playerHealth/${playerId}`).get(),
  ]);
  if (!playerSnap.exists) throw new HttpsError("not-found", "Player not found.");
  const player = playerSnap.data()!;
  const ancestors = (player.ancestors as string[] | undefined) ?? [];
  if (player.parentId !== uid && !ancestors.includes(uid)) {
    throw new HttpsError("permission-denied", "This customer is not in your network.");
  }

  const settings = await getSettings();
  const cfg = smartBonusConfig(settings);
  if (!cfg.enabled) throw new HttpsError("failed-precondition", "Smart Bonus is currently disabled.");

  const health = healthSnap.data() ?? {};
  const bonusAmount = round2(
    Math.min(cfg.maxBonus, Math.max(cfg.minBonus, Number(health.recommendedBonus ?? cfg.minBonus)))
  );
  const matchDeposit = round2(
    Number(health.matchDeposit ?? (cfg.matchPercent > 0 ? bonusAmount / cfg.matchPercent : bonusAmount))
  );

  const offerId = await createOfferIfEligible({
    uid: playerId,
    userName: String(player.name ?? "Player"),
    phone: (player.phone as string | null) ?? null,
    agentId: (player.parentId as string | null) ?? null,
    ancestors,
    playerNumber: (player.playerNumber as number | null) ?? null,
    healthScore: Number(health.healthScore ?? 0),
    tier: (health.tier as HealthTier) ?? "at_risk",
    daysInactive: Number(health.daysSinceLastBet ?? 0),
    bonusAmount,
    matchDeposit,
    wagerMultiplier: cfg.wagerMultiplier,
    reason:
      String(health.reason ?? "") ||
      `Requested by ${profile.name} — customer flagged for a welcome-back offer.`,
    source: "agent_request",
    requestedByAgent: uid,
    expiryDays: cfg.expiryDays,
    actorId: uid,
    actorRole: "agent",
  });

  if (!offerId) {
    throw new HttpsError("failed-precondition", "This customer already has an active Smart Bonus offer.");
  }
  return { ok: true as const, offerId };
});

// ---------------------------------------------------------------------------
// Activation hook — called AFTER a deposit commits (deposit paths untouched)
// ---------------------------------------------------------------------------

/**
 * If the player has an approved/sent Smart Bonus and just deposited at least
 * the required matching amount, credit the bonus into bonusBalance and start
 * its wagering tracker. Runs in its own transaction so it can never interfere
 * with the deposit credit that already succeeded.
 */
export async function maybeActivateSmartBonus(
  uid: string,
  depositAmount: number,
  depositRef: string
): Promise<void> {
  if (!uid || depositAmount <= 0) return;
  try {
    const pointerSnap = await db.doc(`smartBonusActive/${uid}`).get();
    if (!pointerSnap.exists) return;
    const p = pointerSnap.data()!;
    if (p.status !== "approved" && p.status !== "sent") return;
    const offerId = String(p.offerId ?? "");
    if (!offerId) return;

    const settings = await getSettings();
    await db.runTransaction(async (tx) => {
      const offerRef = db.doc(`smartBonusOffers/${offerId}`);
      const offerSnap = await tx.get(offerRef);
      if (!offerSnap.exists) return;
      const o = offerSnap.data()!;
      if (o.status !== "approved" && o.status !== "sent") return;

      if (o.expiresAt && Date.parse(String(o.expiresAt)) < Date.now()) {
        tx.update(offerRef, { status: "expired", updatedAt: FieldValue.serverTimestamp() });
        tx.set(db.doc(`smartBonusActive/${uid}`), { status: "expired", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return;
      }

      const matchDeposit = Number(o.matchDeposit ?? 0);
      if (depositAmount + 0.001 < matchDeposit) return; // deposit too small — wait for a qualifying one

      const bonusAmount = round2(Number(o.bonusAmount ?? 0));
      if (bonusAmount <= 0) return;

      const wallet = await walletRead(tx, uid);
      walletWrite(tx, wallet, {
        uid,
        amount: bonusAmount,
        type: "bonus",
        creditAsBonus: true,
        description: "BETESE Smart Bonus activated",
        meta: { source: "smart_bonus", offerId, depositRef, matchedDeposit: round2(depositAmount) },
      });
      const mult = Number(o.wagerMultiplier ?? playthroughRates(settings).bonusMultiplier);
      recordBonusWageringRequirement(tx, uid, wallet, bonusAmount, mult);

      tx.update(offerRef, {
        status: "activated",
        activatedAt: FieldValue.serverTimestamp(),
        matchedDeposit: round2(depositAmount),
        bonusCredited: bonusAmount,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(db.doc(`smartBonusActive/${uid}`), { status: "activated", offerId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      logSmartBonusEvent(tx, {
        offerId,
        userId: uid,
        actorId: uid,
        actorRole: "player",
        action: "activated",
        detail: `Deposited ${round2(depositAmount)} GMD — ${bonusAmount} GMD bonus credited`,
      });
    });
  } catch (e) {
    logger.error("maybeActivateSmartBonus failed", { uid, error: String(e) });
    // Deposit already succeeded; a failed bonus credit must never throw here.
    await logSmartBonusEventDirect({
      offerId: "",
      userId: uid,
      actorId: "system",
      actorRole: "system",
      action: "activation_error",
      detail: String(e),
    }).catch(() => undefined);
  }
}
