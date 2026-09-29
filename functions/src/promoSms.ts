/**
 * Admin paste-and-send SMS. Sends the typed message only.
 * Does not create a Smart Bonus offer or change a wallet.
 */
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { db, FieldValue, requireRole } from "./helpers";
import { toMsisdn } from "./smartBonusNotify";

const PAGE = 40;
const PARALLEL = 5;
const TIME_BUDGET_MS = 200_000;
const MAX_MESSAGE = 480;
const PMU_OTP_BASE_URL = (
  process.env.PMU_OTP_API_BASE_URL || "https://us-central1-betesepmu-4ffc7.cloudfunctions.net"
).replace(/\/+$/, "");

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

/** One row per phone. create() fails if this campaign already claimed that number. */
async function claimPhone(campaignId: string, msisdn: string): Promise<boolean> {
  try {
    await db.doc(`promoSmsCampaigns/${campaignId}/sent/${msisdn}`).create({
      status: "sending",
      at: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (e) {
    const code = (e as { code?: number | string }).code;
    if (code === 6 || code === "already-exists" || String(e).includes("ALREADY_EXISTS")) return false;
    throw e;
  }
}

/** PMU delivers the text directly. Africell from this server usually times out first and makes every text slow. */
async function sendPromoSms(msisdn: string, message: string): Promise<void> {
  const phone = msisdn.startsWith("220") && msisdn.length >= 10 ? msisdn.slice(3) : msisdn;
  const res = await fetch(`${PMU_OTP_BASE_URL}/sendOtp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, message, code: "000000" }),
    signal: AbortSignal.timeout(12000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!(res.ok && data.ok === true)) {
    throw new Error(data.error || `SMS failed (${res.status})`);
  }
}

async function processPromoSmsCore(): Promise<void> {
  const snap = await db.collection("promoSmsCampaigns").where("status", "==", "running").limit(1).get();
  if (snap.empty) return;
  const campRef = snap.docs[0].ref;
  const campaignId = campRef.id;

  const claimed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(campRef);
    const d = fresh.data();
    if (!d || d.status !== "running") return false;
    if (Number(d.lockUntil ?? 0) > Date.now()) return false;
    tx.update(campRef, { lockUntil: Date.now() + TIME_BUDGET_MS + 60_000 });
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
  let skippedDuplicate = Number(c.skippedDuplicate ?? 0);
  const deadline = Date.now() + TIME_BUDGET_MS;
  let done = false;

  const save = async (finished: boolean) => {
    const fresh = await campRef.get();
    const canceled = fresh.data()?.status !== "running";
    const status = canceled ? "canceled" : finished ? "done" : "running";
    await campRef.set(
      {
        cursor,
        processed,
        smsSent,
        smsFailed,
        skipped,
        skippedDuplicate,
        // Hold the lock until this run is finished so the next minute cannot text the same page.
        lockUntil: status === "running" ? deadline + 30_000 : 0,
        status,
        updatedAt: FieldValue.serverTimestamp(),
        ...(status === "done" ? { completedAt: FieldValue.serverTimestamp() } : {}),
      },
      { merge: true },
    );
  };

  while (Date.now() < deadline) {
    const latest = await campRef.get();
    if (latest.data()?.status !== "running") {
      await save(false);
      return;
    }

    let q = db
      .collection("users")
      .where("role", "==", "player")
      .where("status", "==", "active")
      .orderBy("__name__")
      .limit(PAGE);
    if (cursor) q = q.startAfter(cursor);
    const page = await q.get();
    if (page.empty) {
      done = true;
      break;
    }

    const wave: Array<Promise<void>> = [];
    const flush = async () => {
      if (!wave.length) return;
      await Promise.all(wave);
      wave.length = 0;
      await save(false);
    };

    for (const userDoc of page.docs) {
      if (Date.now() >= deadline) break;
      cursor = userDoc.id;
      processed += 1;
      const msisdn = toMsisdn((userDoc.data().phone as string | null) ?? null);
      if (!msisdn) {
        skipped += 1;
        continue;
      }
      const firstTime = await claimPhone(campaignId, msisdn);
      if (!firstTime) {
        skippedDuplicate += 1;
        continue;
      }
      wave.push(
        sendPromoSms(msisdn, message)
          .then(async () => {
            smsSent += 1;
            await db.doc(`promoSmsCampaigns/${campaignId}/sent/${msisdn}`).set(
              { status: "sent", at: FieldValue.serverTimestamp() },
              { merge: true },
            );
          })
          .catch(async (e) => {
            // Keep the claim so a retry cannot text this number again.
            smsFailed += 1;
            await db.doc(`promoSmsCampaigns/${campaignId}/sent/${msisdn}`).set(
              { status: "failed", error: String(e).slice(0, 180), at: FieldValue.serverTimestamp() },
              { merge: true },
            );
            logger.warn("promo SMS failed", { msisdn, error: String(e) });
          }),
      );
      if (wave.length >= PARALLEL) await flush();
    }
    await flush();

    if (cursor === page.docs[page.docs.length - 1]?.id && page.size < PAGE) {
      done = true;
      break;
    }
  }

  await save(done);
  logger.info("promo SMS batch", { campaign: campaignId, processed, smsSent, smsFailed, skipped, skippedDuplicate, done });
}
