import * as admin from "firebase-admin";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

export const db = admin.firestore();
export const rtdb = admin.database();
export const auth = admin.auth();
export const FieldValue = admin.firestore.FieldValue;

export type Role = "admin" | "super_agent" | "sub_agent" | "player";

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
}

export const RESERVED_SLUGS = ["www", "admin", "api", "mail", "ftp", "betese", "app"];

export const PROVIDERS = ["wave", "afrimoney", "aps", "qmoney"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const DEFAULT_SETTINGS = {
  subAgentRate: 0.05,
  superAgentRate: 0.03,
  apiProviderRate: 0.15,
  apiProviderName: "API Provider",
  minBet: 10,
  maxBet: 100_000,
  minDeposit: 100,
  minWithdrawal: 500,
  minAutoCashout: 1.01,
  maxAutoCashout: 100,
  providers: { wave: true, afrimoney: true, aps: true, qmoney: true } as Record<string, boolean>,
  bonuses: {
    firstDeposit: { enabled: true, percent: 0.5, maxAmount: 500, minDeposit: 100 },
    weeklyCrash: { enabled: true, percent: 0.1, maxAmount: 200, minDeposit: 200 },
    weekend: {
      enabled: true,
      percent: 0.25,
      maxAmount: 300,
      minDeposit: 100,
      fridayStartHour: 18,
      sundayEndHour: 23,
    },
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

export function todayIso(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function txnReference(): string {
  return `TXN-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

export async function getSettings(): Promise<Settings> {
  const snap = await db.doc("settings/platform").get();
  const data = snap.data() ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...data,
    providers: { ...DEFAULT_SETTINGS.providers, ...(data.providers ?? {}) },
    bonuses: {
      firstDeposit: { ...DEFAULT_SETTINGS.bonuses.firstDeposit, ...(data.bonuses?.firstDeposit ?? {}) },
      weeklyCrash: { ...DEFAULT_SETTINGS.bonuses.weeklyCrash, ...(data.bonuses?.weeklyCrash ?? {}) },
      weekend: { ...DEFAULT_SETTINGS.bonuses.weekend, ...(data.bonuses?.weekend ?? {}) },
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
  if (!roles.includes(profile.role)) {
    throw new HttpsError("permission-denied", "You are not allowed to do this.");
  }
  return { uid, profile };
}

interface MoveMoneyArgs {
  uid: string;
  amount: number; // positive credit, negative debit
  type: "deposit" | "withdrawal" | "bet" | "win" | "commission" | "transfer" | "refund" | "bonus";
  description: string;
  meta?: Record<string, unknown>;
  /** debits normally blocked on frozen wallets; refunds may still land */
  ignoreFrozen?: boolean;
  /** bonus credits land in bonusBalance (for betting only, not withdrawal) */
  creditAsBonus?: boolean;
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
): Promise<{ balance: number; bonusBalance: number; frozen: boolean; exists: boolean }> {
  const snap = await tx.get(db.doc(`wallets/${uid}`));
  if (!snap.exists) return { balance: 0, bonusBalance: 0, frozen: false, exists: false };
  const data = snap.data()!;
  return {
    balance: Number(data.balance ?? 0),
    bonusBalance: Number(data.bonusBalance ?? 0),
    frozen: Boolean(data.frozen),
    exists: true,
  };
}

export function walletWrite(
  tx: FirebaseFirestore.Transaction,
  wallet: { balance: number; bonusBalance: number; frozen: boolean; exists: boolean },
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
    const total = round2(wallet.balance + wallet.bonusBalance);
    if (total < need) {
      throw new HttpsError("failed-precondition", "Insufficient balance.");
    }
    const fromBonus = Math.min(wallet.bonusBalance, need);
    const fromCash = round2(need - fromBonus);
    wallet.bonusBalance = round2(wallet.bonusBalance - fromBonus);
    wallet.balance = round2(wallet.balance - fromCash);
    meta = { ...meta, fromBonus, fromCash };
  } else if (args.creditAsBonus) {
    wallet.bonusBalance = round2(wallet.bonusBalance + amount);
  } else {
    wallet.balance = round2(wallet.balance + amount);
  }

  tx.set(
    db.doc(`wallets/${args.uid}`),
    {
      balance: wallet.balance,
      bonusBalance: wallet.bonusBalance,
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

  wallet.exists = true;
  return wallet.balance;
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
