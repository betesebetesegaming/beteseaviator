import type { PlatformSettings, Wallet } from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function playthroughRates(settings: PlatformSettings) {
  return {
    depositRate: Number(settings.depositPlaythroughRate ?? 1),
    earlyFeeRate: Number(settings.earlyWithdrawalFeeRate ?? 0.2),
    bonusMultiplier: Number(settings.bonusWagerMultiplier ?? 3),
  };
}

export function depositPlaythroughRequired(wallet: Wallet, depositRate: number): number {
  const pending = Number(wallet.pendingDepositTotal ?? 0);
  if (pending <= 0) return 0;
  return round2(pending * depositRate);
}

export function depositPlaythroughMet(wallet: Wallet, settings: PlatformSettings): boolean {
  const { depositRate } = playthroughRates(settings);
  const required = depositPlaythroughRequired(wallet, depositRate);
  if (required <= 0) return true;
  return Number(wallet.depositWagerProgress ?? 0) >= required;
}

export function depositPlaythroughRemaining(wallet: Wallet, settings: PlatformSettings): number {
  const { depositRate } = playthroughRates(settings);
  const required = depositPlaythroughRequired(wallet, depositRate);
  if (required <= 0) return 0;
  return round2(Math.max(0, required - Number(wallet.depositWagerProgress ?? 0)));
}

/** Unplayed deposit still locked (full turnover when rate = 1). */
export function remainingUnplayedDeposit(wallet: Wallet, settings: PlatformSettings): number {
  return depositPlaythroughRemaining(wallet, settings);
}

/** Cash that can be withdrawn at 100% (balance minus unplayed deposit). */
export function freeWithdrawableAmount(wallet: Wallet, settings: PlatformSettings): number {
  const locked = remainingUnplayedDeposit(wallet, settings);
  return round2(Math.max(0, Number(wallet.balance ?? 0) - locked));
}

/**
 * @deprecated Hard block removed — early withdrawal with fee is allowed.
 */
export function withdrawalPlaythroughBlockMessage(
  _wallet: Wallet,
  _settings: PlatformSettings
): string | null {
  return null;
}

export function bonusWageringRemaining(wallet: Wallet): number {
  const required = Number(wallet.bonusWagerRequired ?? 0);
  if (required <= 0) return 0;
  return round2(Math.max(0, required - Number(wallet.bonusWagerProgress ?? 0)));
}

export interface WithdrawalPreview {
  playthroughMet: boolean;
  fee: number;
  payoutAmount: number;
  bonusForfeited: number;
  requiredWager: number;
  wagerProgress: number;
  pendingDeposit: number;
  freeWithdrawable: number;
  earlyPart: number;
}

export function previewWithdrawal(
  wallet: Wallet,
  amount: number,
  settings: PlatformSettings
): WithdrawalPreview {
  const { depositRate, earlyFeeRate } = playthroughRates(settings);
  const pendingDeposit = Number(wallet.pendingDepositTotal ?? 0);
  const wagerProgress = Number(wallet.depositWagerProgress ?? 0);
  const requiredWager = depositPlaythroughRequired(wallet, depositRate);
  const playthroughMet = requiredWager <= 0 || wagerProgress >= requiredWager;
  const freeWithdrawable = freeWithdrawableAmount(wallet, settings);
  const earlyPart = playthroughMet ? 0 : round2(Math.max(0, amount - freeWithdrawable));
  const fee = earlyPart > 0 ? round2(earlyPart * earlyFeeRate) : 0;
  const payoutAmount = round2(Math.max(0, amount - fee));
  const bonusForfeited = earlyPart > 0 ? round2(Number(wallet.bonusBalance ?? 0)) : 0;
  return {
    playthroughMet,
    fee,
    payoutAmount,
    bonusForfeited,
    requiredWager,
    wagerProgress,
    pendingDeposit,
    freeWithdrawable,
    earlyPart,
  };
}
