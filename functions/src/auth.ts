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
  resolveStaffAuthEmail,
  staffLoginKey,
  DEFAULT_SETTINGS,
  type ProfileData,
  type Role,
} from "./helpers";
import {
  pickPlayerReferralCode,
  writeAttachPlayerReferrer,
  writePlayerReferralCode,
  normalizeReferralCode,
  resolvePlayerReferrerUid,
} from "./referrals";
import { assertOtpVerifiedForPhone } from "./otpVerification";
import { verifySmsOtp } from "./routes/otp";
import { isAgentRole, isStaffRole as isStaffRoleCheck } from "./roles";

/** WARNING: Do NOT use Firebase Phone Auth for OTP. Gambian SMS = Africell sendOtp/verifyOtp only. */

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
  const pref = req.data?.pref ? normalizeReferralCode(String(req.data.pref)) : null;
  const deviceId = req.data?.deviceId ? String(req.data.deviceId).trim().slice(0, 128) : null;
  const signupIp =
    (req.rawRequest?.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    (req.rawRequest?.headers["x-real-ip"] as string | undefined)?.trim() ||
    null;

  if (!name) throw new HttpsError("invalid-argument", "Name is required.");
  if (!phone) throw new HttpsError("invalid-argument", "A valid Gambian mobile number is required.");

  await assertOtpVerifiedForPhone(phone);

  // Players sign up with phone + password only — no contact email on profile.
  const email = null;

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
        if (isAgentRole(agent.role)) {
          parentId = agentId;
          ancestors = [agentId];
        }
      }
    }
  }

  let playerReferrerUid: string | null = null;
  if (pref) {
    playerReferrerUid = await resolvePlayerReferrerUid(pref);
    if (playerReferrerUid === uid) playerReferrerUid = null;
  }

  try {
    await db.runTransaction(async (tx) => {
      const userRef = db.doc(`users/${uid}`);
      const phoneRef = db.doc(`phones/${phone}`);
      const inviteRef = db.doc(`referralInvites/${uid}`);
      const [userSnap, phoneSnap, inviteSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(phoneRef),
        playerReferrerUid && pref ? tx.get(inviteRef) : Promise.resolve(null),
      ]);

      if (userSnap.exists) {
        const existing = userSnap.data() as ProfileData & { phone?: string; referralCode?: string };
        if (existing.phone === phone) {
          if (!existing.referralCode) {
            const code = await pickPlayerReferralCode(tx, uid, name);
            writePlayerReferralCode(tx, uid, name, code);
            tx.set(userRef, { referralCode: code }, { merge: true });
          }
          return;
        }
        throw new HttpsError(
          "already-exists",
          "Profile already exists. Sign out and sign in with the correct account."
        );
      }

      if (phoneSnap.exists && phoneSnap.data()!.uid !== uid) {
        throw new HttpsError("already-exists", "This phone number is already registered.");
      }

      const referralCode = await pickPlayerReferralCode(tx, uid, name);

      writePlayerReferralCode(tx, uid, name, referralCode);
      tx.set(userRef, {
        name,
        email,
        phone,
        role: "player" satisfies Role,
        parentId,
        agentSlug: null,
        ancestors,
        referredBy: playerReferrerUid,
        referralCode,
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

      if (playerReferrerUid && pref && inviteSnap && !inviteSnap.exists) {
        writeAttachPlayerReferrer(tx, uid, playerReferrerUid, pref, { deviceId, signupIp });
      }
    });

    await auth.setCustomUserClaims(uid, { role: "player" });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error("completeRegistration failed", e);
    throw new HttpsError(
      "internal",
      "Could not finish your profile. Please try again in a moment."
    );
  }
  return { ok: true, role: "player" };
});

