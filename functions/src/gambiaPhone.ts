/** Gambia mobile numbers are exactly 7 digits locally (country code +220). */

export const GAMBIA_COUNTRY_CODE = "220";
export const GAMBIA_LOCAL_LENGTH = 7;

export function normalizeGambiaPhoneLocal(input: string): string | null {
  const raw = String(input || "").trim();
  if (!raw) return null;

  let digits = raw.replace(/\D/g, "");

  if (digits.startsWith(GAMBIA_COUNTRY_CODE)) {
    digits = digits.slice(3);
  }

  digits = digits.replace(/^0+/, "");

  if (digits.length !== GAMBIA_LOCAL_LENGTH) return null;
  if (!/^\d{7}$/.test(digits)) return null;

  return digits;
}

export function normalizeGambiaPhone(input: string): string | null {
  const local = normalizeGambiaPhoneLocal(input);
  return local ? `+${GAMBIA_COUNTRY_CODE}${local}` : null;
}
