/** Gambia (+220, 7 digits) is primary; Senegal (+221, 9 digits) is also supported. */

export type PhoneCountry = "GM" | "SN";

export const GAMBIA_COUNTRY_CODE = "220";
export const SENEGAL_COUNTRY_CODE = "221";
export const GAMBIA_LOCAL_LENGTH = 7;
export const SENEGAL_LOCAL_LENGTH = 9;

function stripLeadingZeros(digits: string): string {
  return digits.replace(/^0+/, "");
}

export function normalizePhoneLocal(
  input: string,
  preferredCountry: PhoneCountry = "GM"
): { country: PhoneCountry; local: string } | null {
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

export function normalizePhone(input: string, preferredCountry: PhoneCountry = "GM"): string {
  const parsed = normalizePhoneLocal(input, preferredCountry);
  if (!parsed) return "";
  return parsed.country === "GM" ? parsed.local : `${SENEGAL_COUNTRY_CODE}${parsed.local}`;
}

export function normalizePhoneE164(
  input: string,
  preferredCountry: PhoneCountry = "GM"
): string | null {
  const parsed = normalizePhoneLocal(input, preferredCountry);
  if (!parsed) return null;
  const cc = parsed.country === "GM" ? GAMBIA_COUNTRY_CODE : SENEGAL_COUNTRY_CODE;
  return `+${cc}${parsed.local}`;
}

export function normalizeGambiaPhoneLocal(input: string): string | null {
  const parsed = normalizePhoneLocal(input, "GM");
  return parsed?.country === "GM" ? parsed.local : null;
}

export function normalizeGambiaPhone(input: string): string | null {
  return normalizePhoneE164(input, "GM");
}

export function phoneToEmail(phoneKey: string): string {
  return `p${phoneKey}@phone.beteseaviator.com`;
}
