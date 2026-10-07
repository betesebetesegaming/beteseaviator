/**
 * Keeps aviator's `wallets/{uid}` ledger in sync when ModemPay webhooks credit
 * `users.wallet_balance` (same field betesepmu uses).
 */
import { applyDepositBonuses } from "./bonuses";
import { collectModemPayPaymentIds, depositCreditLockIds } from "./depositCreditLock";
import {
  agentIdsForPlayer,
  bumpDailyStats,
  bumpPlatformStats,
  creditAgentCustomerDeposits,
  db,
  getSettings,
  todayIso,
  walletRead,
  walletWrite,
} from "./helpers";
import { recordDepositPlaythrough } from "./wagering";
import { onReferralDeposit } from "./referrals";
import { maybeActivateSmartBonus } from "./smartBonus";

export type SyncAviatorCreditOpts = {
  depositAt?: Date;
  providerTxnId?: string | null;
  paymentIntentId?: string | null;
  sessionId?: string | null;
  reusedFrom?: string | null;
  payload?: Record<string, unknown> | null;
};

export type SyncAviatorCreditResult = {
  bonuses: { kind: string; amount: number }[];
  credited: boolean;
  duplicateOf?: string;
};

function normalizeCreditOpts(
  depositAtOrOpts?: Date | SyncAviatorCreditOpts,
): SyncAviatorCreditOpts {
  if (!depositAtOrOpts) return {};
  if (depositAtOrOpts instanceof Date) return { depositAt: depositAtOrOpts };
  return depositAtOrOpts;
}

export async function syncAviatorWalletCredit(
  uid: string,
  amount: number,
  externalRef: string,
  depositAtOrOpts?: Date | SyncAviatorCreditOpts,
): Promise<SyncAviatorCreditResult> {
  if (!uid || amount <= 0) return { bonuses: [], credited: false };

  const opts = normalizeCreditOpts(depositAtOrOpts);
  const depositAt = opts.depositAt ?? new Date();
  const settings = await getSettings();
  let applied: { kind: string; amount: number }[] = [];
  let credited = false;
  let duplicateOf: string | undefined;

  await db.runTransaction(async (tx) => {
    // Read the checkout inside the transaction so a second AVIATOR-* ref for the
    // same Wave charge still sees the provider id, even if the caller omitted it.
    const checkoutSnap = await tx.get(db.doc(`modempay_checkouts/${externalRef}`));
    const checkout = checkoutSnap.exists ? checkoutSnap.data() || {} : {};
    const providerIds = [
      opts.providerTxnId,
      opts.paymentIntentId,
      opts.sessionId,
      checkout.provider_transaction_id,
      checkout.payment_intent_id,
      checkout.session_id,
      ...collectModemPayPaymentIds(opts.payload),
      ...collectModemPayPaymentIds(checkout.raw_payload as Record<string, unknown> | undefined),
    ];
    const lockIds = depositCreditLockIds({
      externalRef,
      reusedFrom: opts.reusedFrom || checkout.reused_from,
      providerIds,
    });

    // One Wave serial may already sit on another receipt. Those reads stay
    // before any write so the transaction can still roll back cleanly.
    for (const raw of providerIds) {
      const pid = String(raw || "").trim();
      if (!pid || pid.startsWith("AVIATOR-") || pid.startsWith("BETESE-")) continue;
      const found = await tx.get(
        db.collection("modempay_checkouts").where("provider_transaction_id", "==", pid).limit(25),
      );
      const other = found.docs.find((doc) => {
        if (doc.id === externalRef) return false;
        const row = doc.data() || {};
        if (row.duplicate_payment === true) return false;
        return row.credited === true || row.aviator_wallet_synced === true;
      });
      if (other) {
        duplicateOf = other.id;
        return;
      }
    }

    const lockRefs = lockIds.map((id) => db.doc(`deposit_credits/${id}`));
    const lockSnaps = await Promise.all(lockRefs.map((ref) => tx.get(ref)));
    const already = lockSnaps.find((snap) => snap.exists);
    if (already) {
      duplicateOf = String(already.data()?.externalRef || already.id);
      return;
    }

    const userRef = db.doc(`users/${uid}`);
    const userSnap = await tx.get(userRef);
    const wallet = await walletRead(tx, uid);
    const isFirst = Number(userSnap.data()?.stats?.totalDeposits ?? 0) <= 0;

    await onReferralDeposit(tx, uid, amount, settings);

    const lockBody = {
      uid,
      amount,
      externalRef,
      creditedAt: new Date().toISOString(),
    };
    for (const ref of lockRefs) {
      tx.set(ref, lockBody);
    }

    walletWrite(tx, wallet, {
      uid,
      amount,
      type: "deposit",
      description: `Deposit via ModemPay (${externalRef})`,
      meta: { externalRef, source: "modempay" },
    });

    const userData = userSnap.data() as
      | { wallet_balance?: number; total_deposited_amount?: number; first_deposit_at?: string | null }
      | undefined;
    if (userSnap.exists) {
      const currentWallet = Number(userData?.wallet_balance || 0);
      const currentDeposited = Number(userData?.total_deposited_amount || 0);
      tx.set(
        userRef,
        {
          wallet_balance: Number((currentWallet + amount).toFixed(2)),
          total_deposited_amount: Number((currentDeposited + amount).toFixed(2)),
          ...(userData?.first_deposit_at ? {} : { first_deposit_at: depositAt.toISOString() }),
        },
        { merge: true },
      );
    }

    creditAgentCustomerDeposits(tx, agentIdsForPlayer(userSnap.data() ?? {}), amount, { isFirst });

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
    credited = true;
  });

  if (credited) {
    await maybeActivateSmartBonus(uid, amount, externalRef);
  }

  return { bonuses: applied, credited, duplicateOf };
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
      debitCashOnly: true,
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
