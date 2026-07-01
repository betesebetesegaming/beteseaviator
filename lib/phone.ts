/** BETESE accepts Gambian mobile numbers only (+220, 7 local digits). Africell OTP required for all accounts. */

/** Active sign-up / login country */
export type PhoneCountry = "GM";

/** Options shown in the country dropdown */
export type PhoneCountryCode = PhoneCountry | "GH" | "NG";

export const GAMBIA_COUNTRY_CODE = "220";
export const GAMBIA_LOCAL_LENGTH = 7;

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

export const PHONE_HINT = "Enter a valid Gambian mobile number: 7 digits (e.g. 7701234).";

/** @deprecated Use PHONE_HINT */
export const GAMBIA_PHONE_HINT = PHONE_HINT;

export const PHONE_PLACEHOLDER: Record<PhoneCountry, string> = {
  GM: "e.g. 7701234",
};

export const PHONE_LABEL: Record<PhoneCountry, string> = {
  GM: "Phone number",
};

export type ParsedPhone = { country: PhoneCountry; local: string };

function stripLeadingZeros(digits: string): string {
  return digits.replace(/^0+/, "");
}

/** Parse and validate a Gambian mobile number. */
export function normalizePhoneLocal(
  input: string,
  _preferredCountry: PhoneCountry = "GM"
): ParsedPhone | null {
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

/** Storage key in Firestore `phones/{key}` — 7-digit Gambian local number. */
export function normalizePhone(input: string, preferredCountry: PhoneCountry = "GM"): string {
  const parsed = normalizePhoneLocal(input, preferredCountry);
  if (!parsed) return "";
  return parsed.local;
}

/** E.164 for SMS / payments: +220XXXXXXX */
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
  return `p${phoneKey}${PHONE_AUTH_EMAIL_SUFFIX}`;
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
  if (key.startsWith(GAMBIA_COUNTRY_CODE) && key.length === 10) {
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
  if (d.length !== GAMBIA_LOCAL_LENGTH) return local;
  return `${d.slice(0, 3)} ${d.slice(3)}`;
}

export function formatPhoneDisplay(phoneKey: string): string {
  const local =
    phoneKey.startsWith(GAMBIA_COUNTRY_CODE) && phoneKey.length === 10
      ? phoneKey.slice(3)
      : phoneKey;
  if (local.length === GAMBIA_LOCAL_LENGTH) {
    return `+${GAMBIA_COUNTRY_CODE} ${formatGambiaPhoneLocal(local)}`;
  }
  return phoneKey;
}
