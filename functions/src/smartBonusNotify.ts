/**
 * Smart Bonus outreach SMS — sends the offer message straight to the customer
 * via the Africell gateway, always ending with a tap-through link that opens
 * the site at their bonus. Reuses the same gateway sender as the OTP flow.
 *
 * Best-effort by design: sendBonusSms never throws — a failed text must never
 * roll back a bonus credit or block an admin action. The caller logs the result.
 */
import { logger } from "firebase-functions/v2";
import { sendSmsWithFallback } from "./routes/otp";

const SITE_URL = (process.env.PUBLIC_SITE_URL || "https://www.beteseaviator.com").replace(/\/+$/, "");

/** The link every outreach SMS ends with — opens the site at the player's bonus. */
export const REWARDS_LINK = `${SITE_URL}/play/rewards`;

/** Africell expects a bare 220-prefixed MSISDN (Gambia). Returns null if unusable. */
export function toMsisdn(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = String(phone).replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2); // drop international 00 prefix
  if (d.startsWith("220")) return d; // already carries the Gambia country code
  return `220${d}`;
}

/**
 * Promotional gift-bonus SMS: amounts first, clear claim CTA, then the link
 * is appended by withLink / sendBonusSms. Keep under ~240 chars (excl. URL).
 */
export function buildGiftBonusSms(opts: {
  name: string;
  bonusAmount: number;
  matchDeposit: number;
  currency?: string;
}): string {
  const first = (opts.name || "Friend").split(/\s+/)[0] || "Friend";
  const cur = opts.currency || "D";
  const bonus = Math.round(Number(opts.bonusAmount) || 0);
  const match = Math.round(Number(opts.matchDeposit) || 0);
  const play = bonus + match;
  // GSM-7 only (no emoji / arrows / em-dash) so it stays one 160-char segment.
  return (
    `BETESE gift for ${first}! ` +
    `Top up ${cur}${match} and we add a ${cur}${bonus} bonus, ` +
    `so you play with ${cur}${play}. Claim it now:`
  );
}

/** Prefer stored AI/admin copy if it already shows the bonus amount; else use promotional default. */
export function resolveGiftBonusSms(opts: {
  name: string;
  bonusAmount: number;
  matchDeposit: number;
  outreachMessage?: string | null;
  currency?: string;
}): string {
  const custom = (opts.outreachMessage || "").trim();
  const bonus = Math.round(Number(opts.bonusAmount) || 0);
  if (custom && (custom.includes(String(bonus)) || /GMD|D\s*\d/i.test(custom))) {
    // Strip any old rewards URL — withLink re-appends the canonical one.
    return custom.replace(new RegExp(`${SITE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/play/rewards`, "gi"), "").trim();
  }
  return buildGiftBonusSms(opts);
}

/** Ensure the message ends with the rewards link (idempotent). */
export function withLink(message: string): string {
  const m = (message || "").trim();
  if (m.includes(REWARDS_LINK)) return m;
  return `${m} ${REWARDS_LINK}`.trim();
}

/** Send an outreach SMS. Never throws — returns a result the caller can log. */
export async function sendBonusSms(
  phone: string | null | undefined,
  message: string
): Promise<{ ok: boolean; messageId?: string | null; error?: string }> {
  const msisdn = toMsisdn(phone);
  if (!msisdn) return { ok: false, error: "no phone number on file" };
  try {
    // Same Africell → PMU failover as withdrawal/signup OTP. Direct Africell from
    // Aviator us-central1 often times out; without PMU, Happy Hour texts all fail.
    const { messageId, via } = await sendSmsWithFallback(msisdn, withLink(message));
    logger.info("smartBonus SMS sent", { msisdn, messageId, via });
    return { ok: true, messageId };
  } catch (e) {
    logger.warn("smartBonus SMS failed", { msisdn, error: String(e) });
    return { ok: false, error: String(e) };
  }
}
