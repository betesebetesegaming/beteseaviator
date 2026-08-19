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
