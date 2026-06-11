import * as crypto from "crypto";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { defineString } from "firebase-functions/params";
import {
  db,
  FieldValue,
  getSettings,
  normalizePhone,
  requireRole,
  round2,
  todayIso,
  walletRead,
  walletWrite,
  bumpDailyStats,
  bumpPlatformStats,
  PROVIDERS,
  type Provider,
  type ProfileData,
} from "./helpers";

// Per-provider webhook secrets. FAIL CLOSED: while a secret is unset, that
// provider's webhooks are rejected and nobody can fake a deposit confirmation.
const WEBHOOK_SECRETS: Record<Provider, ReturnType<typeof defineString>> = {
  wave: defineString("WAVE_WEBHOOK_SECRET", { default: "" }),
  afrimoney: defineString("AFRIMONEY_WEBHOOK_SECRET", { default: "" }),
  aps: defineString("APS_WEBHOOK_SECRET", { default: "" }),
  qmoney: defineString("QMONEY_WEBHOOK_SECRET", { default: "" }),
};

function assertProvider(value: string): Provider {
  if (!PROVIDERS.includes(value as Provider)) {
    throw new HttpsError("invalid-argument", "Unknown payment provider.");
  }
  return value as Provider;
}

/**
 * Customer deposit via mobile money. Creates a pending payment request; the
 * wallet is credited ONLY when the provider's signed webhook (or an admin)
 * confirms the payment.
 */
export const requestDeposit = onCall(async (req) => {
  const { uid, profile } = await requireRole(req, ["player"]);
  const settings = await getSettings();
  const provider = assertProvider(String(req.data?.provider ?? ""));
  const phone = normalizePhone(String(req.data?.phone ?? ""));
  const amount = round2(Number(req.data?.amount));

  if (settings.providers[provider] === false) {
    throw new HttpsError("failed-precondition", "This provider is currently disabled.");
  }
  if (!phone) throw new HttpsError("invalid-argument", "Phone is required.");
  if (!Number.isFinite(amount) || amount < settings.minDeposit) {
    throw new HttpsError("invalid-argument", `Minimum deposit is ${settings.minDeposit} GMD.`);
  }

  const reference = `DEP-${Date.now().toString(36).toUpperCase()}-${crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase()}`;
  const ref = db.collection("paymentRequests").doc();
  await ref.set({
    userId: uid,
    userName: profile.name,
    userRole: profile.role,
    type: "deposit",
    amount,
    provider,
    status: "pending",
    providerRef: reference,
    approvedBy: null,
    meta: { phone },
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    requestId: ref.id,
    reference,
    instructions: `Deposit request created (ref ${reference}). Complete the ${provider.toUpperCase()} payment from ${phone}; your wallet is credited as soon as the payment is confirmed.`,
  };
});

/**
 * Withdrawal request (customer winnings AND agent commission). Funds are
 * HELD immediately; BETESE admin approves or rejects every payout.
 */
export const requestWithdrawal = onCall(async (req) => {
  const { uid, profile } = await requireRole(req, ["player", "super_agent", "sub_agent"]);
  const settings = await getSettings();
  const provider = assertProvider(String(req.data?.provider ?? ""));
  const phone = normalizePhone(String(req.data?.phone ?? ""));
  const amount = round2(Number(req.data?.amount));

  if (settings.providers[provider] === false) {
    throw new HttpsError("failed-precondition", "This provider is currently disabled.");
  }
  if (!phone) throw new HttpsError("invalid-argument", "Payout phone is required.");
  if (!Number.isFinite(amount) || amount < settings.minWithdrawal) {
    throw new HttpsError("invalid-argument", `Minimum withdrawal is ${settings.minWithdrawal} GMD.`);
  }

  const ref = db.collection("paymentRequests").doc();
  await db.runTransaction(async (tx) => {
    const wallet = await walletRead(tx, uid);
    walletWrite(tx, wallet, {
      uid,
      amount: -amount,
      type: "withdrawal",
      description: "Withdrawal",
      meta: { provider, phone, requestId: ref.id },
    });
    tx.set(ref, {
      userId: uid,
      userName: profile.name,
      userRole: profile.role,
      type: "withdrawal",
      amount,
      provider,
      status: "pending",
      providerRef: null,
      approvedBy: null,
      meta: { phone },
      createdAt: FieldValue.serverTimestamp(),
    });
    bumpDailyStats(tx, todayIso(), { withdrawals: amount });
    bumpPlatformStats(tx, { totalWithdrawals: amount });
  });

  return { requestId: ref.id };
});

/** Credits a confirmed deposit exactly once (idempotent under transaction). */
async function settleDepositPaid(requestId: string, source: string): Promise<void> {
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`paymentRequests/${requestId}`);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Payment request not found.");
    const r = snap.data()!;
    if (r.type !== "deposit") throw new HttpsError("failed-precondition", "Not a deposit.");
    if (r.status !== "pending" && r.status !== "approved") return; // already settled — no double credit

    const userSnap = await tx.get(db.doc(`users/${r.userId}`));
    const ancestors = (userSnap.data()?.ancestors as string[] | undefined) ?? [];
    const wallet = await walletRead(tx, r.userId);

    walletWrite(tx, wallet, {
      uid: r.userId,
      amount: r.amount,
      type: "deposit",
      description: `Deposit via ${String(r.provider).charAt(0).toUpperCase()}${String(r.provider).slice(1)}`,
      meta: { requestId, source },
      ignoreFrozen: true,
    });
    tx.update(ref, { status: "paid", settledAt: FieldValue.serverTimestamp() });
    bumpDailyStats(tx, todayIso(), { deposits: r.amount });
    bumpPlatformStats(tx, { totalDeposits: r.amount });
    for (const agentId of ancestors) {
      tx.set(
        db.doc(`users/${agentId}`),
        { stats: { customerDeposits: FieldValue.increment(r.amount) } },
        { merge: true }
      );
    }
  });
}

