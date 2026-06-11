/** Normalize a phone number: strip everything but digits ("77 000-0001" -> "770000001"). */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "").replace(/^0+/, "");
}

/** Synthetic email used for phone + password auth. */
export function phoneToEmail(phone: string): string {
  return `p${normalizePhone(phone)}@phone.beteseaviator.com`;
}

export function formatXof(amount: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(amount)} XOF`;
}

export function formatSigned(amount: number): string {
  const sign = amount >= 0 ? "+" : "-";
  return `${sign}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Math.abs(amount))} XOF`;
}

export function formatMultiplier(m: number): string {
  return `x${m.toFixed(2)}`;
}

export function formatDate(d: Date | { toDate(): Date } | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : d.toDate();
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Multiplier value at t seconds into the flying phase: m = e^(k*t). */
export function multiplierAt(elapsedSeconds: number, growthRate: number): number {
  return Math.max(1, Math.exp(growthRate * elapsedSeconds));
}

/** Seconds of flight needed to reach multiplier m. */
export function timeToMultiplier(m: number, growthRate: number): number {
  return Math.log(Math.max(1, m)) / growthRate;
}
