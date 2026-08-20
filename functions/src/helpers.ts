import * as admin from "firebase-admin";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

export const db = admin.firestore();
export const rtdb = admin.database();
export const auth = admin.auth();
export const FieldValue = admin.firestore.FieldValue;

/** Drop presence nodes that have not heartbeated for 20 minutes. */
export async function sweepStalePresence(now = Date.now()): Promise<number> {
  const staleMs = 20 * 60 * 1000;
  const snap = await rtdb.ref("presence").get();
  const val = snap.val() as Record<string, { lastSeen?: unknown }> | null;
  if (!val) return 0;
  const updates: Record<string, null> = {};
  for (const [uid, data] of Object.entries(val)) {
    const lastSeen = Number(data?.lastSeen ?? 0);
    if (!lastSeen || now - lastSeen > staleMs) updates[uid] = null;
  }
  const count = Object.keys(updates).length;
  if (count > 0) await rtdb.ref("presence").update(updates);
  return count;
}

import { normalizeCommissionRate } from "./commissionRate";
import { roleAllowed, type Role } from "./roles";

export type { Role };

export interface ProfileData {
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  parentId: string | null;
  agentSlug: string | null;
  staffLoginId?: string | null;
  ancestors: string[];
  status: "active" | "suspended";
  /** Sequential office ID for players (display: BTE-00001). */
  playerNumber?: number | null;
  referralCode?: string | null;
  referredBy?: string | null;
  createdAt?: admin.firestore.Timestamp | null;
  /** Admin-only: allow OTC cash deposit/withdraw at agent shop. */
  cashOpsEnabled?: boolean;
  stats?: {
    customerCount?: number;
    customerDeposits?: number;
    customerWithdrawals?: number;
    customerCashHeld?: number;
    commissionedGgr?: number;
    ggrDayKey?: string;
    ggrDayBaseline?: number;
    ggrDayDepositBaseline?: number;
    ggrWeekKey?: string;
    ggrWeekBaseline?: number;
    ggrWeekDepositBaseline?: number;
    ggrMonthKey?: string;
    ggrMonthBaseline?: number;
    ggrMonthDepositBaseline?: number;
    walletCash?: number;
    totalDeposits?: number;
    totalWithdrawals?: number;
    totalBets?: number;
    totalWins?: number;
    commissionEarned?: number;
  };
}

export const RESERVED_SLUGS = [
  "www",
  "admin",
  "api",
  "mail",
  "ftp",
  "betese",
  "app",
  "privacy",
  "terms",
  "delete-account",
  "play",
  "agent",
  "suspended",
];

export const PROVIDERS = ["wave", "afrimoney", "aps", "qmoney"] as const;
export type Provider = (typeof PROVIDERS)[number];

/**
 * Platform minimum wallet top-up (GMD). Deposits accept this amount and above.
 *
 * NOTE: Wave (via ModemPay) rejects charges below its own floor. Live payment
 * history shows every 20 GMD Wave charge FAILED while 50 GMD and up succeed.
 * Keep this at or above the lowest amount that actually clears on Wave, or
 * customers' deposits come back `failed` and their wallet is never credited.
 */
export const MIN_DEPOSIT_GMD = 25;

let minDepositMigrationQueued = false;
let publicPlatformSyncQueued = false;

/** One-time write: legacy Firestore minDeposit (e.g. 50/20) → MIN_DEPOSIT_GMD. */
function ensureMinDepositMigration(stored: unknown): void {
  const n = Number(stored);
  if (minDepositMigrationQueued || !Number.isFinite(n) || n === MIN_DEPOSIT_GMD) return;
  minDepositMigrationQueued = true;
  db.doc("settings/platform")
    .set({ minDeposit: MIN_DEPOSIT_GMD }, { merge: true })
    .catch((err) => console.warn("minDeposit migration failed", err));
}

