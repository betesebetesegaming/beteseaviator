import { HttpsError, onCall } from "firebase-functions/v2/https";
import { formatPlayerId } from "./playerIds";
import { isAgentRole } from "./roles";
import {
  requireOtpVerifiedForPhone,
  consumeOtpVerifiedForPhone,
} from "./otpVerification";
import {
  db,
  FieldValue,
  requireRole,
  round2,
  todayIso,
  walletRead,
  walletWrite,
  bumpDailyStats,
  bumpPlatformStats,
  type ProfileData,
} from "./helpers";

function withdrawalToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

async function requireAgentCashOps(agentUid: string): Promise<ProfileData> {
  const snap = await db.doc(`users/${agentUid}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Agent profile not found.");
  const profile = snap.data() as ProfileData;
  if (!isAgentRole(profile.role)) {
    throw new HttpsError("permission-denied", "Only agents can use cash desk operations.");
  }
  if (!profile.cashOpsEnabled) {
    throw new HttpsError(
      "permission-denied",
      "Cash desk is not enabled for your account. Ask BETESE admin to turn it on.",
    );
  }
  return profile;
}

async function assertAgentCustomer(agentUid: string, customerId: string): Promise<ProfileData> {
  const customerSnap = await db.doc(`users/${customerId}`).get();
  if (!customerSnap.exists) throw new HttpsError("not-found", "Customer not found.");
  const customer = customerSnap.data() as ProfileData;
  if (customer.role !== "player" || !(customer.ancestors ?? []).includes(agentUid)) {
    throw new HttpsError("permission-denied", "This customer is not in your network.");
  }
  return customer;
}

/** Admin may act on any customer account (no agent-tree restriction). */
async function getCustomerPlayer(customerId: string): Promise<ProfileData> {
  const snap = await db.doc(`users/${customerId}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Customer not found.");
  const customer = snap.data() as ProfileData;
  if (customer.role !== "player") {
    throw new HttpsError("invalid-argument", "Cash operations apply to customer accounts only.");
  }
  return customer;
}

function customerPlayerId(customer: ProfileData, customerId: string): string {
  return customer.playerNumber && customer.playerNumber > 0
    ? formatPlayerId(customer.playerNumber)
    : customerId.slice(0, 8).toUpperCase();
}

/**
 * The customer must authorise every cash move with a fresh Africell OTP sent to
 * THEIR phone. We verify before touching wallets; the code is consumed only once
 * the money op has committed, so a failed transaction lets them retry the code.
 */
async function requireCustomerOtp(customer: ProfileData): Promise<string> {
  const phone = String(customer.phone ?? "").trim();
  if (!phone) {
    throw new HttpsError(
      "failed-precondition",
      "Customer has no phone number on file — cannot send an authorisation code.",
    );
  }
  await requireOtpVerifiedForPhone(phone);
  return phone;
}

/** Shared: OTP-authorised cash credit into a customer wallet (agent + admin). */
async function doCashDeposit(opts: {
  actorUid: string;
  actorName: string;
  customerId: string;
  customer: ProfileData;
  amount: number;
}): Promise<{ ok: true; playerId: string; amount: number }> {
  const { actorUid, actorName, customerId, customer, amount } = opts;
  if (!customerId || !Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError("invalid-argument", "customerId and a positive amount are required.");
  }
  const phone = await requireCustomerOtp(customer);
  const playerId = customerPlayerId(customer, customerId);

  await db.runTransaction(async (tx) => {
    const customerWallet = await walletRead(tx, customerId);
    walletWrite(tx, customerWallet, {
      uid: customerId,
      amount,
      type: "deposit",
      description: `Cash deposit at ${actorName}`,
      meta: { otcCash: true, agentId: actorUid, agentName: actorName, playerId },
      ignoreFrozen: true,
    });
    bumpDailyStats(tx, todayIso(), { deposits: amount });
    bumpPlatformStats(tx, { totalDeposits: amount });
    for (const agentId of customer.ancestors ?? []) {
      tx.set(
        db.doc(`users/${agentId}`),
        { stats: { customerDeposits: FieldValue.increment(amount) } },
        { merge: true },
      );
    }
  });

  await consumeOtpVerifiedForPhone(phone).catch(() => undefined);
  return { ok: true, playerId, amount };
}

/** Shared: OTP-authorised cash payout (debit) from a customer wallet (agent + admin). */
async function doCashWithdraw(opts: {
  actorUid: string;
  actorName: string;
  customerId: string;
  customer: ProfileData;
  amount: number;
}): Promise<{
  ok: true;
  withdrawalCode: string;
  playerId: string;
  amount: number;
  customerName: string;
}> {
  const { actorUid, actorName, customerId, customer, amount } = opts;
  if (!customerId || !Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError("invalid-argument", "customerId and a positive amount are required.");
  }
  const phone = await requireCustomerOtp(customer);
  const playerId = customerPlayerId(customer, customerId);
  const withdrawalCode = `${playerId}-${withdrawalToken()}`;
  const codeRef = db.collection("agentWithdrawalCodes").doc();

  await db.runTransaction(async (tx) => {
    const customerWallet = await walletRead(tx, customerId);
    if (customerWallet.balance < amount) {
      throw new HttpsError("failed-precondition", "Customer balance is too low for this withdrawal.");
    }
    walletWrite(tx, customerWallet, {
      uid: customerId,
      amount: -amount,
      type: "withdrawal",
      description: `Cash withdrawal at ${actorName}`,
      meta: { otcCash: true, agentId: actorUid, agentName: actorName, withdrawalCode, playerId },
    });
    tx.set(codeRef, {
      code: withdrawalCode,
      customerId,
      customerName: customer.name,
      playerId,
      agentId: actorUid,
      agentName: actorName,
      amount,
      status: "completed",
      createdAt: FieldValue.serverTimestamp(),
    });
    bumpDailyStats(tx, todayIso(), { withdrawals: amount });
    bumpPlatformStats(tx, { totalWithdrawals: amount });
  });

  await consumeOtpVerifiedForPhone(phone).catch(() => undefined);
  return { ok: true, withdrawalCode, playerId, amount, customerName: customer.name };
}

/** Admin enables OTC cash deposit/withdraw at an agent shop (special cases only). */
export const adminSetAgentCashOps = onCall(async (req) => {
  await requireRole(req, ["admin"]);
  const uid = String(req.data?.uid ?? "");
  const enabled = Boolean(req.data?.enabled);
  if (!uid) throw new HttpsError("invalid-argument", "uid is required.");

  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "User not found.");
  const profile = snap.data() as ProfileData;
  if (!isAgentRole(profile.role)) {
    throw new HttpsError("invalid-argument", "Cash desk can only be enabled for agents.");
  }

  await db.doc(`users/${uid}`).set({ cashOpsEnabled: enabled }, { merge: true });
  return { ok: true, uid, cashOpsEnabled: enabled };
});