/** Player self-service password reset — requires a fresh Africell OTP for the phone. */
export const resetPlayerPassword = onCall({ invoker: "public" }, async (req) => {
  const phone = normalizePhone(String(req.data?.phone ?? ""));
  const password = String(req.data?.password ?? "");
  if (!phone) throw new HttpsError("invalid-argument", "A valid Gambian mobile number is required.");
  if (password.length < 8) {
    throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
  }

  await assertOtpVerifiedForPhone(phone);

  const phoneSnap = await db.doc(`phones/${phone}`).get();
  if (!phoneSnap.exists) {
    throw new HttpsError("not-found", "No account found for this phone number.");
  }
  const uid = String(phoneSnap.data()?.uid ?? "");
  if (!uid) throw new HttpsError("not-found", "Phone record is missing a linked user.");

  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) {
    throw new HttpsError("not-found", "No account found for this phone number.");
  }
  const profile = userSnap.data() as ProfileData;
  if (profile.status !== "active") {
    throw new HttpsError("permission-denied", "Account suspended.");
  }
  if (profile.role !== "player") {
    throw new HttpsError("permission-denied", "Use the staff portal to reset this account.");
  }

  const authEmail = phoneToEmail(phone);
  await auth.updateUser(uid, { email: authEmail, password, displayName: profile.name || undefined });

  return { ok: true as const, phone, authEmail };
});

/** Verify SMS OTP and reset player password in one step (mobile-friendly). */
export const resetPlayerPasswordWithOtp = onCall({ invoker: "public" }, async (req) => {
  const phone = normalizePhone(String(req.data?.phone ?? ""));
  const code = String(req.data?.code ?? "").trim();
  const password = String(req.data?.password ?? "");
  if (!phone) throw new HttpsError("invalid-argument", "A valid Gambian mobile number is required.");
  if (!code || code.length < 6) {
    throw new HttpsError("invalid-argument", "Enter the 6-digit SMS verification code.");
  }
  if (password.length < 8) {
    throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
  }

  try {
    await verifySmsOtp(phone, code);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Invalid OTP")) throw new HttpsError("permission-denied", msg);
    if (msg.includes("expired") || msg.includes("Too many") || msg.includes("No OTP")) {
      throw new HttpsError("failed-precondition", msg);
    }
    throw new HttpsError("internal", msg || "Could not verify SMS code.");
  }

  const phoneSnap = await db.doc(`phones/${phone}`).get();
  if (!phoneSnap.exists) {
    throw new HttpsError("not-found", "No account found for this phone number.");
  }
  const uid = String(phoneSnap.data()?.uid ?? "");
  if (!uid) throw new HttpsError("not-found", "Phone record is missing a linked user.");

  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) {
    throw new HttpsError("not-found", "No account found for this phone number.");
  }
  const profile = userSnap.data() as ProfileData;
  if (profile.status !== "active") {
    throw new HttpsError("permission-denied", "Account suspended.");
  }
  if (profile.role !== "player") {
    throw new HttpsError("permission-denied", "Use the staff portal to reset this account.");
  }

  const authEmail = phoneToEmail(phone);
  await auth.updateUser(uid, { email: authEmail, password, displayName: profile.name || undefined });

  return { ok: true as const, phone, authEmail };
});

