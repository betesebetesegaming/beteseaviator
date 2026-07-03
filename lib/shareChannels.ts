/** WhatsApp / SMS share helpers — used by agents and player referrals. */

export function whatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function smsShareUrl(text: string, phone?: string): string {
  const body = encodeURIComponent(text);
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (digits) return `sms:${digits}?body=${body}`;
  return `sms:?body=${body}`;
}
