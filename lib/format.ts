import { normalizePhone as toPhoneKey, type PhoneCountry } from "./phone";

/** Normalize to storage key (Gambia 7-digit or Senegal 221+9-digit), or empty if invalid. */
export function normalizePhone(input: string, preferredCountry: PhoneCountry = "GM"): string {
  return toPhoneKey(input, preferredCountry);
}

/** Synthetic email used for phone + password auth. */
export function phoneToEmail(phone: string): string {
  const key = toPhoneKey(phone);
  return `p${key}@phone.beteseaviator.com`;
}

export function formatGmd(amount: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(amount)} GMD`;
}

/** @deprecated Use formatGmd */
export const formatXof = formatGmd;

export function formatSigned(amount: number): string {
  const sign = amount >= 0 ? "+" : "-";
  return `${sign}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Math.abs(amount))} GMD`;
}

export function formatMultiplier(m: number): string {
  return `x${m.toFixed(2)}`;
}

/** Cap live crash multiplier for display (avoids runaway UI when a round is stuck). */
export function liveCrashMultiplier(
  elapsedSeconds: number,
  growthRate: number,
  maxMultiplier = 100
): number {
  const rate = Number.isFinite(growthRate) && growthRate > 0 ? growthRate : 0.06;
  const cap = Number.isFinite(maxMultiplier) && maxMultiplier > 1 ? maxMultiplier : 100;
  const raw = multiplierAt(Math.max(0, elapsedSeconds), rate);
  return Math.min(raw, cap);
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
