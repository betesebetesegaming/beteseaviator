import { SITE_ORIGIN } from "./agentLinks";
import { smsShareUrl, whatsAppShareUrl } from "./shareChannels";

export { smsShareUrl, whatsAppShareUrl };

const DEVICE_KEY = "betese_device_id";

/** Stable browser device id for referral anti-fraud. */
export function getReferralDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `d-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export function playerReferralUrl(code: string): string {
  const clean = code.trim().toUpperCase();
  return `${SITE_ORIGIN}/r/${encodeURIComponent(clean)}`;
}

export function referralShareMessage(code: string, bonusAmount: number): string {
  const link = playerReferralUrl(code);
  return (
    `Join me on BETESE Aviator! Sign up with my link, deposit GMD 50+ and play once — ` +
    `I earn GMD ${bonusAmount} when you qualify.\n${link}`
  );
}

export const PLAYER_REFERRAL_EXAMPLES = [
  "Send your link on WhatsApp — friends tap and register in one step.",
  "Let them scan your QR code from your phone screen at home or work.",
  "Share by SMS when a friend asks how to join BETESE.",
  "Your code is personal — different from an agent shop link.",
] as const;

export function formatReferralReleaseDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GM", {
      timeZone: "Africa/Dakar",
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "Monday";
  }
}
