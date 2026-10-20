import { app } from "./firebase";
import type { Functions } from "firebase/functions";

/** Betese Marketers — one callable; the server authorizes every action. */
let functionsInstance: Functions | null = null;

export async function mk<T = Record<string, unknown>>(action: string, data: Record<string, unknown> = {}): Promise<T> {
  const { httpsCallable, getFunctions } = await import("firebase/functions");
  if (!functionsInstance) functionsInstance = getFunctions(app, "us-central1");
  const res = await httpsCallable<{ action: string; data: Record<string, unknown> }, T>(functionsInstance, "marketers")({
    action,
    data,
  });
  return res.data;
}

export type Product = "aviator" | "football";

export interface ApprovedLink {
  id: string;
  label: string;
  product: Product;
  url: string;
}

export interface MkState {
  me: { uid: string; name: string; role: "owner" | "marketer" };
  links: ApprovedLink[];
  consentWording: string;
  integrations: {
    aviator: { connected: boolean; missing: string[]; lastSync: { lastRunAtMs: number; complete: boolean; errors: number } | null };
    football: { connected: boolean; missing: string[] };
    sms: { connected: boolean; sendingEnabled: boolean; missing: string[] };
  };
  settings?: { referralWindowHours: number; smsPricePerSegmentMinor: number | null; senderId: string | null };
}

export interface AccountState {
  state: "pending" | "matched" | "not_found" | "ambiguous" | "unavailable";
  attribution: "new_signup" | "needs_review" | null;
  decision: "auto" | "pending" | "accepted" | "rejected" | null;
  counted: boolean;
  checkedAtMs: number | null;
  accountId?: string | null;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  products: Product[];
  recordedAtMs: number;
  smsConsent: boolean;
  consentRevokedAtMs: number | null;
  accounts: Partial<Record<Product, AccountState>>;
  verifiedProducts: Product[];
  marketerId?: string;
  marketerName?: string;
}

export interface ProductTotals {
  connected: boolean;
  recorded: number;
  verified: number;
  currency: string;
  depositsMinor: number;
  depositCount: number;
  reversalsMinor: number;
  netMinor: number;
  firstDepositsMinor: number;
  firstDepositCount: number;
  subsequentDepositsMinor: number;
}

export interface Totals {
  recorded: number;
  uniqueVerified: number;
  both: number;
  products: Record<Product, ProductTotals>;
}

export interface Dashboard {
  range: { key: string; label: string; fromMs: number; toMs: number };
  totals: Totals;
  definition: string;
  pendingDisputes?: number;
  byMarketer?: { id: string; name: string; status: string; totals: Totals }[];
}

export interface Revision {
  id: string;
  campaignId: string;
  revision: number;
  status: "pending_review" | "needs_draft" | "approved" | "rejected" | "superseded" | "invalidated";
  sendState: string;
  marketerId: string;
  requestNote: string;
  templateId: string | null;
  body: string;
  linkId: string;
  linkUrl: string;
  message: string;
  senderId: string | null;
  scheduleAtMs: number | null;
  recipientCount: number;
  segments: number;
  encoding: string;
  estimatedCost: { currency: string; perSegmentMinor: number | null; totalMinor: number | null };
  createdAtMs: number;
  reviewNote: string | null;
  invalidReason: string | null;
  approvedAtMs: number | null;
}

export interface Template {
  id: string;
  title: string;
  body: string;
  version: number;
  active: boolean;
}

export type Cursor = { v: unknown; id: string } | null;

export function mkError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? "";
  return msg.replace(/^FirebaseError:\s*/, "") || "Something went wrong.";
}

export function money(minor: number, currency = "GMD"): string {
  const v = (minor / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${currency === "GMD" ? "D" : currency} ${v}`;
}

export function dateTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-GB", { timeZone: "Africa/Banjul", dateStyle: "medium", timeStyle: "short" });
}

export const PRODUCT_LABEL: Record<Product, string> = { aviator: "Aviator", football: "Football" };
