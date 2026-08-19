import { onSchedule } from "firebase-functions/v2/scheduler";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { agentCommissionRate } from "./roles";
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
  type ProfileData,
} from "./helpers";

function agentIdsForPlayer(player: ProfileData): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | null | undefined) => {
    const v = String(id || "").trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    ids.push(v);
  };
  if (Array.isArray(player.ancestors)) {
    for (const id of player.ancestors) add(id);
  }
  add(player.parentId);
  return ids;
}

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
 * Daily rows sum to the week and month 5% totals. High-water mark so a
 * re-run never double-pays.
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

  type Book = { deposits: number; withdrawals: number; cashHeld: number };
  const books = new Map<string, Book>();
  for (const agentId of agentStatus.keys()) {
    books.set(agentId, { deposits: 0, withdrawals: 0, cashHeld: 0 });
  }

  for (const doc of playersSnap.docs) {
    const player = doc.data() as ProfileData;
    const stats = player.stats ?? {};
    const deposits = Number(stats.totalDeposits ?? 0);
    const withdrawals = Number(stats.totalWithdrawals ?? 0);
    const cashHeld = cashByPlayer.get(doc.id) ?? Number(stats.walletCash ?? 0);
    for (const agentId of agentIdsForPlayer(player)) {
      const book = books.get(agentId);
      if (!book) continue;
      book.deposits = round2(book.deposits + deposits);
      book.withdrawals = round2(book.withdrawals + withdrawals);
      book.cashHeld = round2(book.cashHeld + Math.max(0, cashHeld));
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

    try {
      const paid = await db.runTransaction(async (tx) => {
        const ref = db.doc(`commissions/${commissionId}`);
        const existing = await tx.get(ref);
        if (existing.exists) return 0;

        const agentSnap = await tx.get(db.doc(`users/${agentId}`));
        const live = (agentSnap.data() as ProfileData | undefined)?.stats ?? {};
        const peakRaw = live.commissionedGgr;
        const peakKnown = peakRaw !== undefined && peakRaw !== null && Number.isFinite(Number(peakRaw));
        const peak = peakKnown ? round2(Number(peakRaw)) : currentGgr;

        if (!peakKnown) {
          tx.set(
            db.doc(`users/${agentId}`),
            { stats: { commissionedGgr: currentGgr } },
            { merge: true }
          );
          return 0;
        }

        const increment = round2(Math.max(0, currentGgr - peak));
        if (increment <= 0) return 0;

        const commissionAmount = round2(increment * rate);
        if (commissionAmount <= 0) return 0;

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
        tx.set(
          db.doc(`users/${agentId}`),
          {
            stats: {
              commissionEarned: FieldValue.increment(commissionAmount),
              commissionedGgr: round2(peak + increment),
              customerDeposits: round2(
                Math.max(Number(live.customerDeposits ?? 0), book.deposits)
              ),
              customerWithdrawals: book.withdrawals,
              customerCashHeld: book.cashHeld,
            },
          },
          { merge: true }
        );
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

/** Daily at 01:00 (Dakar time): pay yesterday's commissions. */
export const processCommissions = onSchedule(
  { schedule: "0 1 * * *", timeZone: "Africa/Dakar" },
  async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await processCommissionsForDate(todayIso(yesterday));
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