/**
 * Staff/agents sign in with username (slug or staff login id). Resolves to the
 * account email, verifies password server-side, then returns the email so the
 * client can complete sign-in with Firebase Auth (avoids custom-token IAM).
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

  if (!userDoc?.exists) {
    const nameKey = staffLoginKey(username);
    if (nameKey && nameKey !== username) {
      const staffByKey = await db.doc(`staffLogins/${nameKey}`).get();
      if (staffByKey.exists) {
        userDoc = await db.doc(`users/${staffByKey.data()!.uid}`).get();
      }
      if (!userDoc?.exists) {
        const bySlug = await db
          .collection("users")
          .where("agentSlug", "==", nameKey)
          .limit(1)
          .get();
        if (!bySlug.empty) userDoc = bySlug.docs[0];
      }
    }
  }

  if (!userDoc?.exists) throw new HttpsError("not-found", "Invalid credentials.");
  const profile = userDoc.data() as ProfileData;
  if (profile.status !== "active") throw new HttpsError("permission-denied", "Account suspended.");

  const authEmail = resolveStaffAuthEmail(profile);

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${WEB_API_KEY.value()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: authEmail, password, returnSecureToken: true }),
    }
  );
  if (!res.ok) throw new HttpsError("permission-denied", "Invalid credentials.");

  return { email: authEmail };
});

const PRIMARY_STAFF_LOGIN = "admin";
const PRIMARY_ADMIN_EMAIL = "admin@beteseaviator.com";

function isStaffRole(role: Role | undefined): boolean {
  return isStaffRoleCheck(role);
}

async function ensureAdminProfileForUid(uid: string): Promise<void> {
  const userRef = db.doc(`users/${uid}`);
  const existing = await userRef.get();
  if (existing.exists) {
    const data = existing.data() as ProfileData;
    if (data.role !== "admin") {
      throw new HttpsError("permission-denied", "This Firebase account is not an admin.");
    }
    await auth.setCustomUserClaims(uid, { role: "admin" });
    await db.doc(`staffLogins/${PRIMARY_STAFF_LOGIN}`).set({ uid, role: "admin" }, { merge: true });
    return;
  }

  const batch = db.batch();
  batch.set(userRef, {
    name: "BETESE Admin",
    email: PRIMARY_ADMIN_EMAIL,
    phone: null,
    role: "admin" satisfies Role,
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
  await batch.commit();
  await auth.setCustomUserClaims(uid, { role: "admin" });
}

/** After Firebase Auth sign-in, sync staff profile + custom claims (creates admin profile if missing). */
export const resolveStaffSession = onCall(async (req) => {
  const uid = requireAuth(req);
  const email = String(req.auth?.token.email ?? "").toLowerCase().trim();

  let snap = await db.doc(`users/${uid}`).get();

  if (!snap.exists) {
    if (email === PRIMARY_ADMIN_EMAIL) {
      await ensureAdminProfileForUid(uid);
      snap = await db.doc(`users/${uid}`).get();
    } else {
      throw new HttpsError(
        "not-found",
        "No staff profile found for this account. Contact BETESE support."
      );
    }
  }

  const profile = snap.data() as ProfileData;
  if (profile.status !== "active") {
    throw new HttpsError("permission-denied", "Account suspended.");
  }
  if (!isStaffRole(profile.role)) {
    throw new HttpsError("permission-denied", "This account is not authorized for the staff portal.");
  }

  if (req.auth?.token.role !== profile.role) {
    await auth.setCustomUserClaims(uid, { role: profile.role });
  }

  if (isAgentRole(profile.role)) {
    const { ensureAgentLoginDocs } = await import("./agent");
    await ensureAgentLoginDocs(uid, profile);
  }

  return {
    ok: true as const,
    role: profile.role,
    status: profile.status,
    agentSlug: profile.agentSlug ?? null,
    name: profile.name,
  };
});

const PRIMARY_ADMIN_PASSWORD = "Betese123";
const ADMIN_BOOTSTRAP_KEY = "beteseaviator-reset-2026";

/** Creates or updates the primary admin (login: admin). Bootstrap requires setupKey; updates require admin auth. */
export const ensurePrimaryAdmin = onCall({ invoker: "public" }, async (req) => {
  const password = String(req.data?.password ?? PRIMARY_ADMIN_PASSWORD);
  if (password.length < 8) {
    throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
  }
  const setupKey = String(req.data?.setupKey ?? "");

  const staffSnap = await db.doc(`staffLogins/${PRIMARY_STAFF_LOGIN}`).get();
  if (staffSnap.exists) {
    if (setupKey && setupKey === ADMIN_BOOTSTRAP_KEY) {
      const uid = staffSnap.data()!.uid as string;
      await auth.updateUser(uid, { password });
      return { ok: true, uid, action: "password_reset_bootstrap" };
    }
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

  if (!req.auth && setupKey !== ADMIN_BOOTSTRAP_KEY) {
    throw new HttpsError("permission-denied", "Bootstrap requires a valid setup key.");
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

  const { ensureQTechGameDocs } = await import("./qtech/games");
  await ensureQTechGameDocs();
  created.push("settings", "games");

  await db.doc("settings/lobbyPromos").set({
    slides: [
      {
        id: "aviator-launch",
        title: "Fly high with Aviator",
        subtitle: "Cash out before the crash — win real GMD on BETESE",
        cta: "Play now",
        href: "/play",
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
      name: "John Agent",
      role: "agent",
      slug: "john",
    });
    await createAccount({
      phone: "3010001",
      password: "password",
      name: "Demo Customer One",
      role: "player",
      parentId: johnId,
      ancestors: [johnId],
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
      { customerCount: FieldValue.increment(2), agentCount: FieldValue.increment(1) },
      { merge: true }
    );
    await db.doc(`users/${johnId}`).set({ stats: { customerCount: 1 } }, { merge: true });
    created.push("demo accounts (john agent, 3010001, 3020002 — password: password)");
  }

  return { ok: true, created };
});
