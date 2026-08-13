import { db, FieldValue, round2, txnReference, type Settings } from "./helpers";

export interface PlaythroughWallet {
  balance: number;
  bonusBalance: number;
  frozen: boolean;
  exists: boolean;
  pendingDepositTotal: number;
  depositWagerProgress: number;
  bonusWagerRequired: number;
  bonusWagerProgress: number;
}

export function parsePlaythroughWallet(
  data: FirebaseFirestore.DocumentData | undefined,
  exists: boolean
): PlaythroughWallet {
  if (!exists || !data) {
    return {
      balance: 0,
      bonusBalance: 0,
      frozen: false,
      exists: false,
      pendingDepositTotal: 0,
      depositWagerProgress: 0,
      bonusWagerRequired: 0,
      bonusWagerProgress: 0,
    };
  }
  return {
    balance: Number(data.balance ?? 0),
    bonusBalance: Number(data.bonusBalance ?? 0),
    frozen: Boolean(data.frozen),
    exists: true,
    pendingDepositTotal: Number(data.pendingDepositTotal ?? 0),
    depositWagerProgress: Number(data.depositWagerProgress ?? 0),
    bonusWagerRequired: Number(data.bonusWagerRequired ?? 0),
    bonusWagerProgress: Number(data.bonusWagerProgress ?? 0),
  };
}

export function playthroughRates(settings: Settings) {
  return {
    depositRate: Number(settings.depositPlaythroughRate ?? 1),
    earlyFeeRate: Number(settings.earlyWithdrawalFeeRate ?? 0.2),
    bonusMultiplier: Number(settings.bonusWagerMultiplier ?? 3),
  };
}

export function depositPlaythroughMet(
  wallet: Pick<PlaythroughWallet, "pendingDepositTotal" | "depositWagerProgress">,
  depositRate: number
): boolean {
  if (wallet.pendingDepositTotal <= 0) return true;
  const required = round2(wallet.pendingDepositTotal * depositRate);
  return wallet.depositWagerProgress >= required;
}

export function playthroughRequiredWager(
  wallet: Pick<PlaythroughWallet, "pendingDepositTotal">,
  depositRate: number
): number {
  if (wallet.pendingDepositTotal <= 0) return 0;
  return round2(wallet.pendingDepositTotal * depositRate);
}

export function depositPlaythroughRemaining(
  wallet: Pick<PlaythroughWallet, "pendingDepositTotal" | "depositWagerProgress">,
  depositRate: number
): number {
  const required = playthroughRequiredWager(wallet, depositRate);
  if (required <= 0) return 0;
  return round2(Math.max(0, required - wallet.depositWagerProgress));
}

/**
 * Deposit still locked until wagered (full turnover when rate = 1).
 * freeWithdrawable = balance − this amount.
 */
export function remainingUnplayedDeposit(
  wallet: Pick<PlaythroughWallet, "pendingDepositTotal" | "depositWagerProgress">,
  depositRate: number
): number {
  return depositPlaythroughRemaining(wallet, depositRate);
}

export function freeWithdrawableAmount(
  wallet: Pick<PlaythroughWallet, "balance" | "pendingDepositTotal" | "depositWagerProgress">,
  depositRate: number
): number {
  const locked = remainingUnplayedDeposit(wallet, depositRate);
  return round2(Math.max(0, wallet.balance - locked));
}

/**
 * @deprecated Hard block removed — early withdrawal with fee is allowed.
 * Kept returning null so any leftover callers do not block payouts.
 */
export function withdrawalPlaythroughBlockMessage(
  _wallet: Pick<PlaythroughWallet, "pendingDepositTotal" | "depositWagerProgress">,
  _settings: Settings
): string | null {
  return null;
}

