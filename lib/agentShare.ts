/** Pre-filled messages agents send with their signup link (SMS / WhatsApp). */

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

export const AGENT_QR_USE_EXAMPLES = [
  "Print the QR and put it on your shop counter — customers scan and sign up in seconds.",
  "Send the link on WhatsApp to friends and groups (tap Share on WhatsApp below).",
  "Text the link by SMS when someone asks how to join BETESE.",
  "Show this screen on your phone so people can scan directly from your screen.",
] as const;
