/**
 * Admin paste-and-send SMS. Sends the typed message only.
 * Does not create a Smart Bonus offer or change a wallet.
 */
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { db, FieldValue, requireRole } from "./helpers";
import { toMsisdn } from "./smartBonusNotify";
import { sendSmsWithFallback } from "./routes/otp";

const BATCH = 8;
const TIME_BUDGET_MS = 240_000;
const MAX_MESSAGE = 480;

export const adminStartPromoSms = onCall({ timeoutSeconds: 300 }, async (req) => {
  const { uid } = await requireRole(req, ["admin"]);
  const message = String(req.data?.message ?? "").replace(/\s+/g, " ").trim();
  if (message.length < 10) {
    throw new HttpsError("invalid-argument", "Paste a message of at least 10 characters.");
  }
  if (message.length > MAX_MESSAGE) {
    throw new HttpsError("invalid-argument", `Message must be ${MAX_MESSAGE} characters or less.`);
  }

  const running = await db.collection("promoSmsCampaigns").where("status", "==", "running").limit(1).get();
  if (!running.empty) {
    throw new HttpsError("failed-precondition", "A promo SMS is already sending. Wait until it finishes.");
  }

  const ref = db.collection("promoSmsCampaigns").doc();
  await ref.set({
    status: "running",
    message,
    cursor: "",
    lockUntil: 0,
    processed: 0,
    smsSent: 0,
    smsFailed: 0,
    skipped: 0,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await processPromoSmsCore();
  const saved = (await ref.get()).data() ?? {};
  return {
    ok: true as const,
    campaignId: ref.id,
    smsSent: Number(saved.smsSent ?? 0),
    smsFailed: Number(saved.smsFailed ?? 0),
  };
});

export const adminCancelPromoSms = onCall(async (req) => {
  await requireRole(req, ["admin"]);
  const campaignId = String(req.data?.campaignId ?? "");
  const ref = campaignId
    ? db.doc(`promoSmsCampaigns/${campaignId}`)
    : (await db.collection("promoSmsCampaigns").where("status", "==", "running").limit(1).get()).docs[0]?.ref;
  if (!ref) throw new HttpsError("not-found", "No promo SMS is sending.");
  await ref.set(
    { status: "canceled", updatedAt: FieldValue.serverTimestamp(), lockUntil: 0 },
    { merge: true },
  );
  return { ok: true as const };
});

export const processPromoSms = onSchedule(
  { schedule: "* * * * *", timeZone: "Africa/Dakar", timeoutSeconds: 300, memory: "512MiB" },
  async () => {
    await processPromoSmsCore();
  },
);

async function processPromoSmsCore(): Promise<void> {
  const snap = await db.collection("promoSmsCampaigns").where("status", "==", "running").limit(1).get();
  if (snap.empty) return;
  const campRef = snap.docs[0].ref;

  const claimed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(campRef);
    const d = fresh.data();
    if (!d || d.status !== "running") return false;
    if (Number(d.lockUntil ?? 0) > Date.now()) return false;
    tx.update(campRef, { lockUntil: Date.now() + 6 * 60 * 1000 });
    return true;
  });
  if (!claimed) return;

  const c = (await campRef.get()).data()!;
  const message = String(c.message ?? "").trim();
  let cursor = String(c.cursor ?? "");
  let processed = Number(c.processed ?? 0);
  let smsSent = Number(c.smsSent ?? 0);
  let smsFailed = Number(c.smsFailed ?? 0);
  let skipped = Number(c.skipped ?? 0);

  let q = db
    .collection("users")
    .where("role", "==", "player")
    .where("status", "==", "active")
    .orderBy("__name__")
    .limit(BATCH);
  if (cursor) q = q.startAfter(cursor);
  const page = await q.get();

  const startedMs = Date.now();
  let handled = 0;
  for (const userDoc of page.docs) {
    if (Date.now() - startedMs > TIME_BUDGET_MS) break;
    const latest = await campRef.get();
    if (latest.data()?.status !== "running") break;
    handled += 1;
    cursor = userDoc.id;
    processed += 1;
    const phone = (userDoc.data().phone as string | null) ?? null;
    const msisdn = toMsisdn(phone);
    if (!msisdn) {
      skipped += 1;
      continue;
    }
    try {
      await sendSmsWithFallback(msisdn, message);
      smsSent += 1;
    } catch (e) {
      smsFailed += 1;
      logger.warn("promo SMS failed", { uid: userDoc.id, error: String(e) });
    }
  }

  const done = page.empty || (page.size < BATCH && handled === page.size);
  const stillRunning = (await campRef.get()).data()?.status === "running";
  await campRef.set(
    {
      cursor,
      processed,
      smsSent,
      smsFailed,
      skipped,
      lockUntil: 0,
      status: !stillRunning ? "canceled" : done ? "done" : "running",
      updatedAt: FieldValue.serverTimestamp(),
      ...(done && stillRunning ? { completedAt: FieldValue.serverTimestamp() } : {}),
    },
    { merge: true },
  );
  logger.info("promo SMS batch", { campaign: campRef.id, processed, smsSent, smsFailed, skipped, done });
}
