/**
 * Month-end marketer pay from first-open cash (first qualifying deposit
 * via their link). Customer play / GGR is not used.
 *
 * Bands:
 *   40,000 GMD → 7,000
 *   60,000+ → 8,500
 *   100,000–150,000 → 10,000
 *   150,000–200,000 → 12,000
 *   200,000+ → 15,000
 */
export const FIRST_OPEN_PAY_TIERS = [
  { min: 200_000, pay: 15_000, label: "200,000 GMD+" },
  { min: 150_000, pay: 12_000, label: "150,000 – 200,000" },
  { min: 100_000, pay: 10_000, label: "100,000 – 150,000" },
  { min: 60_000, pay: 8_500, label: "60,000+" },
  { min: 40_000, pay: 7_000, label: "40,000" },
] as const;

export type FirstOpenPayResult = {
  pay: number;
  bandLabel: string;
  nextMin: number | null;
  nextPay: number | null;
  remainingToNext: number | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function monthEndPayFromFirstOpen(amount: number): FirstOpenPayResult {
  const cash = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const highToLow = [...FIRST_OPEN_PAY_TIERS].sort((a, b) => b.min - a.min);
  const hit = highToLow.find((t) => cash >= t.min);
  const lowToHigh = [...FIRST_OPEN_PAY_TIERS].sort((a, b) => a.min - b.min);
  const next = lowToHigh.find((t) => t.min > (hit?.min ?? 0) && cash < t.min) ?? null;

  if (!hit) {
    const first = lowToHigh[0];
    return {
      pay: 0,
      bandLabel: "Below 40,000",
      nextMin: first.min,
      nextPay: first.pay,
      remainingToNext: round2(first.min - cash),
    };
  }

  return {
    pay: hit.pay,
    bandLabel: hit.label,
    nextMin: next?.min ?? null,
    nextPay: next?.pay ?? null,
    remainingToNext: next ? round2(next.min - cash) : null,
  };
}
