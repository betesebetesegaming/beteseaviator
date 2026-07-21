/**
 * Keeps aviator's `wallets/{uid}` ledger in sync when ModemPay webhooks credit
 * `users.wallet_balance` (same field betesepmu uses).
 */
import { applyDepositBonuses } from "./bonuses";
import { bumpDailyStats, bumpPlatformStats, db, getSettings, todayIso, walletRead, walletWrite } from "./helpers";
import { recordDepositPlaythrough } from "./wagering";
import { onReferralDeposit } from "./referrals";
import { maybeActivateSmartBonus } from "./smartBonus";

export async function syncAviatorWalletCredit(
  uid: string,
  amount: number,
  externalRef: string,
  depositAt: Date = new Date()
): Promise<{ bonuses: { kind: string; amount: number }[] }> {
  if (!uid || amount <= 0) return { bonuses: [] };

  const settings = await getSettings();
  let applied: { kind: string; amount: number }[] = [];

  await db.runTransaction(async (tx) => {
    // Idempotency guard: a deposit is credited exactly once, keyed by its
    // externalRef. Both callers (markDepositCompleted and healAviatorWalletIfNeeded)
    // can fire for the SAME deposit — e.g. a webhook retry after the container
    // froze between crediting and setting aviator_wallet_synced. The marker is
    // written in the same transaction as the credit, so Firestore atomicity
    // means it lands only if the full credit committed: never a lost credit,
    // never a double one. READ must happen before any write (transaction rule).
    const creditMarkerRef = db.doc(`deposit_credits/${externalRef}`);
    const creditMarker = externalRef ? await tx.get(creditMarkerRef) : null;
    if (creditMarker?.exists) return;

    const userRef = db.doc(`users/${uid}`);
    const userSnap = await tx.get(userRef);
    const wallet = await walletRead(tx, uid);

    // Referral reads must finish before any wallet writes (Firestore transaction rule).
    await onReferralDeposit(tx, uid, amount, settings);

    if (externalRef) {
      tx.set(creditMarkerRef, {
        uid,
        amount,
        externalRef,
        creditedAt: new Date().toISOString(),
      });
    }

    walletWrite(tx, wallet, {
      uid,
      amount,
      type: "deposit",
      description: `Deposit via ModemPay (${externalRef})`,
      meta: { externalRef, source: "modempay" },
    });

    recordDepositPlaythrough(tx, uid, wallet, amount);

    applied = applyDepositBonuses(tx, {
      uid,
      wallet,
      depositAmount: amount,
      depositRef: externalRef,
      depositAt,
      userData: userSnap.data(),
      settings,
      userRef,
    });

    bumpPlatformStats(tx, { totalDeposits: amount });
    bumpDailyStats(tx, todayIso(depositAt), { deposits: amount });
  });

  // Separate transaction: activate a pending Smart Bonus if this deposit qualifies.
  await maybeActivateSmartBonus(uid, amount, externalRef);

  return { bonuses: applied };
}

export async function syncAviatorWalletDebit(
  uid: string,
  amount: number,
  externalRef: string
): Promise<void> {
  if (!uid || amount <= 0) return;
  await db.runTransaction(async (tx) => {
    const wallet = await walletRead(tx, uid);
    walletWrite(tx, wallet, {
      uid,
      amount: -amount,
      type: "withdrawal",
      description: `Withdrawal hold (${externalRef})`,
      meta: { externalRef, source: "modempay" },
    });
  });
}

export async function syncAviatorWalletRefund(
  uid: string,
  amount: number,
  externalRef: string,
  reason: string
): Promise<void> {
  if (!uid || amount <= 0) return;
  await db.runTransaction(async (tx) => {
    const wallet = await walletRead(tx, uid);
    walletWrite(tx, wallet, {
      uid,
      amount,
      type: "refund",
      description: `Withdrawal refund: ${reason}`,
      meta: { externalRef, source: "modempay" },
      ignoreFrozen: true,
    });
  });
}
