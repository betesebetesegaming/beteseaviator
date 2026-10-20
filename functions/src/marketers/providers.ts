/**
 * Product adapters for Betese Marketers. Every adapter is READ-ONLY toward the betting
 * systems: it never writes users, phones, wallets or transactions.
 */
import * as admin from "firebase-admin";
import { phoneStorageKeys } from "../phone";
import { CURRENCY, toMinor, type Product } from "./domain";

export type FindResult =
  | { state: "matched"; accountId: string; registeredAtMs: number | null }
  | { state: "not_found" }
  | { state: "ambiguous"; count: number }
  | { state: "unavailable"; reason: string };

export interface ProviderDeposit {
  externalTxnId: string;
  amountMinor: number;
  currency: string;
  kind: "deposit" | "reversal";
  depositedAtMs: number;
  channel: string;
}

export type FetchResult =
  | { state: "ok"; deposits: ProviderDeposit[]; nextSinceMs: number; complete: boolean }
  | { state: "unavailable"; reason: string };

export interface ProductProvider {
  product: Product;
  connected: boolean;
  /** Exact access or documentation still needed before this provider can verify anything. */
  missing: string[];
  findAccount(phoneKey: string): Promise<FindResult>;
  fetchDeposits(accountId: string, sinceMs: number): Promise<FetchResult>;
  hasDepositsBefore(accountId: string, beforeMs: number): Promise<boolean | null>;
}

export type Providers = Record<Product, ProductProvider>;

const LOOKUP_TIMEOUT_MS = 8000;
const PAGE = 200;
const MAX_PAGES = 5;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

const EXCLUDED_SOURCES = new Set(["wallet_repair", "qtech_repair", "qtech_cw_certification"]);

/** Ledger rows that are real customer money in — not demo resets, repairs or test funding. */
export function aviatorLedgerDeposit(id: string, row: admin.firestore.DocumentData): ProviderDeposit | null {
  const amount = Number(row.amount);
  if (row.type !== "deposit" || row.status !== "completed" || !(amount > 0)) return null;
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const source = String(meta.source ?? "").toLowerCase();
  if (meta.demo || EXCLUDED_SOURCES.has(source)) return null;
  if (String(row.description ?? "").toLowerCase().includes("wallet repair")) return null;
  const ts = row.createdAt as admin.firestore.Timestamp | undefined;
  const depositedAtMs = typeof ts?.toMillis === "function" ? ts.toMillis() : NaN;
  if (!Number.isFinite(depositedAtMs)) return null;
  const channel =
    source === "modempay"
      ? "modempay"
      : meta.otcCash
        ? "shop_cash"
        : meta.from
          ? "agent_transfer"
          : meta.requestId
            ? "payment_request"
            : "other";
  return { externalTxnId: id, amountMinor: toMinor(amount), currency: CURRENCY, kind: "deposit", depositedAtMs, channel };
}