/** Refunds a held withdrawal exactly once. */
async function refundWithdrawal(requestId: string, newStatus: "rejected" | "failed", reason: string) {
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`paymentRequests/${requestId}`);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Payment request not found.");
    const r = snap.data()!;
    if (r.type !== "withdrawal") throw new HttpsError("failed-precondition", "Not a withdrawal.");
    if (r.status === "rejected" || r.status === "failed" || r.status === "paid") return;

    const wallet = await walletRead(tx, r.userId);
    walletWrite(tx, wallet, {
      uid: r.userId,
      amount: r.amount,
      type: "refund",
      description: `Withdrawal ${newStatus} — refund`,
      meta: { requestId, reason },
      ignoreFrozen: true, // refunds can still land on frozen wallets
    });
    tx.update(ref, {
      status: newStatus,
      meta: { ...r.meta, reason },
      settledAt: FieldValue.serverTimestamp(),
    });
    bumpDailyStats(tx, todayIso(), { withdrawals: -r.amount });
    bumpPlatformStats(tx, { totalWithdrawals: -r.amount });
  });
}

/**
 * Admin approval queue. Approve a deposit = confirm money arrived (manual
 * settlement path); approve a withdrawal = release the payout. Reject always
 * refunds withdrawals instantly.
 */
export const adminResolvePayment = onCall(async (req) => {
  const { uid: adminUid } = await requireRole(req, ["admin"]);
  const requestId = String(req.data?.requestId ?? "");
  const action = String(req.data?.action ?? "");
  const reason = String(req.data?.reason ?? "");
  if (!requestId || !["approve", "reject"].includes(action)) {
    throw new HttpsError("invalid-argument", "requestId and action (approve|reject) required.");
  }

  const snap = await db.doc(`paymentRequests/${requestId}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Payment request not found.");
  const r = snap.data()!;
  if (r.status !== "pending") {
    throw new HttpsError("failed-precondition", `Request is already ${r.status}.`);
  }

  await db.doc(`paymentRequests/${requestId}`).update({ approvedBy: adminUid });

  if (r.type === "deposit") {
    if (action === "approve") {
      await settleDepositPaid(requestId, `admin:${adminUid}`);
      return { ok: true, status: "paid" };
    }
    await db.doc(`paymentRequests/${requestId}`).update({
      status: "rejected",
      meta: { ...r.meta, reason },
      settledAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, status: "rejected" };
  }

  // withdrawal
  if (action === "reject") {
    await refundWithdrawal(requestId, "rejected", reason || "Rejected by admin");
    return { ok: true, status: "rejected" };
  }

  // Approve & pay. With a real provider payout API configured this would call
  // the provider and wait for its webhook; until then the payout is settled
  // manually by the admin through the provider's own app, so we mark it paid.
  await db.doc(`paymentRequests/${requestId}`).update({
    status: "paid",
    settledAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, status: "paid" };
});

/**
 * Provider webhooks: POST /paymentWebhook/{provider}
 * Body must be signed with HMAC-SHA256 over the raw body using the provider's
 * webhook secret (X-Signature header, hex). FAIL CLOSED without a secret.
 * Expected JSON body: { reference, event: "payment.success"|"payment.failed" }
 */
export const paymentWebhook = onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }
    const provider = String(req.path.split("/").filter(Boolean).pop() ?? "").toLowerCase();
    if (!PROVIDERS.includes(provider as Provider)) {
      res.status(404).send("Unknown provider");
      return;
    }
    const secret = WEBHOOK_SECRETS[provider as Provider].value();
    if (!secret) {
      logger.warn("Webhook rejected: no secret configured", { provider });
      res.status(403).send("Webhooks not configured");
      return;
    }
    const signature = String(req.headers["x-signature"] ?? req.headers["wave-signature"] ?? "");
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const valid =
      signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) {
      logger.warn("Webhook rejected: bad signature", { provider });
      res.status(403).send("Invalid signature");
      return;
    }

    const body = req.body ?? {};
    const reference = String(body.reference ?? body.providerRef ?? "");
    const event = String(body.event ?? body.status ?? "");
    if (!reference) {
      res.status(400).send("Missing reference");
      return;
    }

    const match = await db
      .collection("paymentRequests")
      .where("providerRef", "==", reference)
      .limit(1)
      .get();
    if (match.empty) {
      res.status(404).send("Unknown reference");
      return;
    }
    const request = match.docs[0];
    const isSuccess = /success|paid|completed/i.test(event);
    const type = request.data().type as string;

    if (type === "deposit") {
      if (isSuccess) {
        await settleDepositPaid(request.id, `webhook:${provider}`);
      } else {
        await db.doc(`paymentRequests/${request.id}`).update({
          status: "failed",
          settledAt: FieldValue.serverTimestamp(),
        });
      }
    } else if (type === "withdrawal") {
      if (isSuccess) {
        await db.doc(`paymentRequests/${request.id}`).update({
          status: "paid",
          settledAt: FieldValue.serverTimestamp(),
        });
      } else {
        await refundWithdrawal(request.id, "failed", `Provider payout failed (${provider})`);
      }
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    logger.error("paymentWebhook error", e);
    res.status(500).send("Internal error");
  }
});

// re-export for typing convenience elsewhere
export type { ProfileData };
