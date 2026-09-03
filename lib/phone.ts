/** BETESE Gambian mobiles: +220 + 9 local digits. Old 7-digit numbers convert automatically. */

/** Active sign-up / login country */
export type PhoneCountry = "GM";

/** Options shown in the country dropdown */
export type PhoneCountryCode = PhoneCountry | "GH" | "NG";

export const GAMBIA_COUNTRY_CODE = "220";
export const GAMBIA_LOCAL_LENGTH = 9;
export const GAMBIA_LEGACY_LOCAL_LENGTH = 7;

const OPERATOR_PREFIX_BY_START: Record<string, string> = {
  "2": "87",
  "4": "87",
  "7": "87",
  "3": "83",
  "5": "83",
  "6": "86",
  "9": "89",
};

const NEW_OPERATOR_PREFIXES = new Set(["87", "83", "86", "89"]);

export type PhoneCountryMeta = {
  code: PhoneCountryCode;
  label: string;
  dial: string;
  /** Sign-up enabled on BETESE today */
  active: boolean;
  localLength?: number;
  placeholder: string;
};

export const PHONE_COUNTRY_OPTIONS: PhoneCountryMeta[] = [
  {
    code: "GM",
    label: "Gambia",
    dial: "+220",
    active: true,
    localLength: GAMBIA_LOCAL_LENGTH,
    placeholder: "877793854",
  },
  {
    code: "GH",
    label: "Ghana",
    dial: "+233",
    active: false,
    placeholder: "Coming soon",
  },
  {
    code: "NG",
    label: "Nigeria",
    dial: "+234",
    active: false,
    placeholder: "Coming soon",
  },
];

export function isActivePhoneCountry(code: PhoneCountryCode): code is PhoneCountry {
  return code === "GM";
}

export function getPhoneCountryMeta(code: PhoneCountryCode): PhoneCountryMeta {
  return PHONE_COUNTRY_OPTIONS.find((c) => c.code === code) ?? PHONE_COUNTRY_OPTIONS[0];
}

export const PHONE_HINT =
  "Enter your Gambian mobile: 7 or 9 digits. Old numbers convert automatically (e.g. 7793854 → 877793854).";

/** @deprecated Use PHONE_HINT */
export const GAMBIA_PHONE_HINT = PHONE_HINT;

export const PHONE_PLACEHOLDER: Record<PhoneCountry, string> = {
  GM: "e.g. 7793854 or 877793854",
};

export const PHONE_LABEL: Record<PhoneCountry, string> = {
  GM: "Phone number",
};

export type ParsedPhone = { country: PhoneCountry; local: string };

function stripLeadingZeros(digits: string): string {
  return digits.replace(/^0+/, "");
}

export function operatorPrefixForLegacyStart(digit: string): string | null {
  return OPERATOR_PREFIX_BY_START[digit] ?? null;
}

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

/** Parse and validate a Gambian mobile number (7-digit old or 9-digit new). */
export function normalizePhoneLocal(
  input: string,
  _preferredCountry: PhoneCountry = "GM"
): ParsedPhone | null {
  const local = extractLocalDigits(input);
  if (!local) return null;
  const canonical = toCanonicalGambiaLocal(local);
  if (!canonical) return null;
  return { country: "GM", local: canonical };
}

/** Storage key in Firestore `phones/{key}` — canonical 9-digit Gambian local number. */
export function normalizePhone(input: string, preferredCountry: PhoneCountry = "GM"): string {
  const parsed = normalizePhoneLocal(input, preferredCountry);
  if (!parsed) return "";
  return parsed.local;
}

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
    const email = `p${key}${PHONE_AUTH_EMAIL_SUFFIX}`;
    if (!emails.includes(email)) emails.push(email);
  }
  return emails;
}

/** E.164 for SMS / payments: +220XXXXXXXXX */
export function normalizePhoneE164(
  input: string,
  preferredCountry: PhoneCountry = "GM"
): string | null {
  const parsed = normalizePhoneLocal(input, preferredCountry);
  if (!parsed) return null;
  return `+${GAMBIA_COUNTRY_CODE}${parsed.local}`;
}

const PHONE_AUTH_EMAIL_SUFFIX = "@phone.beteseaviator.com";

export function phoneToEmail(phoneKey: string): string {
  const key = normalizePhone(phoneKey) || String(phoneKey || "").replace(/\D/g, "");
  return `p${key}${PHONE_AUTH_EMAIL_SUFFIX}`;
}

/** Reverse of phoneToEmail — extracts the stored phone key from a synthetic auth email. */
export function phoneKeyFromAuthEmail(email: string | null | undefined): string | null {
  if (!email?.startsWith("p") || !email.endsWith(PHONE_AUTH_EMAIL_SUFFIX)) return null;
  const key = email.slice(1, -PHONE_AUTH_EMAIL_SUFFIX.length);
  return /^\d+$/.test(key) ? key : null;
}

export function phoneCountryFromKey(_key: string): PhoneCountry {
  return "GM";
}

/** Local digits for the phone input (without country prefix). */
export function displayLocalFromPhoneKey(key: string, _country: PhoneCountry): string {
  const canonical = normalizePhone(key);
  if (canonical) return canonical;
  if (key.startsWith(GAMBIA_COUNTRY_CODE) && key.length >= 10) {
    return key.slice(3);
  }
  return key;
}

export function normalizeGambiaPhoneLocal(input: string): string | null {
  const parsed = normalizePhoneLocal(input, "GM");
  return parsed?.local ?? null;
}

export function normalizeGambiaPhone(input: string): string | null {
  return normalizePhoneE164(input, "GM");
}

export function formatGambiaPhoneLocal(local: string): string {
  const d = normalizeGambiaPhoneLocal(local) ?? local.replace(/\D/g, "");
  if (d.length === GAMBIA_LOCAL_LENGTH) {
    return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
  }
  if (d.length === GAMBIA_LEGACY_LOCAL_LENGTH) {
    return `${d.slice(0, 3)} ${d.slice(3)}`;
  }
  return local;
}

export function formatPhoneDisplay(phoneKey: string): string {
  const local = normalizePhone(phoneKey) || displayLocalFromPhoneKey(phoneKey, "GM");
  if (local.length === GAMBIA_LOCAL_LENGTH || local.length === GAMBIA_LEGACY_LOCAL_LENGTH) {
    return `+${GAMBIA_COUNTRY_CODE} ${formatGambiaPhoneLocal(local)}`;
  }
  return phoneKey;
}