/** New deposit adds to the amount that must be played before free withdrawal. */
export function recordDepositPlaythrough(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  wallet: PlaythroughWallet,
  depositAmount: number
): void {
  if (depositAmount <= 0) return;
  // Stale progress from when nothing was pending must not auto-unlock a new deposit.
  if (wallet.pendingDepositTotal <= 0) {
    wallet.depositWagerProgress = 0;
  }
  wallet.pendingDepositTotal = round2(wallet.pendingDepositTotal + depositAmount);
  tx.set(
    db.doc(`wallets/${uid}`),
    {
      pendingDepositTotal: wallet.pendingDepositTotal,
      depositWagerProgress: wallet.depositWagerProgress,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/** Bonus grants require 3x (configurable) wagering before converting to cash. */
export function recordBonusWageringRequirement(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  wallet: PlaythroughWallet,
  bonusAmount: number,
  multiplier: number
): void {
  if (bonusAmount <= 0 || multiplier <= 0) return;
  wallet.bonusWagerRequired = round2(wallet.bonusWagerRequired + bonusAmount * multiplier);
  tx.set(
    db.doc(`wallets/${uid}`),
    {
      bonusWagerRequired: wallet.bonusWagerRequired,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function maybeClearDepositPlaythrough(wallet: PlaythroughWallet, depositRate: number): boolean {
  if (wallet.pendingDepositTotal <= 0) return false;
  const required = round2(wallet.pendingDepositTotal * depositRate);
  if (wallet.depositWagerProgress < required) return false;
  wallet.pendingDepositTotal = 0;
  wallet.depositWagerProgress = 0;
  return true;
}

function maybeConvertBonusToCash(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  wallet: PlaythroughWallet
): number {
  if (wallet.bonusWagerRequired <= 0 || wallet.bonusWagerProgress < wallet.bonusWagerRequired) {
    return 0;
  }
  const convert = round2(wallet.bonusBalance);
  if (convert <= 0) {
    wallet.bonusWagerRequired = 0;
    wallet.bonusWagerProgress = 0;
    return 0;
  }
  const cashBefore = wallet.balance;
  wallet.balance = round2(wallet.balance + convert);
  wallet.bonusBalance = 0;
  wallet.bonusWagerRequired = 0;
  wallet.bonusWagerProgress = 0;

  tx.set(
    db.doc(`wallets/${uid}`),
    {
      balance: wallet.balance,
      bonusBalance: 0,
      bonusWagerRequired: 0,
      bonusWagerProgress: 0,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  tx.set(db.collection("transactions").doc(), {
    userId: uid,
    type: "transfer",
    amount: convert,
    balanceBefore: cashBefore,
    balanceAfter: wallet.balance,
    reference: txnReference(),
    status: "completed",
    description: "Bonus converted to withdrawable cash (wagering complete)",
    meta: { source: "bonus_conversion" },
    createdAt: FieldValue.serverTimestamp(),
  });
  return convert;
}

/** Counts each bet toward deposit unlock and bonus conversion. */
export function applyBetWagering(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  wallet: PlaythroughWallet,
  betAmount: number,
  fromBonus: number,
  settings: Settings
): void {
  if (betAmount <= 0) return;
  const { depositRate } = playthroughRates(settings);

  // Only count toward deposit playthrough while a deposit is still locked.
  if (wallet.pendingDepositTotal > 0) {
    wallet.depositWagerProgress = round2(wallet.depositWagerProgress + betAmount);
  }
  if (fromBonus > 0) {
    wallet.bonusWagerProgress = round2(wallet.bonusWagerProgress + fromBonus);
  }

  const clearedDeposit = maybeClearDepositPlaythrough(wallet, depositRate);
  const convertedBonus = maybeConvertBonusToCash(tx, uid, wallet);

  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (clearedDeposit) {
    patch.pendingDepositTotal = 0;
    patch.depositWagerProgress = 0;
  } else {
    patch.depositWagerProgress = wallet.depositWagerProgress;
  }
  if (fromBonus > 0 && convertedBonus === 0) {
    patch.bonusWagerProgress = wallet.bonusWagerProgress;
  }

  if (Object.keys(patch).length > 1) {
    tx.set(db.doc(`wallets/${uid}`), patch, { merge: true });
  }
}

export interface EarlyWithdrawalResult {
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

export function evaluateEarlyWithdrawal(
  wallet: PlaythroughWallet,
  withdrawAmount: number,
  settings: Settings
): EarlyWithdrawalResult {
  const { depositRate, earlyFeeRate } = playthroughRates(settings);
  const playthroughMet = depositPlaythroughMet(wallet, depositRate);
  const requiredWager = playthroughRequiredWager(wallet, depositRate);
  const freeWithdrawable = freeWithdrawableAmount(wallet, depositRate);
  const earlyPart = playthroughMet
    ? 0
    : round2(Math.max(0, withdrawAmount - freeWithdrawable));
  const fee = earlyPart > 0 ? round2(earlyPart * earlyFeeRate) : 0;
  const payoutAmount = round2(Math.max(0, withdrawAmount - fee));
  // Bonus is never withdrawable; any cash withdrawal forfeits remaining bonus.
  const bonusForfeited = round2(wallet.bonusBalance);
  return {
    playthroughMet,
    fee,
    payoutAmount,
    bonusForfeited,
    requiredWager,
    wagerProgress: wallet.depositWagerProgress,
    pendingDeposit: wallet.pendingDepositTotal,
    freeWithdrawable,
    earlyPart,
  };
}

/**
 * Cash withdrawal security:
 * - Bonus balance is NEVER paid out (forfeited on any withdrawal).
 * - Early withdrawal of locked deposit: fee on early part only.
 * - Free unlock (played + winnings) pays 100% of cash. Returns ModemPay send amount.
 */
export function applyEarlyWithdrawalPenalties(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  wallet: PlaythroughWallet,
  withdrawAmount: number,
  settings: Settings,
  requestId: string
): EarlyWithdrawalResult {
  const result = evaluateEarlyWithdrawal(wallet, withdrawAmount, settings);

  // Always strip unconverted bonus before cash leaves — bonus is play-only until wagered.
  if (result.bonusForfeited > 0 && wallet.bonusBalance > 0) {
    const forfeited = round2(wallet.bonusBalance);
    const cashBefore = wallet.balance;
    wallet.bonusBalance = 0;
    wallet.bonusWagerRequired = 0;
    wallet.bonusWagerProgress = 0;
    tx.set(
      db.doc(`wallets/${uid}`),
      {
        bonusBalance: 0,
        bonusWagerRequired: 0,
        bonusWagerProgress: 0,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    tx.set(db.collection("transactions").doc(), {
      userId: uid,
      type: "bonus",
      amount: -forfeited,
      balanceBefore: cashBefore,
      balanceAfter: wallet.balance,
      reference: txnReference(),
      status: "completed",
      description: result.earlyPart > 0
        ? "Bonus forfeited — early withdrawal before full deposit turnover"
        : "Bonus forfeited — cash withdrawal before bonus wagering complete",
      meta: {
        requestId,
        source: result.earlyPart > 0 ? "early_withdrawal" : "withdrawal_bonus_forfeit",
      },
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  if (result.earlyPart <= 0) return result;

  if (result.fee > 0) {
    tx.set(db.collection("transactions").doc(), {
      userId: uid,
      type: "withdrawal",
      amount: -result.fee,
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance,
      reference: txnReference(),
      status: "completed",
      description: `Early withdrawal fee (${Math.round(playthroughRates(settings).earlyFeeRate * 100)}% on unplayed deposit)`,
      meta: {
        requestId,
        source: "early_withdrawal_fee",
        fee: result.fee,
        earlyPart: result.earlyPart,
        freeWithdrawable: result.freeWithdrawable,
      },
      createdAt: FieldValue.serverTimestamp(),
    });
    bumpPlatformFee(tx, result.fee);
  }

  // Taking locked deposit early clears remaining turnover obligation.
  wallet.pendingDepositTotal = 0;
  wallet.depositWagerProgress = 0;
  tx.set(
    db.doc(`wallets/${uid}`),
    {
      pendingDepositTotal: 0,
      depositWagerProgress: 0,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return result;
}

function bumpPlatformFee(tx: FirebaseFirestore.Transaction, fee: number): void {
  if (fee <= 0) return;
  tx.set(
    db.doc("stats/platform"),
    { earlyWithdrawalFees: FieldValue.increment(fee) },
    { merge: true }
  );
}
