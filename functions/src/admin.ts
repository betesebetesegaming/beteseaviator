import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  auth,
  db,
  FieldValue,
  normalizePhone,
  requireRole,
  round2,
  walletRead,
  walletWrite,
  type ProfileData,
  type Role,
} from "./helpers";
import { claimSlug, createPlayerAccount } from "./agent";

/** Admin creates any account type with full hierarchy validation. */
export const adminCreateUser = onCall(async (req) => {
  await requireRole(req, ["admin"]);
  const role = String(req.data?.role ?? "") as Role;
  const name = String(req.data?.name ?? "").trim();
  const email = req.data?.email ? String(req.data.email).toLowerCase().trim() : "";
  const phone = req.data?.phone ? normalizePhone(String(req.data.phone)) : "";
  const username = req.data?.username ? String(req.data.username).trim() : "";
  const password = String(req.data?.password ?? "");
  const parentId = req.data?.parentId ? String(req.data.parentId) : null;

  if (!name) throw new HttpsError("invalid-argument", "Name is required.");
  if (password.length < 8) {
    throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
  }

  if (role === "player") {
    // customers sign in with phone; an optional parent agent owns them
    let ancestors: string[] = [];
    if (parentId) {
      const agentSnap = await db.doc(`users/${parentId}`).get();
      if (!agentSnap.exists) throw new HttpsError("not-found", "Owning agent not found.");
      const agent = agentSnap.data() as ProfileData;
      if (agent.role !== "super_agent" && agent.role !== "sub_agent") {
        throw new HttpsError("invalid-argument", "A customer's parent must be an agent.");
      }
      ancestors =
        agent.role === "sub_agent" && agent.parentId ? [parentId, agent.parentId] : [parentId];
    }
    const uid = await createPlayerAccount({ name, phone, password, parentId, ancestors });
    return { uid };
  }

  if (role === "super_agent" || role === "sub_agent" || role === "admin") {
    if (!email.includes("@")) {
      throw new HttpsError("invalid-argument", "A valid email is required for this role.");
    }
    let ancestors: string[] = [];
    if (role === "sub_agent") {
      if (!parentId) throw new HttpsError("invalid-argument", "A sub agent needs a super agent.");
      const superSnap = await db.doc(`users/${parentId}`).get();
      if (!superSnap.exists || (superSnap.data() as ProfileData).role !== "super_agent") {
        throw new HttpsError("invalid-argument", "Parent must be a super agent.");
      }
      ancestors = [parentId];
    }

    let uid: string;
    try {
      const u = await auth.createUser({ email, password, displayName: name });
      uid = u.uid;
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "auth/email-already-exists") {
        throw new HttpsError("already-exists", "This email is already registered.");
      }
      throw e;
    }

    const slug =
      role === "admin" ? null : await claimSlug(username || name, uid, name);
    await auth.setCustomUserClaims(uid, { role });

    const batch = db.batch();
    batch.set(db.doc(`users/${uid}`), {
      name,
      email,
      phone: phone || null,
      role,
      parentId: role === "sub_agent" ? parentId : null,
      agentSlug: slug,
      ancestors,
      status: "active",
      stats: {},
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.set(db.doc(`wallets/${uid}`), {
      balance: 0,
      currency: "XOF",
      frozen: false,
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (role !== "admin") {
      batch.set(db.doc("stats/platform"), { agentCount: FieldValue.increment(1) }, { merge: true });
    }
    if (role === "sub_agent" && parentId) {
      batch.set(
        db.doc(`users/${parentId}`),
        { stats: { subAgentCount: FieldValue.increment(1) } },
        { merge: true }
      );
    }
    await batch.commit();
    return { uid, slug: slug ?? undefined };
  }

  throw new HttpsError("invalid-argument", "Unknown role.");
});

/** Suspend / re-activate (delete = suspend; nothing is hard-deleted). */
export const adminSetUserStatus = onCall(async (req) => {
  await requireRole(req, ["admin"]);
  const uid = String(req.data?.uid ?? "");
  const status = String(req.data?.status ?? "");
  if (!uid || !["active", "suspended"].includes(status)) {
    throw new HttpsError("invalid-argument", "uid and status (active|suspended) required.");
  }
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "User not found.");
  const profile = snap.data() as ProfileData;
  if (profile.role === "admin") {
    throw new HttpsError("permission-denied", "Admins cannot be suspended from here.");
  }

  await db.doc(`users/${uid}`).update({ status });
  if (profile.agentSlug) {
    await db.doc(`slugs/${profile.agentSlug}`).set(
      { active: status === "active" },
      { merge: true }
    );
  }
  // suspended users lose their sessions immediately
  if (status === "suspended") {
    await auth.revokeRefreshTokens(uid);
  }
  return { ok: true };
});

/** Credit or debit any wallet with a mandatory, audited reason. */
export const adminAdjustWallet = onCall(async (req) => {
  const { uid: adminUid } = await requireRole(req, ["admin"]);
  const uid = String(req.data?.uid ?? "");
  const amount = round2(Number(req.data?.amount));
  const reason = String(req.data?.reason ?? "").trim();
  if (!uid || !Number.isFinite(amount) || amount === 0) {
    throw new HttpsError("invalid-argument", "uid and a non-zero amount are required.");
  }
  if (!reason) throw new HttpsError("invalid-argument", "A reason is mandatory.");

  let newBalance = 0;
  await db.runTransaction(async (tx) => {
    const wallet = await walletRead(tx, uid);
    newBalance = walletWrite(tx, wallet, {
      uid,
      amount,
      type: amount > 0 ? "deposit" : "withdrawal",
      description: `Admin adjustment: ${reason}`,
      meta: { adjustedBy: adminUid, reason },
      ignoreFrozen: true,
    });
  });
  return { newBalance };
});

/** Freeze/unfreeze: frozen wallets cannot bet or withdraw; refunds still land. */
export const adminFreezeWallet = onCall(async (req) => {
  await requireRole(req, ["admin"]);
  const uid = String(req.data?.uid ?? "");
  const frozen = Boolean(req.data?.frozen);
  if (!uid) throw new HttpsError("invalid-argument", "uid is required.");
  await db.doc(`wallets/${uid}`).set(
    { frozen, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  return { ok: true };
});

/** Platform settings: rates, limits, provider toggles. */
export const adminSaveSettings = onCall(async (req) => {
  await requireRole(req, ["admin"]);
  const data = req.data ?? {};
  const clean: Record<string, unknown> = {};
  const numericKeys = [
    "subAgentRate",
    "superAgentRate",
    "minBet",
    "maxBet",
    "minDeposit",
    "minWithdrawal",
    "minAutoCashout",
    "maxAutoCashout",
  ] as const;
  for (const k of numericKeys) {
    if (data[k] !== undefined) {
      const v = Number(data[k]);
      if (!Number.isFinite(v) || v < 0) throw new HttpsError("invalid-argument", `Invalid ${k}.`);
      clean[k] = v;
    }
  }
  if ((clean.subAgentRate as number) > 1 || (clean.superAgentRate as number) > 1) {
    throw new HttpsError("invalid-argument", "Rates are fractions, e.g. 0.05 = 5%.");
  }
  if (data.providers && typeof data.providers === "object") {
    const providers: Record<string, boolean> = {};
    for (const p of ["wave", "afrimoney", "aps", "qmoney"]) {
      providers[p] = Boolean((data.providers as Record<string, unknown>)[p]);
    }
    clean.providers = providers;
  }
  await db.doc("settings/platform").set(clean, { merge: true });
  return { ok: true };
});
