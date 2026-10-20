/**
 * Betese Marketers — pure domain rules (no Firestore, no network).
 * Kept separate so the security-relevant decisions are unit-tested directly.
 */
import { createHash } from "crypto";
import { normalizePhone, normalizePhoneE164 } from "../phone";

export const PRODUCTS = ["aviator", "football"] as const;
export type Product = (typeof PRODUCTS)[number];

export const CURRENCY = "GMD";

/** Exact hostnames an owner may approve for SMS links and signup buttons. No shorteners, no redirects. */
export const ALLOWED_LINK_HOSTS = [
  "beteseaviator.com",
  "www.beteseaviator.com",
  "betesegaming.com",
  "www.betesegaming.com",
];

export const DEFAULT_LINKS: ApprovedLink[] = [
  { id: "aviator", label: "Betese Aviator", product: "aviator", url: "https://beteseaviator.com/" },
  { id: "football", label: "Betese Football", product: "football", url: "https://betesegaming.com/" },
];

/**
 * Review hint only — never an automatic credit. A registration made up to this long before the
 * marketer recorded the number is flagged "registered shortly before recording" for the owner.
 */
export const DEFAULT_REVIEW_HINT_HOURS = 24;

export const MAX_RECIPIENTS = 500;
export const MAX_BODY = 459; // 3 GSM-7 segments
export const MAX_NOTE = 300;

export interface ApprovedLink {
  id: string;
  label: string;
  product: Product;
  url: string;
}

export class DomainError extends Error {
  constructor(
    public code: "invalid-argument" | "permission-denied" | "failed-precondition" | "not-found" | "already-exists",
    message: string,
  ) {
    super(message);
  }
}

// ---------- phone ----------

/** Canonical 9-digit Gambian key (same normalization as player sign-up). */
export function canonicalPhone(input: unknown): { key: string; e164: string } {
  const raw = String(input ?? "").trim();
  const key = normalizePhone(raw);
  const e164 = normalizePhoneE164(raw);
  if (!key || !e164) {
    throw new DomainError("invalid-argument", "Enter a valid Gambian mobile number.");
  }
  return { key, e164 };
}

// ---------- validation ----------

export function cleanName(input: unknown, min = 2, max = 80): string {
  const name = String(input ?? "").replace(/\s+/g, " ").trim();
  if (name.length < min || name.length > max) {
    throw new DomainError("invalid-argument", `Name must have ${min}–${max} characters.`);
  }
  return name;
}

export function cleanProducts(input: unknown): Product[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new DomainError("invalid-argument", "Choose Football, Aviator, or both.");
  }
  const set = new Set<Product>();
  for (const p of input) {
    if (!PRODUCTS.includes(p as Product)) {
      throw new DomainError("invalid-argument", "Choose Football, Aviator, or both.");
    }
    set.add(p as Product);
  }
  return PRODUCTS.filter((p) => set.has(p));
}

/** Staff credential rule: no short PINs. */
export function assertStaffPassword(password: unknown): string {
  const p = String(password ?? "");
  if (p.length < 10 || p.length > 64) {
    throw new DomainError("invalid-argument", "Password must be 10–64 characters.");
  }
  if (/^\d+$/.test(p)) {
    throw new DomainError("invalid-argument", "Password cannot be only numbers.");
  }
  return p;
}

const URLISH = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|gm|ly|io|co|me|link|app|site|xyz|info|bit)\b)/i;

/** Message text and request notes must never carry their own links — the destination is chosen separately. */
export function assertNoLinks(text: string, field: string): void {
  if (URLISH.test(text)) {
    throw new DomainError("invalid-argument", `${field} cannot contain links. Choose an approved link instead.`);
  }
}

export function cleanText(input: unknown, field: string, max: number, allowEmpty = false): string {
  const text = String(input ?? "").replace(/[\r\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  if (!allowEmpty && !text) throw new DomainError("invalid-argument", `${field} is required.`);
  if (text.length > max) throw new DomainError("invalid-argument", `${field} must be ${max} characters or fewer.`);
  assertNoLinks(text, field);
  return text;
}

// ---------- link policy ----------

const REDIRECT_PARAM = /^(url|uri|redirect|redirect_uri|redirect_url|next|return|returnto|return_to|goto|dest|destination|continue|target|to|out|link|r|u)$/i;

/**
 * Parses an owner-supplied URL and accepts it only if it is plain HTTPS on an allowlisted
 * Betese host — no credentials, ports, redirect parameters or embedded URLs.
 */
export function validateApprovedUrl(raw: unknown): string {
  let url: URL;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    throw new DomainError("invalid-argument", "Enter a full https:// link.");
  }
  if (url.protocol !== "https:") throw new DomainError("invalid-argument", "Links must use https://.");
  if (url.username || url.password) throw new DomainError("invalid-argument", "Links cannot contain credentials.");
  if (url.port) throw new DomainError("invalid-argument", "Links cannot use a custom port.");
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_LINK_HOSTS.includes(host)) {
    throw new DomainError("invalid-argument", `Only ${ALLOWED_LINK_HOSTS.join(", ")} links are allowed.`);
  }
  if (url.pathname.includes("//") || /%2f|%5c|\\/i.test(url.pathname)) {
    throw new DomainError("invalid-argument", "Link path is not allowed.");
  }
  for (const [key, value] of url.searchParams) {
    if (REDIRECT_PARAM.test(key) || /:\/\/|^\/\//.test(value) || URLISH.test(value)) {
      throw new DomainError("invalid-argument", "Links cannot contain redirect parameters.");
    }
  }
  url.hash = "";
  return url.toString();
}

