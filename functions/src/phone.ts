/** BETESE accepts Gambian mobile numbers only (+220, 7 local digits). Africell OTP required for all accounts. */

export type PhoneCountry = "GM";

export const GAMBIA_COUNTRY_CODE = "220";
export const GAMBIA_LOCAL_LENGTH = 7;

function stripLeadingZeros(digits: string): string {
  return digits.replace(/^0+/, "");
}

export function normalizePhoneLocal(
  input: string,
  _preferredCountry: PhoneCountry = "GM"
): { country: PhoneCountry; local: string } | null {
  const raw = String(input || "").trim();
  if (!raw) return null;

  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith(GAMBIA_COUNTRY_CODE)) {
    const local = stripLeadingZeros(digits.slice(3));
    if (local.length !== GAMBIA_LOCAL_LENGTH || !/^\d{7}$/.test(local)) return null;
    return { country: "GM", local };
  }

  digits = stripLeadingZeros(digits);
  if (digits.length === GAMBIA_LOCAL_LENGTH && /^\d{7}$/.test(digits)) {
    return { country: "GM", local: digits };
  }

  return null;
}

export function normalizePhone(input: string, preferredCountry: PhoneCountry = "GM"): string {
  const parsed = normalizePhoneLocal(input, preferredCountry);
  if (!parsed) return "";
  return parsed.local;
}

export function normalizePhoneE164(
  input: string,
  preferredCountry: PhoneCountry = "GM"
): string | null {
  const parsed = normalizePhoneLocal(input, preferredCountry);
  if (!parsed) return null;
  return `+${GAMBIA_COUNTRY_CODE}${parsed.local}`;
}

export function normalizeGambiaPhoneLocal(input: string): string | null {
  const parsed = normalizePhoneLocal(input, "GM");
  return parsed?.local ?? null;
}

export function normalizeGambiaPhone(input: string): string | null {
  return normalizePhoneE164(input, "GM");
}

export function phoneToEmail(phoneKey: string): string {
  return `p${phoneKey}@phone.beteseaviator.com`;
}
