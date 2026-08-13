import { db, round2, walletRead, walletWrite } from "../helpers";
import { CW_TEST_LOBBY_GAME_ID, getCwTestPlayerUid } from "./cwTestPlayer";
import { logger } from "firebase-functions/v2";

/**
 * Rows that must NEVER count toward a customer balance.
 *
 * CRITICAL: Real QTech bets/wins (meta.source === "qtech") MUST always count.
 * Never add `source === "qtech"` here — that previously wiped customer winnings.
 */
function isNonEconomicOrTestRow(data: FirebaseFirestore.DocumentData): boolean {
  const meta = (data.meta ?? {}) as Record<string, unknown>;
  const source = String(meta.source ?? "");
  const desc = String(data.description ?? "");
  const type = String(data.type ?? "");

  // Hard lock — real gameplay is always economic.
  if (source === "qtech") return false;
  if (type === "bet" || type === "win" || type === "refund") {
    if (!/CW certification/i.test(desc)) return false;
  }

  if (source === "qtech_cw_certification") return true;
  if (source === "wallet_repair") return true;
  if (/CW certification/i.test(desc)) return true;
  if (/^Wallet repair:/i.test(desc) || /^Wallet repair \(bonus\)/i.test(desc)) return true;
  return false;
}

type LedgerRow = FirebaseFirestore.DocumentData & { id: string };

async function loadLedgerRows(uid: string): Promise<LedgerRow[]> {
  const snap = await db.collection("transactions").where("userId", "==", uid).get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as LedgerRow))
    .sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return ta - tb;
    });
}

function applyLedgerRow(
  row: LedgerRow,
  state: { cash: number; bonus: number },
): void {
  const amount = round2(Number(row.amount));
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  if (amount < 0) {
    state.cash = round2(state.cash - Number(meta.fromCash ?? Math.abs(amount)));
    state.bonus = round2(state.bonus - Number(meta.fromBonus ?? 0));
  } else if (row.type === "bonus" || meta.creditAsBonus === true) {
    state.bonus = round2(state.bonus + amount);
  } else {
    state.cash = round2(state.cash + amount);
  }
  if (state.cash < 0) state.cash = 0;
  if (state.bonus < 0) state.bonus = 0;
}

/** True customer balance: deposits + real QTech play − payouts. Excludes CW cert + old repairs. */
export async function computeLegitimateWallet(uid: string): Promise<{
  cash: number;
  bonus: number;
  excludedCount: number;
  includedCount: number;
}> {
  const rows = await loadLedgerRows(uid);
  const state = { cash: 0, bonus: 0 };
  let excludedCount = 0;
  let includedCount = 0;

  for (const row of rows) {
    if (isNonEconomicOrTestRow(row)) {
      excludedCount++;
      continue;
    }
    includedCount++;
    applyLedgerRow(row, state);
  }

  return {
    cash: state.cash,
    bonus: state.bonus,
    excludedCount,
    includedCount,
  };
}

export async function summarizePlayerLedger(uid: string): Promise<{
  current: { cash: number; bonus: number };
  correct: { cash: number; bonus: number };
  excludedCount: number;
  includedCount: number;
  bySource: Record<string, { count: number; net: number }>;
  recent: Array<{
    type: string;
    amount: number;
    description: string;
    source: string | null;
    gameId: string | null;
  }>;
}> {
  const walletSnap = await db.doc(`wallets/${uid}`).get();
  const rows = await loadLedgerRows(uid);
  const correct = await computeLegitimateWallet(uid);
  const bySource: Record<string, { count: number; net: number }> = {};

  for (const row of rows) {
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    const source = String(meta.source ?? row.type ?? "unknown");
    if (!bySource[source]) bySource[source] = { count: 0, net: 0 };
    bySource[source].count += 1;
    bySource[source].net = round2(bySource[source].net + Number(row.amount ?? 0));
  }

  const recent = rows.slice(-30).map((r) => {
    const meta = (r.meta ?? {}) as Record<string, unknown>;
    return {
      type: String(r.type ?? ""),
      amount: Number(r.amount ?? 0),
      description: String(r.description ?? "").slice(0, 100),
      source: meta.source != null ? String(meta.source) : null,
      gameId: meta.gameId != null ? String(meta.gameId) : null,
    };
  });

  return {
    current: {
      cash: round2(Number(walletSnap.data()?.balance ?? 0)),
      bonus: round2(Number(walletSnap.data()?.bonusBalance ?? 0)),
    },
    correct: { cash: correct.cash, bonus: correct.bonus },
    excludedCount: correct.excludedCount,
    includedCount: correct.includedCount,
    bySource,
    recent,
  };
}

