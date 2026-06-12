import { onSchedule } from "firebase-functions/v2/scheduler";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import {
  db,
  FieldValue,
  getSettings,
  requireRole,
  round2,
  todayIso,
  walletRead,
  walletWrite,
  type ProfileData,
} from "./helpers";

/**
 * Credits one day's GGR commissions to every agent. Idempotent: the
 * commission doc ID is deterministic (agent_player_date) and each row is
 * created inside a transaction that skips if it already exists, so re-running
 * a day can NEVER double-pay.
 */
export async function processCommissionsForDate(date: string): Promise<{
  created: number;
  skipped: number;
  total: number;
}> {
  const settings = await getSettings();
  const rows = await db.collection("agentDailyGgr").where("date", "==", date).get();

  let created = 0;
  let skipped = 0;
  let total = 0;

  for (const row of rows.docs) {
    const { agentId, playerId, bets, wins } = row.data() as {
      agentId: string;
      playerId: string;
      bets?: number;
      wins?: number;
    };
    const ggr = round2((bets ?? 0) - (wins ?? 0));
    if (ggr <= 0) {
      skipped++;
      continue; // no profit, no commission
    }

    const agentSnap = await db.doc(`users/${agentId}`).get();
    if (!agentSnap.exists) {
      skipped++;
      continue;
    }
    const agent = agentSnap.data() as ProfileData;
    if (agent.status !== "active") {
      skipped++;
      continue;
    }
    const rate =
      agent.role === "sub_agent"
        ? settings.subAgentRate
        : agent.role === "super_agent"
          ? settings.superAgentRate
          : 0;
    if (rate <= 0) {
      skipped++;
      continue;
    }

    const playerSnap = await db.doc(`users/${playerId}`).get();
    const playerName = playerSnap.exists ? (playerSnap.data()!.name as string) : null;
    const commissionAmount = round2(ggr * rate);
    const commissionId = `${agentId}_${playerId}_${date}`;

    try {
      // The transaction body may retry on contention, so it must stay free of
      // side effects on the summary counters. It returns whether it created the
      // row; we tally outside, after it commits exactly once.
      const didCreate = await db.runTransaction(async (tx) => {
        const ref = db.doc(`commissions/${commissionId}`);
        const existing = await tx.get(ref);
        if (existing.exists) return false; // already paid — idempotent skip

        const wallet = await walletRead(tx, agentId);
        tx.set(ref, {
          agentId,
          agentName: agent.name,
          playerId,
          playerName,
          ggrAmount: ggr,
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
          description: `Commission ${date} (${(rate * 100).toFixed(1)}% of GGR)`,
          meta: { playerId, playerName, date, ggr },
          ignoreFrozen: true,
        });
        tx.set(
          db.doc(`users/${agentId}`),
          { stats: { commissionEarned: FieldValue.increment(commissionAmount) } },
          { merge: true }
        );
        return true;
      });
      if (didCreate) {
        created++;
        total += commissionAmount;
      } else {
        skipped++;
      }
    } catch (e) {
      logger.error("commission row failed", { commissionId, e });
    }
  }

  logger.info("processCommissions summary", { date, created, skipped, total });
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
