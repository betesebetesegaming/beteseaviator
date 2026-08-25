import { onSchedule } from "firebase-functions/v2/scheduler";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { agentCommissionRate } from "./roles";
import { rtdbSuccessfulDepositsByCustomer } from "./paymentsRtdb";
import {
  db,
  FieldValue,
  getSettings,
  requireRole,
  round2,
  todayIso,
  walletRead,
  walletWrite,
  commissionableGgr,
  ggrPeriodAnchorUpdates,
  agentIdsForPlayer,
  type ProfileData,
} from "./helpers";

async function walletCashByUid(uids: string[]): Promise<Map<string, number>> {
  const cash = new Map<string, number>();
  const chunkSize = 80;
  for (let i = 0; i < uids.length; i += chunkSize) {
    const refs = uids.slice(i, i + chunkSize).map((id) => db.doc(`wallets/${id}`));
    if (refs.length === 0) continue;
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      cash.set(snap.id, round2(Number(snap.data()?.balance ?? 0)));
    }
  }
  return cash;
}

/**
 * Pay each agent 5% of commissionable GGR (net cash BETESE kept from their
 * customers: all deposits − withdrawals − cash still in those wallets).
 *
 * First deposit and later top-ups both count. Recycled winnings do not.
 * Live GGR moves as customers play. Day / week / month each show that
 * period's profit (a new month starts sales and GGR at 0). Daily credits
 * are 5% of new profit; week and month 5% are the same rate on that
 * period's GGR — not extra stacked payments. High-water mark so a re-run
 * never double-pays.
 */
export async function processCommissionsForDate(date: string): Promise<{
  created: number;
  skipped: number;
  total: number;
}> {
  const settings = await getSettings();
  const rate = agentCommissionRate(settings);
  if (rate <= 0) {
    return { created: 0, skipped: 0, total: 0 };
  }

  const [playersSnap, agentsSnap] = await Promise.all([
    db.collection("users").where("role", "==", "player").get(),
    db.collection("users").where("role", "in", ["agent", "super_agent", "sub_agent"]).get(),
  ]);

  const agentStatus = new Map<string, ProfileData>();
  for (const doc of agentsSnap.docs) {
    agentStatus.set(doc.id, doc.data() as ProfileData);
  }

  const playerUids = playersSnap.docs.map((d) => d.id);
  const cashByPlayer = await walletCashByUid(playerUids);

  const rtdbByCustomer = await rtdbSuccessfulDepositsByCustomer();

  type Book = { deposits: number; withdrawals: number; cashHeld: number; salesDeposits: number };
  const books = new Map<string, Book>();
  for (const agentId of agentStatus.keys()) {
    books.set(agentId, { deposits: 0, withdrawals: 0, cashHeld: 0, salesDeposits: 0 });
  }

  for (const doc of playersSnap.docs) {
    const player = doc.data() as ProfileData;
    const stats = player.stats ?? {};
    const deposits = Number(stats.totalDeposits ?? 0);
    const withdrawals = Number(stats.totalWithdrawals ?? 0);
    const cashHeld = cashByPlayer.get(doc.id) ?? Number(stats.walletCash ?? 0);
    const salesDeposits = round2(Math.max(deposits, rtdbByCustomer.get(doc.id) ?? 0));
    for (const agentId of agentIdsForPlayer(player)) {
      const book = books.get(agentId);
      if (!book) continue;
      book.deposits = round2(book.deposits + deposits);
      book.withdrawals = round2(book.withdrawals + withdrawals);
      book.cashHeld = round2(book.cashHeld + Math.max(0, cashHeld));
      book.salesDeposits = round2(book.salesDeposits + salesDeposits);
    }
  }

  let created = 0;
  let skipped = 0;
  let total = 0;

  for (const [agentId, book] of books) {
    const agent = agentStatus.get(agentId);
    if (!agent || agent.status !== "active") {
      skipped++;
      continue;
    }

    const currentGgr = commissionableGgr(book.deposits, book.withdrawals, book.cashHeld);
    const commissionId = `${agentId}_book_${date}`;
    const calendarToday = todayIso();

    try {
      const paid = await db.runTransaction(async (tx) => {
        const ref = db.doc(`commissions/${commissionId}`);
        const existing = await tx.get(ref);
        const agentSnap = await tx.get(db.doc(`users/${agentId}`));
        const live = (agentSnap.data() as ProfileData | undefined)?.stats ?? {};
        const anchors = ggrPeriodAnchorUpdates(calendarToday, currentGgr, book.deposits, live);
        const bookStats = {
          customerDeposits: round2(
            Math.max(
              Number(live.customerDeposits ?? 0),
              book.deposits,
              book.salesDeposits
            )
          ),
          customerWithdrawals: book.withdrawals,
          customerCashHeld: book.cashHeld,
        };

        const writeStats = (extra: Record<string, unknown>) => {
          tx.set(
            db.doc(`users/${agentId}`),
            { stats: { ...bookStats, ...anchors, ...extra } },
            { merge: true }
          );
        };

        if (existing.exists) {
          if (Object.keys(anchors).length > 0) writeStats({});
          return 0;
        }

        const peakRaw = live.commissionedGgr;
        const peakKnown = peakRaw !== undefined && peakRaw !== null && Number.isFinite(Number(peakRaw));
        const peak = peakKnown ? round2(Number(peakRaw)) : currentGgr;

        if (!peakKnown) {
          writeStats({ commissionedGgr: currentGgr });
          return 0;
        }

        const increment = round2(Math.max(0, currentGgr - peak));
        if (increment <= 0) {
          writeStats({ commissionedGgr: peak });
          return 0;
        }

        const commissionAmount = round2(increment * rate);
        if (commissionAmount <= 0) {
          writeStats({ commissionedGgr: peak });
          return 0;
        }

        const wallet = await walletRead(tx, agentId);
        tx.set(ref, {
          agentId,
          agentName: agent.name,
          playerId: "network",
          playerName: "All linked customers",
          ggrAmount: increment,
          commissionRate: rate,
          commissionAmount,
          periodDate: date,
          paidAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        });
        walletWrite(tx, wallet, {
          uid: agentId,
          amount: commissionAmount,
          type: "commission",
          description: `Commission ${date} (${(rate * 100).toFixed(1)}% of GGR profit)`,
          meta: {
            date,
            increment,
            currentGgr,
            deposits: book.deposits,
            withdrawals: book.withdrawals,
            cashHeld: book.cashHeld,
          },
          ignoreFrozen: true,
        });
        writeStats({
          commissionEarned: FieldValue.increment(commissionAmount),
          commissionedGgr: round2(peak + increment),
        });
        return commissionAmount;
      });
      if (paid > 0) {
        created++;
        total = round2(total + paid);
      } else {
        skipped++;
      }
    } catch (e) {
      logger.error("commission row failed", { commissionId, e });
    }
  }

  logger.info("processCommissions summary", { date, created, skipped, total, rate });
  return { created, skipped, total };
}