export const DEFAULT_SETTINGS = {
  agentRate: 0.05,
  subAgentRate: 0.05,
  superAgentRate: 0.03,
  apiProviderRate: 0.15,
  apiProviderName: "API Provider",
  minBet: 1,
  maxBet: 100_000,
  minDeposit: MIN_DEPOSIT_GMD,
  minWithdrawal: 100,
  maxWithdrawal: 10_000,
  minAutoCashout: 1.01,
  maxAutoCashout: 100,
  /** Must bet this fraction of recent deposits for full free unlock (1 = 100%). */
  depositPlaythroughRate: 1,
  /** Fee on the unplayed-deposit portion of an early withdrawal (0.2 = 20%). */
  earlyWithdrawalFeeRate: 0.2,
  /** Bonus must be wagered this many times before it becomes cash. */
  bonusWagerMultiplier: 3,
  bonusGamesLabel: "Aviator & Crash",
  bonusCampaignEndsAt: "",
  providers: { wave: true, afrimoney: true, aps: true, qmoney: true } as Record<string, boolean>,
  bonuses: {
    firstDeposit: { enabled: true, percent: 0.5, maxAmount: 10_000, minDeposit: 20 },
    weeklyCrash: { enabled: false, percent: 0.1, maxAmount: 200, minDeposit: 200 },
    weekend: {
      enabled: false,
      percent: 0.25,
      maxAmount: 300,
      minDeposit: 20,
      fridayStartHour: 18,
      sundayEndHour: 23,
    },
  },
  playerReferral: {
    enabled: true,
    bonusAmount: 10,
    minQualifyingDeposit: 50,
    requireFirstBet: true,
  },
  /** BETESE Smart Bonus — AI player-retention / welcome-back engine. */
  smartBonus: {
    /** Master switch: nightly analysis + offers only run when true. */
    enabled: false,
    /** Nightly job auto-creates pending offers for eligible players. */
    autoCreate: true,
    /** Use Claude (ANTHROPIC_API_KEY) to size bonuses + write explanations. */
    aiEnabled: false,
    /** Min days with no bet before a player is a welcome-back candidate. */
    inactiveDays: 30,
    /** Recommended bonus is clamped to this range (GMD). */
    minBonus: 50,
    maxBonus: 1000,
    /** Bonus as a fraction of the required matching deposit (1 = 100% match). */
    matchPercent: 1,
    /** Times the bonus must be wagered before it converts to cash. */
    wagerMultiplier: 3,
    /** Offer lifetime in days before it auto-expires. */
    expiryDays: 7,
    /** Max simultaneous active Smart Bonus offers per player. */
    maxConcurrent: 1,
  },
  customerCare: {
    phone: "2204176003",
    whatsapp: "2204176003",
    label: "BETESE Customer Care",
  },
  qtech: {
    enabled: false,
    passKey: "",
    apiBaseUrl: "",
    operatorId: "",
    apiPassword: "",
    currency: "GMD",
    country: "GM",
    lang: "en_GM",
    lobbyUrl: "https://www.beteseaviator.com/play",
  },
};

export type Settings = typeof DEFAULT_SETTINGS;

import { normalizePhone as toPhoneKey, phoneToEmail as phoneKeyToEmail } from "./phone";

export function normalizePhone(input: string): string {
  return toPhoneKey(input);
}

export function phoneToEmail(phone: string): string {
  const key = toPhoneKey(phone);
  return phoneKeyToEmail(key || phone.replace(/\D/g, ""));
}

