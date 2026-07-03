import { HttpsError, onCall } from "firebase-functions/v2/https";
import { formatPlayerId } from "./playerIds";
import { isAgentRole } from "./roles";
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

/** Agent receives physical cash and credits the customer wallet (no agent float debit). */
export const agentOtcCashDeposit = onCall(async (req) => {
  const { uid, profile } = await requireRole(req, ["agent"]);
  await requireAgentCashOps(uid);

  const customerId = String(req.data?.customerId ?? "");
  const amount = round2(Number(req.data?.amount));
  if (!customerId || !Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError("invalid-argument", "customerId and a positive amount are required.");
  }

  const customer = await assertAgentCustomer(uid, customerId);
  const playerId =
    customer.playerNumber && customer.playerNumber > 0
      ? formatPlayerId(customer.playerNumber)
      : customerId.slice(0, 8);

  await db.runTransaction(async (tx) => {
    const customerWallet = await walletRead(tx, customerId);
    walletWrite(tx, customerWallet, {
      uid: customerId,
      amount,
      type: "deposit",
      description: `Cash deposit at agent ${profile.name}`,
      meta: {
        otcCash: true,
        agentId: uid,
        agentName: profile.name,
        playerId,
      },
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

  return { ok: true, playerId, amount };
});

/** Agent pays physical cash — debits customer and returns an office withdrawal code. */
export const agentOtcCashWithdraw = onCall(async (req) => {
  const { uid, profile } = await requireRole(req, ["agent"]);
  await requireAgentCashOps(uid);

  const customerId = String(req.data?.customerId ?? "");
  const amount = round2(Number(req.data?.amount));
  if (!customerId || !Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError("invalid-argument", "customerId and a positive amount are required.");
  }

  const customer = await assertAgentCustomer(uid, customerId);
  const playerId =
    customer.playerNumber && customer.playerNumber > 0
      ? formatPlayerId(customer.playerNumber)
      : customerId.slice(0, 8).toUpperCase();

  const token = withdrawalToken();
  const withdrawalCode = `${playerId}-${token}`;
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
      description: `Cash withdrawal at agent ${profile.name}`,
      meta: {
        otcCash: true,
        agentId: uid,
        agentName: profile.name,
        withdrawalCode,
        playerId,
      },
    });

    tx.set(codeRef, {
      code: withdrawalCode,
      customerId,
      customerName: customer.name,
      playerId,
      agentId: uid,
      agentName: profile.name,
      amount,
      status: "completed",
      createdAt: FieldValue.serverTimestamp(),
    });

    bumpDailyStats(tx, todayIso(), { withdrawals: amount });
    bumpPlatformStats(tx, { totalWithdrawals: amount });
  });

  return {
    ok: true,
    withdrawalCode,
    playerId,
    amount,
    customerName: customer.name,
  };
});