export async function repairWalletFromLedger(
  uid: string,
  reason: string,
  _opts?: { allowDecrease?: boolean }
): Promise<{
  before: { cash: number; bonus: number };
  after: { cash: number; bonus: number };
  excludedCount: number;
  skippedDecrease?: boolean;
}> {
  const target = await computeLegitimateWallet(uid);
  const walletSnap = await db.doc(`wallets/${uid}`).get();
  const before = {
    cash: round2(Number(walletSnap.data()?.balance ?? 0)),
    bonus: round2(Number(walletSnap.data()?.bonusBalance ?? 0)),
  };

  // NEVER reduce a customer wallet. Only restore missing funds (e.g. wiped wins).
  const safeTarget = {
    cash: round2(Math.max(before.cash, target.cash)),
    bonus: round2(Math.max(before.bonus, target.bonus)),
  };

  const cashDelta = round2(safeTarget.cash - before.cash);
  const bonusDelta = round2(safeTarget.bonus - before.bonus);

  if (safeTarget.cash > target.cash || safeTarget.bonus > target.bonus) {
    logger.warn("Wallet repair will not decrease customer funds — keeping higher live balance", {
      uid,
      before,
      ledger: target,
      safeTarget,
      reason,
    });
  }

  if (Math.abs(cashDelta) < 0.01 && Math.abs(bonusDelta) < 0.01) {
    return {
      before,
      after: before,
      excludedCount: target.excludedCount,
      skippedDecrease: before.cash > target.cash || before.bonus > target.bonus,
    };
  }

  await db.runTransaction(async (tx) => {
    const wallet = await walletRead(tx, uid);
    // Re-check inside txn — still never decrease.
    const nextCash = round2(Math.max(wallet.balance, target.cash));
    const nextBonus = round2(Math.max(wallet.bonusBalance, target.bonus));
    const nextCashDelta = round2(nextCash - wallet.balance);
    const nextBonusDelta = round2(nextBonus - wallet.bonusBalance);

    if (nextCashDelta > 0) {
      walletWrite(tx, wallet, {
        uid,
        amount: nextCashDelta,
        type: "deposit",
        description: `Wallet repair: ${reason}`,
        meta: {
          source: "wallet_repair",
          targetCash: nextCash,
          targetBonus: nextBonus,
          mode: "credit_only",
        },
        ignoreFrozen: true,
      });
    }
    if (nextBonusDelta > 0) {
      walletWrite(tx, wallet, {
        uid,
        amount: nextBonusDelta,
        type: "bonus",
        creditAsBonus: true,
        description: `Wallet repair (bonus): ${reason}`,
        meta: {
          source: "wallet_repair",
          targetCash: nextCash,
          targetBonus: nextBonus,
          mode: "credit_only",
        },
        ignoreFrozen: true,
      });
    }
  });

  return {
    before,
    after: safeTarget,
    excludedCount: target.excludedCount,
  };
}

/** UIDs that had Common Wallet certification sessions (gameId qtech-crash). */
export async function findCwTouchedCustomerUids(): Promise<string[]> {
  const cwUid = await getCwTestPlayerUid();
  const snap = await db.collection("qtechSessions").where("gameId", "==", CW_TEST_LOBBY_GAME_ID).get();
  const uids = new Set<string>();
  for (const doc of snap.docs) {
    const uid = String(doc.data()?.uid ?? "").trim();
    if (uid && uid !== cwUid) uids.add(uid);
  }
  return [...uids];
}

/**
 * Align CW-touched wallets to the correct ledger (keeps real QTech wins).
 */
export async function repairCwPollutedCustomerWallets(opts?: {
  apply?: boolean;
  limit?: number;
}): Promise<{
  scanned: number;
  repaired: Array<{
    uid: string;
    phone: string | null;
    before: { cash: number; bonus: number };
    after: { cash: number; bonus: number };
    excludedCount: number;
  }>;
  skipped: Array<{ uid: string; reason: string }>;
  dryRun: boolean;
}> {
  const apply = opts?.apply === true;
  const limit = Math.max(1, Math.min(Number(opts?.limit ?? 50) || 50, 200));
  const uids = (await findCwTouchedCustomerUids()).slice(0, limit);
  const repaired: Array<{
    uid: string;
    phone: string | null;
    before: { cash: number; bonus: number };
    after: { cash: number; bonus: number };
    excludedCount: number;
  }> = [];
  const skipped: Array<{ uid: string; reason: string }> = [];

  for (const uid of uids) {
    const walletSnap = await db.doc(`wallets/${uid}`).get();
    const userSnap = await db.doc(`users/${uid}`).get();
    const current = {
      cash: round2(Number(walletSnap.data()?.balance ?? 0)),
      bonus: round2(Number(walletSnap.data()?.bonusBalance ?? 0)),
    };
    const ledger = await computeLegitimateWallet(uid);
    const cashDelta = round2(current.cash - ledger.cash);
    const bonusDelta = round2(current.bonus - ledger.bonus);
    if (Math.abs(cashDelta) < 0.01 && Math.abs(bonusDelta) < 0.01) {
      skipped.push({ uid, reason: "already_clean" });
      continue;
    }

    if (!apply) {
      repaired.push({
        uid,
        phone: userSnap.exists ? String(userSnap.data()?.phone ?? "") || null : null,
        before: current,
        after: { cash: ledger.cash, bonus: ledger.bonus },
        excludedCount: ledger.excludedCount,
      });
      continue;
    }

    const result = await repairWalletFromLedger(uid, "Restore missing funds only (never decrease)");
    if (result.skippedDecrease && result.before.cash === result.after.cash && result.before.bonus === result.after.bonus) {
      skipped.push({ uid, reason: "no_credit_needed" });
      continue;
    }
    repaired.push({
      uid,
      phone: userSnap.exists ? String(userSnap.data()?.phone ?? "") || null : null,
      ...result,
    });
  }

  return { scanned: uids.length, repaired, skipped, dryRun: !apply };
}
