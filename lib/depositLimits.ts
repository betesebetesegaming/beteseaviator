/**
 * Platform minimum wallet top-up (GMD). Deposits accept this amount and above.
 * Wave rejects charges below its floor — 20 GMD charges fail on ModemPay while
 * 50 GMD+ clear. Keep this at/above the lowest amount that actually charges.
 */
export const MIN_DEPOSIT_GMD = 25;

/** Quick-pick amounts shown in the deposit sheet (GMD). */
export const DEPOSIT_PRESET_AMOUNTS = [25, 50, 100, 200, 500] as const;

/**
 * Deposit minimum is fixed at MIN_DEPOSIT_GMD (legacy Firestore values are ignored).
 */
export function normalizeMinDeposit(_value?: unknown): number {
  return MIN_DEPOSIT_GMD;
}

export function depositPresetAmounts(minDeposit = MIN_DEPOSIT_GMD): number[] {
  const presets = DEPOSIT_PRESET_AMOUNTS.filter((p) => p >= minDeposit);
  return presets.length ? [...presets] : [minDeposit];
}
