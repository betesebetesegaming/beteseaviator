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
  ancestors: string[];
  status: "active" | "suspended";
}

export const RESERVED_SLUGS = ["www", "admin", "api", "mail", "ftp", "betese", "app"];

export const PROVIDERS = ["wave", "afrimoney", "aps", "qmoney"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const DEFAULT_SETTINGS = {
  subAgentRate: 0.05,
  superAgentRate: 0.03,
  minBet: 10,
  maxBet: 100_000,
  minDeposit: 100,
  minWithdrawal: 500,
  minAutoCashout: 1.01,
  maxAutoCashout: 100,
  providers: { wave: true, afrimoney: true, aps: true, qmoney: true } as Record<string, boolean>,
};

export type Settings = typeof DEFAULT_SETTINGS;

export function normalizePhone(input: string): string {
  return String(input).replace(/\D/g, "").replace(/^0+/, "");
}

export function phoneToEmail(phone: string): string {
  return `p${normalizePhone(phone)}@phone.beteseaviator.com`;
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
  return { ...DEFAULT_SETTINGS, ...(snap.data() ?? {}) } as Settings;
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
  type: "deposit" | "withdrawal" | "bet" | "win" | "commission" | "transfer" | "refund";
  description: string;
  meta?: Record<string, unknown>;
  /** debits normally blocked on frozen wallets; refunds may still land */
  ignoreFrozen?: boolean;
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
): Promise<{ balance: number; frozen: boolean; exists: boolean }> {
  const snap = await tx.get(db.doc(`wallets/${uid}`));
  if (!snap.exists) return { balance: 0, frozen: false, exists: false };
  const data = snap.data()!;
  return {
    balance: Number(data.balance ?? 0),
    frozen: Boolean(data.frozen),
    exists: true,
  };
}

export function walletWrite(
  tx: FirebaseFirestore.Transaction,
  wallet: { balance: number; frozen: boolean; exists: boolean },
  args: MoveMoneyArgs
): number {
  const amount = round2(args.amount);
  if (!Number.isFinite(amount) || amount === 0) {
    throw new HttpsError("invalid-argument", "Invalid amount.");
  }
  if (amount < 0) {
    if (wallet.frozen && !args.ignoreFrozen) {
      throw new HttpsError("failed-precondition", "Wallet is frozen.");
    }
    if (wallet.balance + amount < 0) {
      throw new HttpsError("failed-precondition", "Insufficient balance.");
    }
  }
  const balanceBefore = round2(wallet.balance);
  const balanceAfter = round2(wallet.balance + amount);

  tx.set(
    db.doc(`wallets/${args.uid}`),
    {
      balance: balanceAfter,
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
    balanceBefore,
    balanceAfter,
    reference: txnReference(),
    status: "completed",
    description: args.description,
    meta: args.meta ?? {},
    createdAt: FieldValue.serverTimestamp(),
  });

  // keep local copy in sync so multiple writes to one wallet in a tx compose
  wallet.balance = balanceAfter;
  wallet.exists = true;
  return balanceAfter;
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
