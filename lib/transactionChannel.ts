/** How a wallet deposit/withdrawal was handled (cash desk vs Wave/ModemPay). */

export type MoneyChannel = "cashdesk" | "modempay" | "wallet" | "other";

export function isOtcCashMeta(meta: unknown): boolean {
  if (!meta || typeof meta !== "object") return false;
  return (meta as Record<string, unknown>).otcCash === true;
}

export function transactionChannel(
  t: { type?: string; description?: string; meta?: Record<string, unknown> },
): MoneyChannel {
  if (isOtcCashMeta(t.meta)) return "cashdesk";
  const desc = String(t.description || "").toLowerCase();
  if (
    desc.includes("modempay") ||
    desc.includes("wave") ||
    desc.includes("afrimoney") ||
    desc.includes("wallet top-up")
  ) {
    return "modempay";
  }
  if (t.type === "deposit" || t.type === "withdrawal") return "wallet";
  return "other";
}

export function transactionChannelLabel(
  t: { type?: string; description?: string; meta?: Record<string, unknown> },
): string {
  const ch = transactionChannel(t);
  if (ch === "cashdesk") return "Cash desk";
  if (ch === "modempay") return "Wave";
  if (ch === "wallet") return "Wallet";
  return "Other";
}
