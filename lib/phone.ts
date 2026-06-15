/** Gambia (+220) and Senegal (+221) are active; Ghana & Nigeria listed for future use. */

/** Countries that accept sign-up / login today */
export type PhoneCountry = "GM" | "SN";

/** All options shown in the country dropdown */
export type PhoneCountryCode = PhoneCountry | "GH" | "NG";

export const GAMBIA_COUNTRY_CODE = "220";
export const SENEGAL_COUNTRY_CODE = "221";
export const GAMBIA_LOCAL_LENGTH = 7;
export const SENEGAL_LOCAL_LENGTH = 9;

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
    placeholder: "7701234",
  },
  {
    code: "SN",
    label: "Senegal",
    dial: "+221",
    active: true,
    localLength: SENEGAL_LOCAL_LENGTH,
    placeholder: "771234567",
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
  return code === "GM" || code === "SN";
}

export function getPhoneCountryMeta(code: PhoneCountryCode): PhoneCountryMeta {
  return PHONE_COUNTRY_OPTIONS.find((c) => c.code === code) ?? PHONE_COUNTRY_OPTIONS[0];
}

export const PHONE_HINT =
  "Gambia: 7 digits (e.g. 7701234). Senegal: 9 digits (e.g. 771234567).";

/** @deprecated Use PHONE_HINT */
export const GAMBIA_PHONE_HINT = PHONE_HINT;

export const PHONE_PLACEHOLDER: Record<PhoneCountry, string> = {
  GM: "e.g. 7701234",
  SN: "e.g. 771234567",
};

export const PHONE_LABEL: Record<PhoneCountry, string> = {
  GM: "Phone number",
  SN: "Phone number",
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

const PHONE_AUTH_EMAIL_SUFFIX = "@phone.beteseaviator.com";

export function phoneToEmail(phoneKey: string): string {
  return `p${phoneKey}${PHONE_AUTH_EMAIL_SUFFIX}`;
}

/** Reverse of phoneToEmail — extracts the stored phone key from a synthetic auth email. */
export function phoneKeyFromAuthEmail(email: string | null | undefined): string | null {
  if (!email?.startsWith("p") || !email.endsWith(PHONE_AUTH_EMAIL_SUFFIX)) return null;
  const key = email.slice(1, -PHONE_AUTH_EMAIL_SUFFIX.length);
  return /^\d+$/.test(key) ? key : null;
}

export function phoneCountryFromKey(key: string): PhoneCountry {
  if (key.length === GAMBIA_LOCAL_LENGTH) return "GM";
  if (key.startsWith(SENEGAL_COUNTRY_CODE) && key.length === 12) return "SN";
  return "GM";
}

/** Local digits for the phone input (without country prefix). */
export function displayLocalFromPhoneKey(key: string, country: PhoneCountry): string {
  if (country === "SN" && key.startsWith(SENEGAL_COUNTRY_CODE)) {
    return key.slice(SENEGAL_COUNTRY_CODE.length);
  }
  return key;
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
