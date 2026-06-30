import { db, round2, walletRead, walletWrite } from "../helpers";

function isQTechTestPollution(data: FirebaseFirestore.DocumentData): boolean {
  const meta = (data.meta ?? {}) as Record<string, unknown>;
  const desc = String(data.description ?? "");
  if (meta.source === "qtech" || meta.source === "qtech_cw_certification") return true;
  if (/QTech/i.test(desc)) return true;
  return false;
}

export async function computeLegitimateWallet(uid: string): Promise<{
  cash: number;
  bonus: number;
  excludedCount: number;
  includedCount: number;
}> {
  const snap = await db.collection("transactions").where("userId", "==", uid).get();
  type LedgerRow = FirebaseFirestore.DocumentData & { id: string };
  const rows: LedgerRow[] = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as LedgerRow))
    .sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return ta - tb;
    });

  let cash = 0;
  let bonus = 0;
  let excludedCount = 0;
  let includedCount = 0;

  for (const row of rows) {
    if (isQTechTestPollution(row)) {
      excludedCount++;
      continue;
    }
    includedCount++;
    const amount = round2(Number(row.amount));
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    if (amount < 0) {
      cash = round2(cash - Number(meta.fromCash ?? Math.abs(amount)));
      bonus = round2(bonus - Number(meta.fromBonus ?? 0));
    } else if (row.type === "bonus") {
      bonus = round2(bonus + amount);
    } else {
      cash = round2(cash + amount);
    }
  }

  return { cash, bonus, excludedCount, includedCount };
}

export async function repairWalletFromLedger(
  uid: string,
  reason: string
): Promise<{
  before: { cash: number; bonus: number };
  after: { cash: number; bonus: number };
  excludedCount: number;
}> {
  const target = await computeLegitimateWallet(uid);
  const walletSnap = await db.doc(`wallets/${uid}`).get();
  const before = {
    cash: round2(Number(walletSnap.data()?.balance ?? 0)),
    bonus: round2(Number(walletSnap.data()?.bonusBalance ?? 0)),
  };

  await db.runTransaction(async (tx) => {
    const wallet = await walletRead(tx, uid);
    const cashDelta = round2(target.cash - wallet.balance);
    const bonusDelta = round2(target.bonus - wallet.bonusBalance);

    if (cashDelta !== 0) {
      walletWrite(tx, wallet, {
        uid,
        amount: cashDelta,
        type: cashDelta > 0 ? "deposit" : "withdrawal",
        description: `Wallet repair: ${reason}`,
        meta: { source: "wallet_repair", targetCash: target.cash, targetBonus: target.bonus },
        ignoreFrozen: true,
      });
    }
    if (bonusDelta !== 0) {
      walletWrite(tx, wallet, {
        uid,
        amount: bonusDelta,
        type: "bonus",
        creditAsBonus: true,
        description: `Wallet repair (bonus): ${reason}`,
        meta: { source: "wallet_repair", targetCash: target.cash, targetBonus: target.bonus },
        ignoreFrozen: true,
      });
    }
  });

  return {
    before,
    after: { cash: target.cash, bonus: target.bonus },
    excludedCount: target.excludedCount,
  };
}
