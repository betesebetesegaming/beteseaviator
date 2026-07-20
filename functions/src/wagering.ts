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
    depositRate: Number(settings.depositPlaythroughRate ?? 0.8),
    earlyFeeRate: Number(settings.earlyWithdrawalFeeRate ?? 0.15),
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

/** Returns an error message when withdrawal must wait for deposit play-through. */
export function withdrawalPlaythroughBlockMessage(
  wallet: Pick<PlaythroughWallet, "pendingDepositTotal" | "depositWagerProgress">,
  settings: Settings
): string | null {
  const { depositRate } = playthroughRates(settings);
  if (depositPlaythroughMet(wallet, depositRate)) return null;
  const remaining = depositPlaythroughRemaining(wallet, depositRate);
  const ratePct = Math.round(depositRate * 100);
  return (
    `You must play ${remaining} GMD more on games (${ratePct}% of your deposits) before you can withdraw. ` +
    `Deposited funds cannot be withdrawn without playing first.`
  );
}

/** New deposit adds to the amount that must be played before free withdrawal. */
export function recordDepositPlaythrough(
  tx: FirebaseFirestore.Transaction,
  uid: string,
  wallet: PlaythroughWallet,
  depositAmount: number
): void {
  if (depositAmount <= 0) return;
  wallet.pendingDepositTotal = round2(wallet.pendingDepositTotal + depositAmount);
  tx.set(
    db.doc(`wallets/${uid}`),
    {
      pendingDepositTotal: wallet.pendingDepositTotal,
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

  wallet.depositWagerProgress = round2(wallet.depositWagerProgress + betAmount);
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
}

export function evaluateEarlyWithdrawal(
  wallet: PlaythroughWallet,
  withdrawAmount: number,
  settings: Settings
): EarlyWithdrawalResult {
  const { depositRate, earlyFeeRate } = playthroughRates(settings);
  const playthroughMet = depositPlaythroughMet(wallet, depositRate);
  const requiredWager = playthroughRequiredWager(wallet, depositRate);
  const fee = playthroughMet ? 0 : round2(withdrawAmount * earlyFeeRate);
  const payoutAmount = round2(Math.max(0, withdrawAmount - fee));
  return {
    playthroughMet,
    fee,
    payoutAmount,
    bonusForfeited: playthroughMet ? 0 : round2(wallet.bonusBalance),
    requiredWager,
    wagerProgress: wallet.depositWagerProgress,
    pendingDeposit: wallet.pendingDepositTotal,
  };
}

/**
 * Early withdrawal: forfeit bonus + optional 15% fee (fee stays on platform).
 * Returns the amount to send via ModemPay (after fee).
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
  if (result.playthroughMet) return result;

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
      description: "Bonus forfeited — early withdrawal before play-through",
      meta: { requestId, source: "early_withdrawal" },
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  if (result.fee > 0) {
    tx.set(db.collection("transactions").doc(), {
      userId: uid,
      type: "withdrawal",
      amount: -result.fee,
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance,
      reference: txnReference(),
      status: "completed",
      description: `Early withdrawal fee (${Math.round(playthroughRates(settings).earlyFeeRate * 100)}%)`,
      meta: { requestId, source: "early_withdrawal_fee", fee: result.fee },
      createdAt: FieldValue.serverTimestamp(),
    });
    bumpPlatformFee(tx, result.fee);
  }

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