/**
 * Lift stored marketer deposit books to Wave + wallet work.
 * Never reduces a copied total.
 */
export async function healMarketerSalesBooks(): Promise<{ agentsUpdated: number }> {
  const [playersSnap, agentsSnap, rtdbByCustomer] = await Promise.all([
    db.collection("users").where("role", "==", "player").get(),
    db.collection("users").where("role", "in", ["agent", "super_agent", "sub_agent"]).get(),
    rtdbSuccessfulDepositsByCustomer(),
  ]);
  const sales = new Map<string, number>();
  const existingDeposits = new Map<string, number>();
  for (const d of agentsSnap.docs) {
    sales.set(d.id, 0);
    existingDeposits.set(d.id, Number((d.data() as ProfileData).stats?.customerDeposits ?? 0));
  }
  for (const doc of playersSnap.docs) {
    const player = doc.data() as ProfileData;
    const credited = round2(
      Math.max(Number(player.stats?.totalDeposits ?? 0), rtdbByCustomer.get(doc.id) ?? 0)
    );
    if (credited <= 0) continue;
    for (const agentId of agentIdsForPlayer(player)) {
      if (!sales.has(agentId)) continue;
      sales.set(agentId, round2((sales.get(agentId) ?? 0) + credited));
    }
  }
  let agentsUpdated = 0;
  const entries = [...sales.entries()];
  const chunkSize = 400;
  for (let i = 0; i < entries.length; i += chunkSize) {
    const batch = db.batch();
    let writes = 0;
    for (const [agentId, amount] of entries.slice(i, i + chunkSize)) {
      const next = round2(Math.max(existingDeposits.get(agentId) ?? 0, amount));
      if (next <= (existingDeposits.get(agentId) ?? 0) + 1e-9) continue;
      batch.set(db.doc(`users/${agentId}`), { stats: { customerDeposits: next } }, { merge: true });
      writes += 1;
      agentsUpdated += 1;
    }
    if (writes > 0) await batch.commit();
  }
  logger.info("healMarketerSalesBooks", { agentsUpdated });
  return { agentsUpdated };
}

/** Daily at 01:00 (Dakar time): pay yesterday's commissions. */
export const processCommissions = onSchedule(
  { schedule: "0 1 * * *", timeZone: "Africa/Dakar" },
  async () => {
    await healMarketerSalesBooks();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await processCommissionsForDate(todayIso(yesterday));
  }
);

/** Keep copied deposit totals complete during the day. */
export const reconcileMarketerDepositBooks = onSchedule(
  { schedule: "10 */4 * * *", timeZone: "Africa/Dakar", timeoutSeconds: 300, memory: "512MiB" },
  async () => {
    await healMarketerSalesBooks();
  }
);

/** Admin can (re-)run any day safely — used for back-processing. */
export const adminRunCommissions = onCall(async (req) => {
  await requireRole(req, ["admin"]);
  const date = String(req.data?.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new HttpsError("invalid-argument", "date must be YYYY-MM-DD.");
  }
  return processCommissionsForDate(date);
});
