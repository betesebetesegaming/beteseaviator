import { HttpsError, onCall } from "firebase-functions/v2/https";
import { allocatePlayerNumber, formatPlayerId } from "./playerIds";
import { assertValidPassword } from "./passwordPolicy";
import { isAgentRole } from "./roles";
import {
  auth,
  db,
  FieldValue,
  normalizePhone,
  phoneToEmail,
  requireRole,
  round2,
  todayIso,
  walletRead,
  walletWrite,
  bumpDailyStats,
  bumpPlatformStats,
  RESERVED_SLUGS,
  staffLoginKey,
  recordCustomersOpened,
  type ProfileData,
} from "./helpers";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

/** Creates a unique slug doc inside a transaction-free flow (create() is atomic). */
export async function claimSlug(desired: string, uid: string, agentName: string): Promise<string> {
  const base = slugify(desired);
  if (!base || RESERVED_SLUGS.includes(base)) {
    throw new HttpsError("invalid-argument", "This username is not available.");
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${Math.floor(Math.random() * 900 + 100)}`;
    try {
      await db.doc(`slugs/${candidate}`).create({ uid, agentName, active: true });
      return candidate;
    } catch {
      // taken — try a suffixed variant
    }
  }
  throw new HttpsError("already-exists", "Username is taken — choose another.");
}

/** Keeps agent username login + customer referral slugs in sync with the user profile. */
export async function ensureAgentLoginDocs(
  uid: string,
  profile: Pick<ProfileData, "name" | "role" | "agentSlug" | "status">
): Promise<void> {
  if (!isAgentRole(profile.role)) return;
  const slug = String(profile.agentSlug ?? "").trim().toLowerCase();
  if (!slug) return;

  const batch = db.batch();
  batch.set(
    db.doc(`slugs/${slug}`),
    { uid, agentName: profile.name, active: profile.status === "active" },
    { merge: true }
  );
  batch.set(db.doc(`staffLogins/${slug}`), { uid, role: "agent" }, { merge: true });

  const nameKey = staffLoginKey(profile.name);
  if (nameKey && nameKey !== slug) {
    batch.set(db.doc(`staffLogins/${nameKey}`), { uid, role: "agent" }, { merge: true });
  }
  await batch.commit();
}

/** Shared: create a player account owned by an agent. */
export async function createPlayerAccount(opts: {
  name: string;
  phone: string;
  password: string;
  parentId: string | null;
  ancestors: string[];
  countForAgents?: boolean;
}): Promise<{ uid: string; playerNumber: number; playerId: string }> {
  const phone = normalizePhone(opts.phone);
  if (!phone) throw new HttpsError("invalid-argument", "A valid Gambian mobile number is required.");
  assertValidPassword(opts.password);

  const phoneDoc = await db.doc(`phones/${phone}`).get();
  if (phoneDoc.exists) {
    throw new HttpsError("already-exists", "This phone number is already registered.");
  }

  let uid: string;
  try {
    const u = await auth.createUser({
      email: phoneToEmail(phone),
      password: opts.password,
      displayName: opts.name,
    });
    uid = u.uid;
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "This phone number is already registered.");
    }
    throw e;
  }
  await auth.setCustomUserClaims(uid, { role: "player" });

  let playerNumber = 0;
  await db.runTransaction(async (tx) => {
    const phoneRef = db.doc(`phones/${phone}`);
    const snap = await tx.get(phoneRef);
    if (snap.exists) throw new HttpsError("already-exists", "This phone number is already registered.");
    playerNumber = await allocatePlayerNumber(tx);
    tx.set(db.doc(`users/${uid}`), {
      name: opts.name,
      email: null,
      phone,
      role: "player",
      parentId: opts.parentId,
      agentSlug: null,
      ancestors: opts.ancestors,
      playerNumber,
      status: "active",
      stats: {},
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.doc(`wallets/${uid}`), {
      balance: 0,
      bonusBalance: 0,
      currency: "GMD",
      frozen: false,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(phoneRef, { uid });
    bumpPlatformStats(tx, { customerCount: 1 });
    recordCustomersOpened(tx, todayIso(), opts.countForAgents !== false ? opts.ancestors : []);
    if (opts.countForAgents !== false) {
      for (const agentId of opts.ancestors) {
        tx.set(
          db.doc(`users/${agentId}`),
          { stats: { customerCount: FieldValue.increment(1) } },
          { merge: true }
        );
      }
    }
  });

  return { uid, playerNumber, playerId: formatPlayerId(playerNumber) };
}

/** Agents create customers manually; the new player is attached to them. */
export const agentCreateCustomer = onCall(async (req) => {
  const { uid } = await requireRole(req, ["agent"]);
  const created = await createPlayerAccount({
    name: String(req.data?.name ?? "").trim(),
    phone: String(req.data?.phone ?? ""),
    password: String(req.data?.password ?? ""),
    parentId: uid,
    ancestors: [uid],
  });
  return created;
});

/** Atomic transfer from the agent's wallet into one of THEIR customers' wallets. */
export const agentDepositToCustomer = onCall(async (req) => {
  const { uid, profile } = await requireRole(req, ["agent"]);
  const customerId = String(req.data?.customerId ?? "");
  const amount = round2(Number(req.data?.amount));
  if (!customerId || !Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError("invalid-argument", "customerId and a positive amount are required.");
  }

  const customerSnap = await db.doc(`users/${customerId}`).get();
  if (!customerSnap.exists) throw new HttpsError("not-found", "Customer not found.");
  const customer = customerSnap.data() as ProfileData;
  if (customer.role !== "player" || !(customer.ancestors ?? []).includes(uid)) {
    throw new HttpsError("permission-denied", "This customer is not in your tree.");
  }

  await db.runTransaction(async (tx) => {
    const agentWallet = await walletRead(tx, uid);
    const customerWallet = await walletRead(tx, customerId);
    walletWrite(tx, agentWallet, {
      uid,
      amount: -amount,
      type: "transfer",
      description: `Deposit to customer ${customer.name}`,
      meta: { to: customerId, toName: customer.name },
    });
    walletWrite(tx, customerWallet, {
      uid: customerId,
      amount,
      type: "deposit",
      description: `Deposit by agent ${profile.name}`,
      meta: { from: uid, fromName: profile.name },
      ignoreFrozen: true,
    });
    bumpDailyStats(tx, todayIso(), { deposits: amount });
    bumpPlatformStats(tx, { totalDeposits: amount });
    for (const agentId of customer.ancestors ?? []) {
      tx.set(
        db.doc(`users/${agentId}`),
        { stats: { customerDeposits: FieldValue.increment(amount) } },
        { merge: true }
      );
    }
  });

  return { ok: true };
});
