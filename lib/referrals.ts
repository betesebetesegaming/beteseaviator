import { SITE_ORIGIN } from "./agentLinks";

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

export function whatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function referralShareMessage(code: string, bonusAmount: number): string {
  const link = playerReferralUrl(code);
  return (
    `Join me on BETESE Aviator! Sign up, deposit GMD 50+ and play your first bet — ` +
    `I earn GMD ${bonusAmount} when you qualify.\n${link}`
  );
}