/** Betese Aviator lives in this same Firebase project — verified straight from its own collections. */
export function aviatorProvider(db: admin.firestore.Firestore): ProductProvider {
  return {
    product: "aviator",
    connected: true,
    missing: [],
    async findAccount(phoneKey) {
      try {
        return await withTimeout(
          (async (): Promise<FindResult> => {
            const keys = phoneStorageKeys(phoneKey);
            const uids = new Set<string>();
            const snaps = await Promise.all(keys.map((k) => db.doc(`phones/${k}`).get()));
            for (const s of snaps) {
              const uid = String(s.data()?.uid ?? "");
              if (uid) uids.add(uid);
            }
            if (uids.size === 0 && keys.length) {
              const byPhone = await db.collection("users").where("phone", "in", keys.slice(0, 10)).limit(3).get();
              for (const d of byPhone.docs) uids.add(d.id);
            }
            const players: { id: string; data: admin.firestore.DocumentData }[] = [];
            for (const uid of uids) {
              const u = await db.doc(`users/${uid}`).get();
              if (u.exists && u.data()?.role === "player") players.push({ id: u.id, data: u.data()! });
            }
            if (players.length === 0) return { state: "not_found" };
            if (players.length > 1) return { state: "ambiguous", count: players.length };
            const created = players[0].data.createdAt as admin.firestore.Timestamp | undefined;
            return {
              state: "matched",
              accountId: players[0].id,
              registeredAtMs: typeof created?.toMillis === "function" ? created.toMillis() : null,
            };
          })(),
          LOOKUP_TIMEOUT_MS,
        );
      } catch (e) {
        // A timeout or outage is "unavailable", never "not found".
        return { state: "unavailable", reason: e instanceof Error ? e.message : "lookup failed" };
      }
    },
    async fetchDeposits(accountId, sinceMs) {
      try {
        const deposits: ProviderDeposit[] = [];
        let maxSeen = sinceMs;
        let last: admin.firestore.QueryDocumentSnapshot | null = null;
        for (let page = 0; page < MAX_PAGES; page++) {
          let q = db
            .collection("transactions")
            .where("userId", "==", accountId)
            .where("type", "==", "deposit")
            .where("createdAt", ">=", admin.firestore.Timestamp.fromMillis(sinceMs))
            .orderBy("createdAt", "desc")
            .limit(PAGE);
          if (last) q = q.startAfter(last);
          const snap = await withTimeout(q.get(), LOOKUP_TIMEOUT_MS);
          for (const d of snap.docs) {
            const ts = d.data().createdAt as admin.firestore.Timestamp | undefined;
            if (typeof ts?.toMillis === "function") maxSeen = Math.max(maxSeen, ts.toMillis());
            const dep = aviatorLedgerDeposit(d.id, d.data());
            if (dep) deposits.push(dep);
          }
          if (snap.size < PAGE) return { state: "ok", deposits, nextSinceMs: maxSeen, complete: true };
          last = snap.docs[snap.docs.length - 1];
        }
        // Too many rows for one pass: keep the cursor where it was; re-runs are idempotent.
        return { state: "ok", deposits, nextSinceMs: sinceMs, complete: false };
      } catch (e) {
        return { state: "unavailable", reason: e instanceof Error ? e.message : "fetch failed" };
      }
    },
    async hasDepositsBefore(accountId, beforeMs) {
      try {
        const snap = await withTimeout(
          db
            .collection("transactions")
            .where("userId", "==", accountId)
            .where("type", "==", "deposit")
            .where("createdAt", "<", admin.firestore.Timestamp.fromMillis(beforeMs))
            .orderBy("createdAt", "desc")
            .limit(20)
            .get(),
          LOOKUP_TIMEOUT_MS,
        );
        return snap.docs.some((d) => aviatorLedgerDeposit(d.id, d.data()) !== null);
      } catch {
        return null;
      }
    },
  };
}

/** No Football system, API or credentials were available — every lookup stays unverified. */
export const FOOTBALL_MISSING = [
  "Football (betesegaming.com) backend location and owner of its database",
  "API documentation for looking up an account by phone, with its registration timestamp",
  "API documentation for listing settled deposits and reversals per account (amounts, currency, timestamps, transaction IDs, cursor)",
  "Server-to-server credentials (service account or API key) with read-only scope",
  "Webhook signing secret, or an agreed scheduled-sync window, for deposit events",
];

export const footballProvider: ProductProvider = {
  product: "football",
  connected: false,
  missing: FOOTBALL_MISSING,
  async findAccount() {
    return { state: "unavailable", reason: "Football system not connected" };
  },
  async fetchDeposits() {
    return { state: "unavailable", reason: "Football system not connected" };
  },
  async hasDepositsBefore() {
    return null;
  },
};

export const SMS_MISSING = [
  "SMS provider with per-message delivery reports (current promo path posts to betesepmu sendOtp and has none)",
  "Signed delivery-report webhook (signing secret) and provider idempotency keys",
  "Approved sender ID",
  "Price per SMS segment for cost estimates",
  "Opt-out keyword handling (inbound STOP) or an agreed opt-out channel",
];
