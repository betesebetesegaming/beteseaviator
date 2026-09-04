/** BETESE Gambian mobiles: +220 + 9 local digits. Old 7-digit numbers convert automatically. */

export type PhoneCountry = "GM";

export const GAMBIA_COUNTRY_CODE = "220";
/** New national mobile length (operator prefix + old 7-digit number). */
export const GAMBIA_LOCAL_LENGTH = 9;
/** Pre-cutover local length. Still accepted and expanded. */
export const GAMBIA_LEGACY_LOCAL_LENGTH = 7;

/**
 * Gambia numbering cutover: insert a 2-digit operator code so local numbers
 * become 9 digits.
 *   Africell (7, 2, 4) → 87    e.g. 7793854 → 877793854
 *   QCell    (3, 5)    → 83
 *   Comium   (6, 8)    → 86
 *   Gamcel   (9)       → 89
 */
const OPERATOR_PREFIX_BY_START: Record<string, string> = {
  "2": "87",
  "4": "87",
  "7": "87",
  "3": "83",
  "5": "83",
  "6": "86",
  "8": "86",
  "9": "89",
};

const NEW_OPERATOR_PREFIXES = new Set(["87", "83", "86", "89"]);

function stripLeadingZeros(digits: string): string {
  return digits.replace(/^0+/, "");
}

export function operatorPrefixForLegacyStart(digit: string): string | null {
  return OPERATOR_PREFIX_BY_START[digit] ?? null;
}

/** Expand a 7-digit local number, or validate an already-9-digit number. */
export function toCanonicalGambiaLocal(localDigits: string): string | null {
  const d = stripLeadingZeros(String(localDigits || "").replace(/\D/g, ""));
  if (!d) return null;

  if (d.length === GAMBIA_LOCAL_LENGTH) {
    const prefix = d.slice(0, 2);
    const rest = d.slice(2);
    if (!NEW_OPERATOR_PREFIXES.has(prefix) || rest.length !== GAMBIA_LEGACY_LOCAL_LENGTH) return null;
    const expected = operatorPrefixForLegacyStart(rest[0] ?? "");
    if (expected !== prefix) return null;
    return d;
  }

  if (d.length === GAMBIA_LEGACY_LOCAL_LENGTH) {
    const prefix = operatorPrefixForLegacyStart(d[0] ?? "");
    if (!prefix) return null;
    return `${prefix}${d}`;
  }

  return null;
}

/** Old 7-digit form of a canonical 9-digit local number. */
export function legacyGambiaLocal(canonicalOrLocal: string): string | null {
  const d = stripLeadingZeros(String(canonicalOrLocal || "").replace(/\D/g, ""));
  if (d.length === GAMBIA_LEGACY_LOCAL_LENGTH) return d;
  if (d.length === GAMBIA_LOCAL_LENGTH && NEW_OPERATOR_PREFIXES.has(d.slice(0, 2))) {
    return d.slice(2);
  }
  return null;
}

function extractLocalDigits(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith(GAMBIA_COUNTRY_CODE)) {
    return stripLeadingZeros(digits.slice(GAMBIA_COUNTRY_CODE.length));
  }
  return stripLeadingZeros(digits);
}

export function normalizePhoneLocal(
  input: string,
  _preferredCountry: PhoneCountry = "GM"
): { country: PhoneCountry; local: string } | null {
  const local = extractLocalDigits(input);
  if (!local) return null;
  const canonical = toCanonicalGambiaLocal(local);
  if (!canonical) return null;
  return { country: "GM", local: canonical };
}

/** Storage key — canonical 9-digit Gambian local number. */
export function normalizePhone(input: string, preferredCountry: PhoneCountry = "GM"): string {
  const parsed = normalizePhoneLocal(input, preferredCountry);
  if (!parsed) return "";
  return parsed.local;
}

/**
 * All Firestore `phones/{key}` documents that may exist for one number
 * (new 9-digit key first, then legacy 7-digit).
 */
export function phoneStorageKeys(input: string): string[] {
  const canonical = normalizePhone(input);
  if (!canonical) {
    const digits = String(input || "").replace(/\D/g, "");
    return digits ? [digits] : [];
  }
  const keys = [canonical];
  const legacy = legacyGambiaLocal(canonical);
  if (legacy && legacy !== canonical) keys.push(legacy);
  return keys;
}

export function phoneAuthEmails(input: string): string[] {
  const emails: string[] = [];
  for (const key of phoneStorageKeys(input)) {
    const email = `p${key}@phone.beteseaviator.com`;
    if (!emails.includes(email)) emails.push(email);
  }
  return emails;
}

/** E.164 for SMS / payments: +220XXXXXXXXX (9 local digits). */
export function normalizePhoneE164(
  input: string,
  preferredCountry: PhoneCountry = "GM"
): string | null {
  const parsed = normalizePhoneLocal(input, preferredCountry);
  if (!parsed) return null;
  return `+${GAMBIA_COUNTRY_CODE}${parsed.local}`;
}

/** Africell / OTP doc id: 220 + canonical 9-digit local. */
export function toOtpMsisdn(input: string): string | null {
  const local = normalizePhone(input);
  if (!local) return null;
  return `${GAMBIA_COUNTRY_CODE}${local}`;
}

export function otpMsisdnCandidates(input: string): string[] {
  return phoneStorageKeys(input)
    .filter((key) => key.length === GAMBIA_LOCAL_LENGTH || key.length === GAMBIA_LEGACY_LOCAL_LENGTH)
    .map((key) => `${GAMBIA_COUNTRY_CODE}${key}`);
}

export function isGambianPhoneKey(phone: string): boolean {
  return Boolean(normalizePhone(phone));
}

export function normalizeGambiaPhoneLocal(input: string): string | null {
  const parsed = normalizePhoneLocal(input, "GM");
  return parsed?.local ?? null;
}

export function normalizeGambiaPhone(input: string): string | null {
  return normalizePhoneE164(input, "GM");
}

export function phoneToEmail(phoneKey: string): string {
  const key = normalizePhone(phoneKey) || String(phoneKey || "").replace(/\D/g, "");
  return `p${key}@phone.beteseaviator.com`;
}