/** Agent receives physical cash and credits the customer wallet (OTP-authorised, no float debit). */
export const agentOtcCashDeposit = onCall(async (req) => {
  const { uid, profile } = await requireRole(req, ["agent"]);
  await requireAgentCashOps(uid);
  const customerId = String(req.data?.customerId ?? "");
  const amount = round2(Number(req.data?.amount));
  const customer = await assertAgentCustomer(uid, customerId);
  return doCashDeposit({ actorUid: uid, actorName: profile.name, customerId, customer, amount });
});

/** Agent pays physical cash — OTP-authorised debit + office withdrawal code. */
export const agentOtcCashWithdraw = onCall(async (req) => {
  const { uid, profile } = await requireRole(req, ["agent"]);
  await requireAgentCashOps(uid);
  const customerId = String(req.data?.customerId ?? "");
  const amount = round2(Number(req.data?.amount));
  const customer = await assertAgentCustomer(uid, customerId);
  return doCashWithdraw({ actorUid: uid, actorName: profile.name, customerId, customer, amount });
});

/** Admin credits any customer's wallet against cash received (OTP-authorised). */
export const adminOtcCashDeposit = onCall(async (req) => {
  const { uid, profile } = await requireRole(req, ["admin"]);
  const customerId = String(req.data?.customerId ?? "");
  const amount = round2(Number(req.data?.amount));
  const customer = await getCustomerPlayer(customerId);
  return doCashDeposit({ actorUid: uid, actorName: profile.name, customerId, customer, amount });
});

/** Admin pays any customer cash — OTP-authorised debit + office withdrawal code. */
export const adminOtcCashWithdraw = onCall(async (req) => {
  const { uid, profile } = await requireRole(req, ["admin"]);
  const customerId = String(req.data?.customerId ?? "");
  const amount = round2(Number(req.data?.amount));
  const customer = await getCustomerPlayer(customerId);
  return doCashWithdraw({ actorUid: uid, actorName: profile.name, customerId, customer, amount });
});
