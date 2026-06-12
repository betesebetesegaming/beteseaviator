import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineString } from "firebase-functions/params";
import {
  auth,
  db,
  FieldValue,
  normalizePhone,
  phoneToEmail,
  requireAuth,
  requireRole,
  DEFAULT_SETTINGS,
  type ProfileData,
  type Role,
} from "./helpers";

/** Web API key used to verify agent passwords through the Identity Toolkit REST API. */
const WEB_API_KEY = defineString("WEB_API_KEY", {
  default: "AIzaSyCfG9tVqFxcqmOvsR9jI_cyJXi4LLPgFyA",
});

/**
 * Finishes sign-up for a player: creates profile + wallet atomically, claims
 * the phone number, attaches the referral agent and sets the role claim.
 */
export const completeRegistration = onCall(async (req) => {
  const uid = requireAuth(req);
  const name = String(req.data?.name ?? "").trim();
  const phone = req.data?.phone ? normalizePhone(String(req.data.phone)) : "";
  const ref = req.data?.ref ? String(req.data.ref).toLowerCase().trim() : null;

  if (!name) throw new HttpsError("invalid-argument", "Name is required.");
    if (!phone) throw new HttpsError("invalid-argument", "A valid Gambia or Senegal phone number is required.");

  // contact email: explicit > real auth email (never the synthetic phone alias)
  const tokenEmail = req.auth?.token.email as string | undefined;
  const explicitEmail = req.data?.email ? String(req.data.email).toLowerCase().trim() : null;
  const email =
    explicitEmail ??
    (tokenEmail && !tokenEmail.endsWith("@phone.beteseaviator.com") ? tokenEmail : null);

  // resolve referral agent (invalid/inactive refs silently ignored -> direct customer)
  let parentId: string | null = null;
  let ancestors: string[] = [];
  if (ref) {
    const slugSnap = await db.doc(`slugs/${ref}`).get();
    if (slugSnap.exists && slugSnap.data()!.active) {
      const agentId = slugSnap.data()!.uid as string;
      const agentSnap = await db.doc(`users/${agentId}`).get();
      if (agentSnap.exists && agentSnap.data()!.status === "active") {
        const agent = agentSnap.data() as ProfileData;
        if (agent.role === "super_agent" || agent.role === "sub_agent") {
          parentId = agentId;
          ancestors = agent.role === "sub_agent" && agent.parentId
            ? [agentId, agent.parentId]
            : [agentId];
        }
      }
    }
  }

  await db.runTransaction(async (tx) => {
    const userRef = db.doc(`users/${uid}`);
    const phoneRef = db.doc(`phones/${phone}`);
    const [userSnap, phoneSnap] = await Promise.all([tx.get(userRef), tx.get(phoneRef)]);
    if (userSnap.exists) throw new HttpsError("already-exists", "Profile already exists.");
    if (phoneSnap.exists && phoneSnap.data()!.uid !== uid) {
      throw new HttpsError("already-exists", "This phone number is already registered.");
    }

    tx.set(userRef, {
      name,
      email,
      phone,
      role: "player" satisfies Role,
      parentId,
      agentSlug: null,
      ancestors,
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
    tx.set(db.doc("stats/platform"), { customerCount: FieldValue.increment(1) }, { merge: true });
    for (const agentId of ancestors) {
      tx.set(
        db.doc(`users/${agentId}`),
        { stats: { customerCount: FieldValue.increment(1) } },
        { merge: true }
      );
    }
  });

  await auth.setCustomUserClaims(uid, { role: "player" });
  return { ok: true, role: "player" };
});

/**
 * Agents sign in with their username (slug). We resolve the slug to the
 * account email, verify the password against Identity Toolkit, and hand back
 * a custom token. Suspended accounts are rejected.
 */
export const agentLogin = onCall(async (req) => {
  const username = String(req.data?.username ?? "").toLowerCase().trim();
  const password = String(req.data?.password ?? "");
  if (!username || !password) {
    throw new HttpsError("invalid-argument", "Username and password are required.");
  }

  let userDoc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot | null = null;

  const staffSnap = await db.doc(`staffLogins/${username}`).get();
  if (staffSnap.exists) {
    userDoc = await db.doc(`users/${staffSnap.data()!.uid}`).get();
  } else {
    const snap = await db
      .collection("users")
      .where("agentSlug", "==", username)
      .limit(1)
      .get();
    if (!snap.empty) userDoc = snap.docs[0];
  }

  if (!userDoc?.exists) throw new HttpsError("not-found", "Invalid credentials.");
  const profile = userDoc.data() as ProfileData;
  if (profile.status !== "active") throw new HttpsError("permission-denied", "Account suspended.");
  if (!profile.email) throw new HttpsError("failed-precondition", "Account has no email login.");

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${WEB_API_KEY.value()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: profile.email, password, returnSecureToken: true }),
    }
  );
  if (!res.ok) throw new HttpsError("permission-denied", "Invalid credentials.");

  const token = await auth.createCustomToken(userDoc.id);
  return { token };
});