export function validateLinks(input: unknown): ApprovedLink[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 10) {
    throw new DomainError("invalid-argument", "Provide 1–10 approved links.");
  }
  const ids = new Set<string>();
  return input.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    const id = String(r.id ?? "").toLowerCase().trim();
    if (!/^[a-z0-9-]{2,24}$/.test(id) || ids.has(id)) {
      throw new DomainError("invalid-argument", "Each link needs a unique short id (letters, numbers, dashes).");
    }
    ids.add(id);
    const product = String(r.product ?? "") as Product;
    if (!PRODUCTS.includes(product)) throw new DomainError("invalid-argument", "Each link must be for Aviator or Football.");
    return { id, product, label: cleanName(r.label, 2, 40), url: validateApprovedUrl(r.url) };
  });
}

// ---------- SMS segments ----------

const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€\f";

export function smsSegments(text: string): { encoding: "GSM-7" | "UCS-2"; units: number; segments: number } {
  let gsm = true;
  let units = 0;
  for (const ch of text) {
    if (GSM7_BASIC.includes(ch)) units += 1;
    else if (GSM7_EXT.includes(ch)) units += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) {
    return { encoding: "GSM-7", units, segments: units === 0 ? 0 : units <= 160 ? 1 : Math.ceil(units / 153) };
  }
  const utf16 = text.length;
  return { encoding: "UCS-2", units: utf16, segments: utf16 <= 70 ? 1 : Math.ceil(utf16 / 67) };
}

export function composeMessage(body: string, linkUrl: string): string {
  return `${body.trim()}\n${linkUrl}`;
}

export function estimateCost(segments: number, recipients: number, perSegmentMinor: number | null) {
  if (perSegmentMinor == null || !Number.isInteger(perSegmentMinor) || perSegmentMinor < 0) {
    return { currency: CURRENCY, perSegmentMinor: null, totalMinor: null };
  }
  return { currency: CURRENCY, perSegmentMinor, totalMinor: segments * recipients * perSegmentMinor };
}

// ---------- hashes ----------

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function recipientHash(ids: string[]): string {
  return sha256([...ids].sort().join("\n"));
}

export function contentHash(rev: {
  message: string;
  linkUrl: string | null;
  senderId: string | null;
  scheduleAtMs: number | null;
  recipientHash: string;
}): string {
  return sha256(
    JSON.stringify([rev.message, rev.linkUrl, rev.senderId, rev.scheduleAtMs, rev.recipientHash]),
  );
}

// ---------- eligibility + attribution ----------

export interface ContactLike {
  marketerId: string;
  status: "active" | "archived";
  adultConfirmed: boolean;
  consent: { sms: boolean };
}

/** Why a contact may not receive a campaign from this marketer, or null when eligible. */
export function ineligibleReason(contact: ContactLike | null, marketerId: string): string | null {
  if (!contact) return "missing";
  if (contact.marketerId !== marketerId) return "not_owned";
  if (contact.status !== "active") return "archived";
  if (!contact.adultConfirmed) return "adult_unconfirmed";
  if (!contact.consent?.sms) return "no_consent";
  return null;
}

export type Attribution = "new_signup" | "needs_review";
export type ReviewHint = "registered_shortly_before" | "registered_long_before" | "registration_time_unknown";

/**
 * Acquisition is only established automatically when the betting account was registered AFTER
 * the marketer recorded the number. Every earlier (or undated) registration goes to the owner;
 * the hint window only labels it for the review and never credits anything by itself.
 */
export function classifyAttribution(
  registeredAtMs: number | null,
  recordedAtMs: number,
  hintHours = DEFAULT_REVIEW_HINT_HOURS,
): { attribution: Attribution; hint: ReviewHint | null } {
  if (registeredAtMs == null || !Number.isFinite(registeredAtMs)) {
    return { attribution: "needs_review", hint: "registration_time_unknown" };
  }
  if (registeredAtMs >= recordedAtMs) return { attribution: "new_signup", hint: null };
  return {
    attribution: "needs_review",
    hint: registeredAtMs >= recordedAtMs - hintHours * 3600_000 ? "registered_shortly_before" : "registered_long_before",
  };
}

/** GMD amount (2 dp float in the wallet ledger) → integer bututs. */
export function toMinor(amount: number): number {
  return Math.round(Number(amount) * 100);
}

// ---------- date ranges (Gambia = UTC+0) ----------

export type RangeKey = "today" | "week" | "month" | "all" | "custom";

export function resolveRange(
  key: unknown,
  nowMs: number,
  from?: unknown,
  to?: unknown,
): { key: RangeKey; fromMs: number; toMs: number; label: string } {
  const now = new Date(nowMs);
  const day = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = nowMs + 1;
  switch (key) {
    case "today":
      return { key, fromMs: day, toMs: end, label: "Today" };
    case "week": {
      const dow = (now.getUTCDay() + 6) % 7; // Monday = 0
      return { key, fromMs: day - dow * 86400_000, toMs: end, label: "This week" };
    }
    case "month":
      return { key, fromMs: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1), toMs: end, label: "This month" };
    case "custom": {
      const f = Date.parse(`${String(from ?? "")}T00:00:00Z`);
      const t = Date.parse(`${String(to ?? "")}T00:00:00Z`);
      if (!Number.isFinite(f) || !Number.isFinite(t) || t < f) {
        throw new DomainError("invalid-argument", "Choose a valid from/to date.");
      }
      if (t - f > 366 * 86400_000) throw new DomainError("invalid-argument", "Custom range can be at most one year.");
      return { key, fromMs: f, toMs: t + 86400_000, label: `${from} to ${to}` };
    }
    default:
      return { key: "all", fromMs: 0, toMs: end, label: "All time" };
  }
}
