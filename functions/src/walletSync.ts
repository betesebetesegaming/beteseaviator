/**
 * Keeps aviator's `wallets/{uid}` ledger in sync when ModemPay webhooks credit
 * `users.wallet_balance` (same field betesepmu uses).
 */
import { db, walletRead, walletWrite } from "./helpers";

export async function syncAviatorWalletCredit(
  uid: string,
  amount: number,
  externalRef: string
): Promise<void> {
  if (!uid || amount <= 0) return;
  await db.runTransaction(async (tx) => {
    const wallet = await walletRead(tx, uid);
    walletWrite(tx, wallet, {
      uid,
      amount,
      type: "deposit",
      description: `Deposit via ModemPay (${externalRef})`,
      meta: { externalRef, source: "modempay" },
    });
  });
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
