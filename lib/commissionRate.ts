/**
 * Parse a GGR share: 0.05 and 5 both mean 5%. Returns null if invalid.
 */
export function parseCommissionRate(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  const fraction = n > 1 ? n / 100 : n;
  if (fraction > 1) return null;
  return Math.round(fraction * 1e6) / 1e6;
}

/** Coerce a stored or typed rate to a 0–1 fraction, or `fallback` if invalid. */
export function normalizeCommissionRate(value: unknown, fallback = 0): number {
  return parseCommissionRate(value) ?? fallback;
}

/** Convert a stored fraction (or a percent-like number) to a display percent. */
export function commissionRateToPercent(value: unknown, fallbackRate = 0): number {
  const rate = normalizeCommissionRate(value, fallbackRate);
  return Math.round(rate * 1e4) / 100;
}

/** Convert a percent typed in the admin form (5 = 5%) to a stored fraction. */
export function percentToCommissionRate(percent: unknown): number {
  const n = Number(percent);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round((n / 100) * 1e6) / 1e6;
}