/** Normalized username / name key for staff sign-in (no email required). */
export function staffLoginKey(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

/** Synthetic Firebase Auth email when a staff account has no real email. */
export function staffLoginEmail(loginKey: string): string {
  const key = staffLoginKey(loginKey);
  if (!key) {
    throw new HttpsError("invalid-argument", "A valid username or name is required to sign in.");
  }
  return `${key}@staff.beteseaviator.com`;
}

/** Email used for Firebase Auth — real email if set, otherwise username/slug-based login. */
export function resolveStaffAuthEmail(
  profile: Pick<ProfileData, "email" | "agentSlug" | "staffLoginId">
): string {
  const email = String(profile.email || "").trim().toLowerCase();
  if (email.includes("@")) return email;
  const key = profile.agentSlug || profile.staffLoginId;
  if (key) return staffLoginEmail(key);
  throw new HttpsError("failed-precondition", "Account has no login identifier.");
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Net cash BETESE kept from a customer book. First + later deposits count; recycled wins do not. */
export function commissionableGgr(deposits: number, withdrawals: number, cashHeld: number): number {
  const n =
    (Number(deposits) || 0) -
    (Number(withdrawals) || 0) -
    Math.max(0, Number(cashHeld) || 0);
  return round2(Math.max(0, n));
}

export function todayIso(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Monday of the UTC week containing `date` (YYYY-MM-DD). */
export function mondayIso(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1));
  const day = dt.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  dt.setUTCDate(dt.getUTCDate() - diff);
  return dt.toISOString().slice(0, 10);
}

/** Frozen period baselines so live day/week/month GGR does not carry last period. */
export function ggrPeriodAnchorUpdates(
  today: string,
  currentGgr: number,
  currentDeposits: number,
  live: NonNullable<ProfileData["stats"]>
): Record<string, string | number> {
  const monthKey = today.slice(0, 7);
  const weekKey = mondayIso(today);
  const updates: Record<string, string | number> = {};
  if (live.ggrDayKey !== today) {
    updates.ggrDayKey = today;
    updates.ggrDayBaseline = currentGgr;
    updates.ggrDayDepositBaseline = currentDeposits;
  }
  if (live.ggrWeekKey !== weekKey) {
    updates.ggrWeekKey = weekKey;
    updates.ggrWeekBaseline = currentGgr;
    updates.ggrWeekDepositBaseline = currentDeposits;
  }
  if (live.ggrMonthKey !== monthKey) {
    updates.ggrMonthKey = monthKey;
    updates.ggrMonthBaseline = currentGgr;
    updates.ggrMonthDepositBaseline = currentDeposits;
  }
  return updates;
}

export function txnReference(): string {
  return `TXN-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

function ensurePublicPlatformSync(data: FirebaseFirestore.DocumentData): void {
  if (publicPlatformSyncQueued) return;
  publicPlatformSyncQueued = true;
  void import("./publicPlatformSettings")
    .then(({ syncPublicPlatformSettings }) =>
      syncPublicPlatformSettings(data as Record<string, unknown>),
    )
    .catch((err) => {
      publicPlatformSyncQueued = false;
      console.warn("publicPlatform sync failed", err);
    });
}

export async function getSettings(): Promise<Settings> {
  const snap = await db.doc("settings/platform").get();
  const data = snap.data() ?? {};
  const { minDeposit: storedMinDeposit, ...platformRest } = data;
  ensureMinDepositMigration(storedMinDeposit);
  ensurePublicPlatformSync(data);
  return {
    ...DEFAULT_SETTINGS,
    ...platformRest,
    minDeposit: MIN_DEPOSIT_GMD,
    agentRate: normalizeCommissionRate(
      data.agentRate ?? data.subAgentRate,
      DEFAULT_SETTINGS.agentRate
    ),
    subAgentRate: normalizeCommissionRate(
      data.subAgentRate ?? data.agentRate,
      DEFAULT_SETTINGS.subAgentRate
    ),
    superAgentRate: normalizeCommissionRate(
      data.superAgentRate,
      DEFAULT_SETTINGS.superAgentRate
    ),
    apiProviderRate: normalizeCommissionRate(
      data.apiProviderRate,
      DEFAULT_SETTINGS.apiProviderRate
    ),
    providers: { ...DEFAULT_SETTINGS.providers, ...(data.providers ?? {}) },
    bonusGamesLabel:
      typeof data.bonusGamesLabel === "string" && data.bonusGamesLabel.trim()
        ? data.bonusGamesLabel.trim()
        : DEFAULT_SETTINGS.bonusGamesLabel,
    bonusCampaignEndsAt:
      typeof data.bonusCampaignEndsAt === "string" ? data.bonusCampaignEndsAt.trim() : "",
    bonuses: {
      firstDeposit: { ...DEFAULT_SETTINGS.bonuses.firstDeposit, ...(data.bonuses?.firstDeposit ?? {}) },
      weeklyCrash: { ...DEFAULT_SETTINGS.bonuses.weeklyCrash, ...(data.bonuses?.weeklyCrash ?? {}) },
      weekend: { ...DEFAULT_SETTINGS.bonuses.weekend, ...(data.bonuses?.weekend ?? {}) },
    },
    playerReferral: {
      ...DEFAULT_SETTINGS.playerReferral,
      ...(data.playerReferral ?? {}),
    },
    smartBonus: {
      ...DEFAULT_SETTINGS.smartBonus,
      ...(data.smartBonus ?? {}),
    },
    qtech: {
      ...DEFAULT_SETTINGS.qtech!,
      ...(data.qtech ?? {}),
    },
  } as Settings;
}

/** Authenticated caller's uid or 401. */
export function requireAuth(req: CallableRequest): string {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Sign in first.");
  return req.auth.uid;
}

/** Loads the caller's profile and enforces role + active status. */
export async function requireRole(
  req: CallableRequest,
  roles: Role[]
): Promise<{ uid: string; profile: ProfileData }> {
  const uid = requireAuth(req);
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) throw new HttpsError("failed-precondition", "Profile not found.");
  const profile = snap.data() as ProfileData;
  if (profile.status !== "active") throw new HttpsError("permission-denied", "Account suspended.");
  if (!roleAllowed(profile.role, roles)) {
    throw new HttpsError("permission-denied", "You are not allowed to do this.");
  }
  return { uid, profile };
}

interface MoveMoneyArgs {
  uid: string;
  amount: number; // positive credit, negative debit
  type: "deposit" | "withdrawal" | "bet" | "win" | "commission" | "transfer" | "refund" | "bonus" | "referral_to_balance" | "referral_reward" | "referral_withdrawal";
  description: string;
  meta?: Record<string, unknown>;
  /** debits normally blocked on frozen wallets; refunds may still land */
  ignoreFrozen?: boolean;
  /** bonus credits land in bonusBalance (for betting only, not withdrawal) */
  creditAsBonus?: boolean;
  /**
   * Debit cash `balance` only (never bonusBalance).
   * Withdrawals always use cash-only — bonus is play-only until wagering converts it.
   */
  debitCashOnly?: boolean;
}

/**
 * The ONLY way money moves. Must be called inside a Firestore transaction.
 * Reads the wallet, validates, writes the new balance and an immutable
 * ledger row with balance_before/after. Throws on insufficient funds.
 *
 * IMPORTANT: because Firestore transactions require all reads before writes,
 * call walletRead() for every wallet involved first, then walletWrite().
 */
export async function walletRead(
  tx: FirebaseFirestore.Transaction,
  uid: string
): Promise<{
  balance: number;
  bonusBalance: number;
  referralBalance: number;
  frozen: boolean;
  exists: boolean;
  pendingDepositTotal: number;
  depositWagerProgress: number;
  bonusWagerRequired: number;
  bonusWagerProgress: number;
}> {
  const snap = await tx.get(db.doc(`wallets/${uid}`));
  if (!snap.exists) {
    return {
      balance: 0,
      bonusBalance: 0,
      referralBalance: 0,
      frozen: false,
      exists: false,
      pendingDepositTotal: 0,
      depositWagerProgress: 0,
      bonusWagerRequired: 0,
      bonusWagerProgress: 0,
    };
  }
  const data = snap.data()!;
  return {
    balance: Number(data.balance ?? 0),
    bonusBalance: Number(data.bonusBalance ?? 0),
    referralBalance: Number(data.referralBalance ?? 0),
    frozen: Boolean(data.frozen),
    exists: true,
    pendingDepositTotal: Number(data.pendingDepositTotal ?? 0),
    depositWagerProgress: Number(data.depositWagerProgress ?? 0),
    bonusWagerRequired: Number(data.bonusWagerRequired ?? 0),
    bonusWagerProgress: Number(data.bonusWagerProgress ?? 0),
  };
}

export function walletWrite(
  tx: FirebaseFirestore.Transaction,
  wallet: {
    balance: number;
    bonusBalance: number;
    referralBalance?: number;
    frozen: boolean;
    exists: boolean;
    pendingDepositTotal?: number;
    depositWagerProgress?: number;
    bonusWagerRequired?: number;
    bonusWagerProgress?: number;
  },
  args: MoveMoneyArgs
): number {
  const amount = round2(args.amount);
  if (!Number.isFinite(amount) || amount === 0) {
    throw new HttpsError("invalid-argument", "Invalid amount.");
  }

  const cashBefore = round2(wallet.balance);
  const bonusBefore = round2(wallet.bonusBalance);
  let meta = args.meta ?? {};

  if (amount < 0) {
    if (wallet.frozen && !args.ignoreFrozen) {
      throw new HttpsError("failed-precondition", "Wallet is frozen.");
    }
    const need = Math.abs(amount);
    // Withdrawals / explicit cash-only: never pay out bonusBalance.
    const cashOnly =
      args.debitCashOnly === true ||
      args.type === "withdrawal" ||
      args.type === "referral_withdrawal";
    if (cashOnly) {
      if (wallet.balance < need) {
        throw new HttpsError("failed-precondition", "Insufficient balance.");
      }
      wallet.balance = round2(wallet.balance - need);
      meta = { ...meta, fromBonus: 0, fromCash: need };
    } else {
      const total = round2(wallet.balance + wallet.bonusBalance);
      if (total < need) {
        throw new HttpsError("failed-precondition", "Insufficient balance.");
      }
      // Bets: spend bonus first, then cash (playable pot).
      const fromBonus = Math.min(wallet.bonusBalance, need);
      const fromCash = round2(need - fromBonus);
      wallet.bonusBalance = round2(wallet.bonusBalance - fromBonus);
      wallet.balance = round2(wallet.balance - fromCash);
      meta = { ...meta, fromBonus, fromCash };
    }
  } else if (args.creditAsBonus) {
    wallet.bonusBalance = round2(wallet.bonusBalance + amount);
  } else {
    wallet.balance = round2(wallet.balance + amount);
  }

  if (wallet.balance < 0 || wallet.bonusBalance < 0) {
    throw new HttpsError("failed-precondition", "Wallet balance cannot go negative.");
  }

  tx.set(
    db.doc(`wallets/${args.uid}`),
    {
      balance: wallet.balance,
      bonusBalance: wallet.bonusBalance,
      referralBalance: round2(wallet.referralBalance ?? 0),
      currency: "GMD",
      frozen: wallet.frozen,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  tx.set(db.collection("transactions").doc(), {
    userId: args.uid,
    type: args.type,
    amount,
    balanceBefore: cashBefore,
    balanceAfter: wallet.balance,
    reference: txnReference(),
    status: "completed",
    description: args.description,
    meta: { bonusBefore, bonusAfter: wallet.bonusBalance, ...meta },
    createdAt: FieldValue.serverTimestamp(),
  });

  bumpPlayerAccountStats(tx, args.uid, args.type, amount);
  tx.set(
    db.doc(`users/${args.uid}`),
    { "stats.walletCash": round2(wallet.balance) },
    { merge: true }
  );

  wallet.exists = true;
  return wallet.balance;
}

/**
 * Lifetime account-book counters on users/{uid}.stats (deposits, withdrawals,
 * bets, wins). Kept in sync with every walletWrite so list UIs stay cheap.
 */
export function bumpPlayerAccountStats(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  type: string,
  amount: number
): void {
  const abs = round2(Math.abs(amount));
  if (!uid || abs <= 0) return;
  let field: "totalDeposits" | "totalWithdrawals" | "totalBets" | "totalWins" | null = null;
  switch (type) {
    case "deposit":
      field = "totalDeposits";
      break;
    case "withdrawal":
      field = "totalWithdrawals";
      break;
    case "bet":
      field = "totalBets";
      break;
    case "win":
      field = "totalWins";
      break;
    default:
      return;
  }
  tx.set(
    db.doc(`users/${uid}`),
    { [`stats.${field}`]: FieldValue.increment(abs) },
    { merge: true }
  );
}

/** Increment platform-wide counters (inside a transaction). */
export function bumpPlatformStats(
  tx: FirebaseFirestore.Transaction,
  fields: Record<string, number>
): void {
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== 0) updates[k] = FieldValue.increment(v);
  }
  if (Object.keys(updates).length > 0) {
    tx.set(db.doc("stats/platform"), updates, { merge: true });
  }
}

/** Increment per-day platform stats (inside a transaction). */
export function bumpDailyStats(
  tx: FirebaseFirestore.Transaction,
  date: string,
  fields: Record<string, number>
): void {
  const updates: Record<string, unknown> = { date };
  let any = false;
  for (const [k, v] of Object.entries(fields)) {
    if (v !== 0) {
      updates[k] = FieldValue.increment(v);
      any = true;
    }
  }
  if (any) tx.set(db.doc(`dailyStats/${date}`), updates, { merge: true });
}

/** Track new customer accounts opened today — platform total + per-agent attribution. */
export function recordCustomersOpened(
  tx: FirebaseFirestore.Transaction,
  date: string,
  ancestorIds: string[],
): void {
  bumpDailyStats(tx, date, { newCustomers: 1 });
  for (const agentId of ancestorIds) {
    tx.set(
      db.doc(`agentDailyStats/${agentId}_${date}`),
      {
        agentId,
        date,
        customersOpened: FieldValue.increment(1),
      },
      { merge: true },
    );
  }
}

/** Cash stake of a bet — bonus chips are not BETESE profit and must not count as GGR. */
export function betCashStake(
  amount: number,
  meta?: { fromCash?: unknown } | null
): number {
  const abs = round2(Math.abs(Number(amount) || 0));
  if (abs <= 0) return 0;
  const fromCash = Number(meta?.fromCash);
  if (Number.isFinite(fromCash) && fromCash >= 0) return round2(Math.min(fromCash, abs));
  return abs;
}

/** Increment an agent's dashboard stats (inside a transaction). */
export function bumpAgentStats(
  tx: FirebaseFirestore.Transaction,
  agentId: string,
  fields: Record<string, number>
): void {
  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== 0) updates[`stats.${k}`] = FieldValue.increment(v);
  }
  if (Object.keys(updates).length > 0) {
    tx.update(db.doc(`users/${agentId}`), updates);
  }
}

/**
 * Per-agent per-player per-day GGR rows that the nightly commission job
 * consumes. Deterministic ID makes every update idempotent-friendly.
 */
export function bumpAgentGgr(
  tx: FirebaseFirestore.Transaction,
  ancestors: string[],
  playerId: string,
  date: string,
  fields: { bets?: number; wins?: number }
): void {
  for (const agentId of ancestors) {
    const id = `${agentId}_${playerId}_${date}`;
    tx.set(
      db.doc(`agentDailyGgr/${id}`),
      {
        agentId,
        playerId,
        date,
        bets: FieldValue.increment(round2(fields.bets ?? 0)),
        wins: FieldValue.increment(round2(fields.wins ?? 0)),
      },
      { merge: true }
    );
  }
}

/**
 * Attribute real-money play to every agent on the player. `cashBets` must be
 * the cash portion of the stake (not bonus). Wins are cash credits.
 */
export function creditAgentCustomerPlay(
  tx: FirebaseFirestore.Transaction,
  ancestors: string[],
  playerId: string,
  date: string,
  fields: { cashBets?: number; wins?: number }
): void {
  const cashBets = round2(fields.cashBets ?? 0);
  const wins = round2(fields.wins ?? 0);
  if (cashBets === 0 && wins === 0) return;
  bumpAgentGgr(tx, ancestors, playerId, date, {
    ...(cashBets !== 0 ? { bets: cashBets } : {}),
    ...(wins !== 0 ? { wins } : {}),
  });
  for (const agentId of ancestors) {
    const stats: Record<string, number> = {};
    if (cashBets !== 0) stats.totalBets = cashBets;
    if (wins !== 0) stats.totalWins = wins;
    bumpAgentStats(tx, agentId, stats);
  }
}
