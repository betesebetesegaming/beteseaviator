/** Platform minimum wallet top-up (GMD). Deposits accept this amount and above. */
export const MIN_DEPOSIT_GMD = 20;

/** Quick-pick amounts shown in the deposit sheet (GMD). */
export const DEPOSIT_PRESET_AMOUNTS = [20, 25, 50, 100, 200, 500] as const;

/**
 * Deposit minimum is fixed at 20 GMD (legacy Firestore values like 50/100 are ignored).
 */
export function normalizeMinDeposit(_value?: unknown): number {
  return MIN_DEPOSIT_GMD;
}

export function depositPresetAmounts(minDeposit = MIN_DEPOSIT_GMD): number[] {
  const presets = DEPOSIT_PRESET_AMOUNTS.filter((p) => p >= minDeposit);
  return presets.length ? [...presets] : [minDeposit];
}