const PRIMARY_STAFF_LOGIN = "admin";
const PRIMARY_ADMIN_EMAIL = "admin@beteseaviator.com";

/** Creates or updates the primary admin (login: admin). Callable once without auth, then admin-only. */
export const ensurePrimaryAdmin = onCall(async (req) => {
  const password = String(req.data?.password ?? "gpassword@@");
  if (password.length < 8) {
    throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
  }

  const staffSnap = await db.doc(`staffLogins/${PRIMARY_STAFF_LOGIN}`).get();
  if (staffSnap.exists) {
    await requireRole(req, ["admin"]);
    const uid = staffSnap.data()!.uid as string;
    await auth.updateUser(uid, { password });
    return { ok: true, uid, action: "password_updated" };
  }

  const anyAdmin = await db.collection("users").where("role", "==", "admin").limit(1).get();
  if (!anyAdmin.empty) {
    try {
      await requireRole(req, ["admin"]);
    } catch {
      throw new HttpsError(
        "permission-denied",
        "An admin exists but staff login is not configured. Sign in with email first."
      );
    }
    const uid = anyAdmin.docs[0].id;
    const profile = anyAdmin.docs[0].data() as ProfileData;
    await auth.updateUser(uid, { password });
    await db.doc(`users/${uid}`).set(
      {
        staffLoginId: PRIMARY_STAFF_LOGIN,
        email: profile.email ?? PRIMARY_ADMIN_EMAIL,
      },
      { merge: true }
    );
    await db.doc(`staffLogins/${PRIMARY_STAFF_LOGIN}`).set({ uid, role: "admin" });
    return { ok: true, uid, action: "linked_existing_admin" };
  }

  let uid: string;
  try {
    const u = await auth.createUser({
      email: PRIMARY_ADMIN_EMAIL,
      password,
      displayName: "BETESE Admin",
    });
    uid = u.uid;
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "auth/email-already-exists") {
      uid = (await auth.getUserByEmail(PRIMARY_ADMIN_EMAIL)).uid;
      await auth.updateUser(uid, { password, displayName: "BETESE Admin" });
    } else {
      throw e;
    }
  }

  await auth.setCustomUserClaims(uid, { role: "admin" });
  const batch = db.batch();
  batch.set(db.doc(`users/${uid}`), {
    name: "BETESE Admin",
    email: PRIMARY_ADMIN_EMAIL,
    phone: null,
    role: "admin",
    parentId: null,
    agentSlug: null,
    staffLoginId: PRIMARY_STAFF_LOGIN,
    ancestors: [],
    status: "active",
    stats: {},
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.doc(`wallets/${uid}`), {
    balance: 0,
    bonusBalance: 0,
    currency: "GMD",
    frozen: false,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.doc(`staffLogins/${PRIMARY_STAFF_LOGIN}`), { uid, role: "admin" });
  batch.set(db.doc("settings/platform"), DEFAULT_SETTINGS, { merge: true });
  await batch.commit();
  return { ok: true, uid, action: "created", login: PRIMARY_STAFF_LOGIN, email: PRIMARY_ADMIN_EMAIL };
});

/**
 * One-time platform bootstrap. Refuses to run once any admin exists.
 * Creates the admin, settings, games and (optionally) the demo hierarchy.
 */
export const seedPlatform = onCall(async (req) => {
  const adminEmail = String(req.data?.adminEmail ?? "").toLowerCase().trim();
  const adminPassword = String(req.data?.adminPassword ?? "");
  const withDemoData = Boolean(req.data?.withDemoData);
  if (!adminEmail.includes("@") || adminPassword.length < 8) {
    throw new HttpsError("invalid-argument", "Valid admin email and password (8+ chars) required.");
  }

  const existingAdmin = await db.collection("users").where("role", "==", "admin").limit(1).get();
  if (!existingAdmin.empty) {
    throw new HttpsError("failed-precondition", "Platform is already initialised.");
  }

  const created: string[] = [];

  async function createAccount(opts: {
    email?: string;
    phone?: string;
    password: string;
    name: string;
    role: Role;
    slug?: string;
    staffLoginId?: string;
    parentId?: string | null;
    ancestors?: string[];
    balance?: number;
  }): Promise<string> {
    const authEmail = opts.email ?? phoneToEmail(opts.phone!);
    let uid: string;
    try {
      const u = await auth.createUser({
        email: authEmail,
        password: opts.password,
        displayName: opts.name,
      });
      uid = u.uid;
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "auth/email-already-exists") {
        uid = (await auth.getUserByEmail(authEmail)).uid;
      } else {
        throw e;
      }
    }
    await auth.setCustomUserClaims(uid, { role: opts.role });
    const batch = db.batch();
    batch.set(db.doc(`users/${uid}`), {
      name: opts.name,
      email: opts.email ?? null,
      phone: opts.phone ?? null,
      role: opts.role,
      parentId: opts.parentId ?? null,
      agentSlug: opts.slug ?? null,
      staffLoginId: opts.staffLoginId ?? null,
      ancestors: opts.ancestors ?? [],
      status: "active",
      stats: {},
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.set(db.doc(`wallets/${uid}`), {
      balance: opts.balance ?? 0,
      bonusBalance: 0,
      currency: "GMD",
      frozen: false,
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (opts.slug) {
      batch.set(db.doc(`slugs/${opts.slug}`), {
        uid,
        agentName: opts.name,
        active: true,
      });
    }
    if (opts.staffLoginId) {
      batch.set(db.doc(`staffLogins/${opts.staffLoginId}`), { uid, role: opts.role });
    }
    if (opts.phone) {
      batch.set(db.doc(`phones/${opts.phone}`), { uid });
    }
    await batch.commit();
    return uid;
  }

  // admin + core config
  await createAccount({
    email: adminEmail,
    password: adminPassword,
    name: "BETESE Admin",
    role: "admin",
    staffLoginId: PRIMARY_STAFF_LOGIN,
  });
  created.push("admin");

  await db.doc("settings/platform").set(DEFAULT_SETTINGS, { merge: true });
  await db.doc("stats/platform").set(
    {
      customerCount: 0,
      agentCount: 0,
      totalBets: 0,
      totalWins: 0,
      totalDeposits: 0,
      totalWithdrawals: 0,
    },
    { merge: true }
  );

  await db.doc("games/aviator").set({
    name: "Aviator",
    type: "crash",
    provider: "BETESE",
    rtp: 97,
    status: "active",
    settings: { maxMultiplier: 100, growthRate: 0.06 },
  });
  await db.doc("games/aviator-turbo").set({
    name: "Aviator Turbo",
    type: "crash",
    provider: "BETESE",
    rtp: 96,
    status: "active",
    settings: { maxMultiplier: 200, growthRate: 0.09 },
  });
  created.push("settings", "games");

  await db.doc("settings/lobbyPromos").set({
    slides: [
      {
        id: "aviator-launch",
        title: "Fly high with Aviator",
        subtitle: "Cash out before the crash — win real GMD on BETESE",
        cta: "Play now",
        href: "/play/game/aviator",
        imageUrl: "/promotions/aviator-ad.png",
        gradient: "from-red-700 via-rose-900 to-black",
        accent: "text-betese-yellow",
        active: true,
        sortOrder: 0,
      },
    ],
    ticker: [
      "✈️ Aviator — cash out before the crash",
      "💰 Wave & AfriMoney deposits in GMD",
      "🔥 Aviator Turbo — up to x200",
      "🎁 Demo: phone 3010001 · password: password",
    ],
  });
  created.push("lobby promotions");

  if (withDemoData) {
    const johnId = await createAccount({
      email: "john@betese.com",
      password: "password",
      name: "John Super",
      role: "super_agent",
      slug: "john",
    });
    const victorId = await createAccount({
      email: "victor@betese.com",
      password: "password",
      name: "Victor Sub",
      role: "sub_agent",
      slug: "victor",
      parentId: johnId,
      ancestors: [johnId],
    });
    await createAccount({
      phone: "3010001",
      password: "password",
      name: "Demo Customer One",
      role: "player",
      parentId: victorId,
      ancestors: [victorId, johnId],
      balance: 10_000,
    });
    await createAccount({
      phone: "3020002",
      password: "password",
      name: "Demo Customer Two",
      role: "player",
      balance: 5_000,
    });
    await db.doc("stats/platform").set(
      { customerCount: FieldValue.increment(2), agentCount: FieldValue.increment(2) },
      { merge: true }
    );
    await db.doc(`users/${johnId}`).set(
      { stats: { customerCount: 1, subAgentCount: 1 } },
      { merge: true }
    );
    await db.doc(`users/${victorId}`).set({ stats: { customerCount: 1 } }, { merge: true });
    created.push("demo accounts (john, victor, 3010001, 3020002 — password: password)");
  }

  return { ok: true, created };
});
