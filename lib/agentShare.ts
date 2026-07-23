/** Pre-filled messages agents send with their signup link (SMS / WhatsApp). */

import { formatPhoneDisplay } from "./phone";
import { smsShareUrl, whatsAppShareUrl } from "./shareChannels";

export { smsShareUrl, whatsAppShareUrl };

export function agentSignupShareMessage(opts: {
  agentName: string;
  signupUrl: string;
}): string {
  const name = opts.agentName.trim() || "your agent";
  return (
    `Join BETESE Aviator with ${name}! ` +
    `Register here: ${opts.signupUrl} ` +
    `(or scan my QR code in the shop). Good luck!`
  );
}

/**
 * Shareable “account is ready” details for a customer the agent just opened.
 * Always includes the agent’s permanent named link (not /play) so play
 * attributes to that agent for commission.
 */
export function customerAccountReadyMessage(opts: {
  phone: string;
  password: string;
  playerId: string;
  /** Permanent agent URL, e.g. https://www.beteseaviator.com/agent/abdulrahman */
  agentLink?: string | null;
  agentName?: string | null;
}): string {
  const phone = formatPhoneDisplay(opts.phone);
  const lines = [
    "Your BETESE Aviator account is ready!",
    "",
    `Login phone: ${phone}`,
    `Password: ${opts.password}`,
    `Player ID: ${opts.playerId}`,
  ];
  if (opts.agentLink) {
    lines.push(`Agent link: ${opts.agentLink}`);
  }
  if (opts.agentName?.trim()) {
    lines.push("", `Your agent: ${opts.agentName.trim()}`);
  }
  lines.push(
    "",
    "Use the agent link above to play — keep this message private. Change your password after first login."
  );
  return lines.join("\n");
}

export const AGENT_QR_USE_EXAMPLES = [
  "Print the QR and put it on your shop counter — customers scan and sign up in seconds.",
  "Send the link on WhatsApp to friends and groups (tap Share on WhatsApp below).",
  "Text the link by SMS when someone asks how to join BETESE.",
  "Show this screen on your phone so people can scan directly from your screen.",
] as const;
