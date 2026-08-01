/**
 * Smart Bonus outreach SMS — sends the offer message straight to the customer
 * via the Africell gateway, always ending with a tap-through link that opens
 * the site at their bonus. Reuses the same gateway sender as the OTP flow.
 *
 * Best-effort by design: sendBonusSms never throws — a failed text must never
 * roll back a bonus credit or block an admin action. The caller logs the result.
 */
import { logger } from "firebase-functions/v2";
import { sendViaAfricell } from "./routes/otp";

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
    const { messageId } = await sendViaAfricell(msisdn, withLink(message));
    logger.info("smartBonus SMS sent", { msisdn, messageId });
    return { ok: true, messageId };
  } catch (e) {
    logger.warn("smartBonus SMS failed", { msisdn, error: String(e) });
    return { ok: false, error: String(e) };
  }
}
