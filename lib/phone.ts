/** Gambia (+220, 7 digits) is primary; Senegal (+221, 9 digits) is also supported. */

export type PhoneCountry = "GM" | "SN";

export const GAMBIA_COUNTRY_CODE = "220";
export const SENEGAL_COUNTRY_CODE = "221";
export const GAMBIA_LOCAL_LENGTH = 7;
export const SENEGAL_LOCAL_LENGTH = 9;

export const PHONE_HINT =
  "Gambia: 7 digits (e.g. 7701234). Senegal: 9 digits (e.g. 771234567) or +221…";

/** @deprecated Use PHONE_HINT */
export const GAMBIA_PHONE_HINT = PHONE_HINT;

export const PHONE_PLACEHOLDER: Record<PhoneCountry, string> = {
  GM: "e.g. 7701234",
  SN: "e.g. 771234567",
};

export const PHONE_LABEL: Record<PhoneCountry, string> = {
  GM: "Phone (Gambia · 7 digits)",
  SN: "Phone (Senegal · 9 digits)",
};

export type ParsedPhone = { country: PhoneCountry; local: string };

function stripLeadingZeros(digits: string): string {
  return digits.replace(/^0+/, "");
}

/** Parse and validate; prefers Gambia when length is ambiguous. */
export function normalizePhoneLocal(
  input: string,
  preferredCountry: PhoneCountry = "GM"
): ParsedPhone | null {
  const raw = String(input || "").trim();
  if (!raw) return null;

  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith(SENEGAL_COUNTRY_CODE)) {
    const local = stripLeadingZeros(digits.slice(3));
    if (local.length !== SENEGAL_LOCAL_LENGTH || !/^\d{9}$/.test(local)) return null;
    return { country: "SN", local };
  }

  if (digits.startsWith(GAMBIA_COUNTRY_CODE)) {
    const local = stripLeadingZeros(digits.slice(3));
    if (local.length !== GAMBIA_LOCAL_LENGTH || !/^\d{7}$/.test(local)) return null;
    return { country: "GM", local };
  }

  digits = stripLeadingZeros(digits);

  if (digits.length === SENEGAL_LOCAL_LENGTH && /^\d{9}$/.test(digits)) {
    return { country: "SN", local: digits };
  }

  if (digits.length === GAMBIA_LOCAL_LENGTH && /^\d{7}$/.test(digits)) {
    return { country: "GM", local: digits };
  }

  if (preferredCountry === "SN" && digits.length === SENEGAL_LOCAL_LENGTH) {
    return /^\d{9}$/.test(digits) ? { country: "SN", local: digits } : null;
  }

  if (preferredCountry === "GM" && digits.length === GAMBIA_LOCAL_LENGTH) {
    return /^\d{7}$/.test(digits) ? { country: "GM", local: digits } : null;
  }

  return null;
}

/** Storage key in Firestore `phones/{key}` — GM: 7 digits, SN: 221 + 9 digits. */
export function normalizePhone(input: string, preferredCountry: PhoneCountry = "GM"): string {
  const parsed = normalizePhoneLocal(input, preferredCountry);
  if (!parsed) return "";
  return parsed.country === "GM" ? parsed.local : `${SENEGAL_COUNTRY_CODE}${parsed.local}`;
}

/** E.164 for SMS / payments: +220XXXXXXX or +221XXXXXXXXX */
export function normalizePhoneE164(
  input: string,
  preferredCountry: PhoneCountry = "GM"
): string | null {
  const parsed = normalizePhoneLocal(input, preferredCountry);
  if (!parsed) return null;
  const cc = parsed.country === "GM" ? GAMBIA_COUNTRY_CODE : SENEGAL_COUNTRY_CODE;
  return `+${cc}${parsed.local}`;
}

export function phoneToEmail(phoneKey: string): string {
  return `p${phoneKey}@phone.beteseaviator.com`;
}

/** Gambia-only helpers (payments default). */
export function normalizeGambiaPhoneLocal(input: string): string | null {
  const parsed = normalizePhoneLocal(input, "GM");
  return parsed?.country === "GM" ? parsed.local : null;
}

export function normalizeGambiaPhone(input: string): string | null {
  return normalizePhoneE164(input, "GM");
}

export function formatGambiaPhoneLocal(local: string): string {
  const d = normalizeGambiaPhoneLocal(local) ?? local.replace(/\D/g, "");
  if (d.length !== GAMBIA_LOCAL_LENGTH) return local;
  return `${d.slice(0, 3)} ${d.slice(3)}`;
}

export function formatPhoneDisplay(phoneKey: string): string {
  if (phoneKey.length === GAMBIA_LOCAL_LENGTH) {
    return `+${GAMBIA_COUNTRY_CODE} ${formatGambiaPhoneLocal(phoneKey)}`;
  }
  if (phoneKey.startsWith(SENEGAL_COUNTRY_CODE) && phoneKey.length === 12) {
    const local = phoneKey.slice(3);
    return `+${SENEGAL_COUNTRY_CODE} ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
  }
  return phoneKey;
}
