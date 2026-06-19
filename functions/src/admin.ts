import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  auth,
  db,
  FieldValue,
  normalizePhone,
  requireRole,
  round2,
  todayIso,
  walletRead,
  walletWrite,
  phoneToEmail,
  staffLoginEmail,
  staffLoginKey,
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
    const hasEmail = email.includes("@");
    const loginKey = staffLoginKey(username || name);
    if (!hasEmail && !loginKey) {
      throw new HttpsError(
        "invalid-argument",
        "Provide an email or a username/name they can sign in with."
      );
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

    const provisionalAuthEmail = hasEmail ? email : staffLoginEmail(loginKey);
    let uid: string;
    try {
      const u = await auth.createUser({ email: provisionalAuthEmail, password, displayName: name });
      uid = u.uid;
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "auth/email-already-exists") {
        throw new HttpsError("already-exists", "This login is already registered.");
      }
      throw e;
    }

    const slug =
      role === "admin" ? null : await claimSlug(username || name, uid, name);
    const staffLoginId =
      role === "admin"
        ? (username ? username.toLowerCase().trim() : loginKey)
        : null;

    if (!hasEmail) {
      const finalAuthEmail = staffLoginEmail(slug || staffLoginId || loginKey);
      if (finalAuthEmail !== provisionalAuthEmail) {
        await auth.updateUser(uid, { email: finalAuthEmail });
      }
    }

    await auth.setCustomUserClaims(uid, { role });

    const batch = db.batch();
    batch.set(db.doc(`users/${uid}`), {
      name,
      email: hasEmail ? email : null,
      phone: phone || null,
      role,
      parentId: role === "sub_agent" ? parentId : null,
      agentSlug: slug,
      staffLoginId,
      ancestors,
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
    if (role !== "admin") {
      batch.set(db.doc("stats/platform"), { agentCount: FieldValue.increment(1) }, { merge: true });
    }
    if (role === "admin" && staffLoginId) {
      batch.set(db.doc(`staffLogins/${staffLoginId}`), { uid, role: "admin" });
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
    "apiProviderRate",
    "minBet",
    "maxBet",
    "minDeposit",
    "minWithdrawal",
    "minAutoCashout",
    "maxAutoCashout",
    "depositPlaythroughRate",
    "earlyWithdrawalFeeRate",
    "bonusWagerMultiplier",
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
  if ((clean.apiProviderRate as number | undefined) !== undefined && (clean.apiProviderRate as number) > 1) {
    throw new HttpsError("invalid-argument", "API provider rate must be a fraction, e.g. 0.15 = 15%.");
  }
  if ((clean.depositPlaythroughRate as number | undefined) !== undefined && (clean.depositPlaythroughRate as number) > 1) {
    throw new HttpsError("invalid-argument", "Deposit play-through rate must be a fraction, e.g. 0.8 = 80%.");
  }
  if ((clean.earlyWithdrawalFeeRate as number | undefined) !== undefined && (clean.earlyWithdrawalFeeRate as number) > 1) {
    throw new HttpsError("invalid-argument", "Early withdrawal fee must be a fraction, e.g. 0.15 = 15%.");
  }
  if (data.apiProviderRate !== undefined) {
    const rate = Number(data.apiProviderRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      throw new HttpsError("invalid-argument", "API provider rate must be between 0 and 1.");
    }
    clean.apiProviderRate = rate;
  }
  if (data.apiProviderName !== undefined) {
    clean.apiProviderName = String(data.apiProviderName).trim().slice(0, 80) || "API Provider";
  }
  if (data.providers && typeof data.providers === "object") {
    const providers: Record<string, boolean> = {};
    for (const p of ["wave", "afrimoney", "aps", "qmoney"]) {
      providers[p] = Boolean((data.providers as Record<string, unknown>)[p]);
    }
    clean.providers = providers;
  }

  if (data.bonuses && typeof data.bonuses === "object") {
    const raw = data.bonuses as Record<string, unknown>;
    const parseRule = (key: "firstDeposit" | "weeklyCrash" | "weekend", extra?: string[]) => {
      const src = (raw[key] ?? {}) as Record<string, unknown>;
      const percent = Number(src.percent);
      const maxAmount = Number(src.maxAmount);
      const minDeposit = Number(src.minDeposit);
      if (!Number.isFinite(percent) || percent < 0 || percent > 2) {
        throw new HttpsError("invalid-argument", `Invalid ${key} bonus percent.`);
      }
      if (!Number.isFinite(maxAmount) || maxAmount < 0) {
        throw new HttpsError("invalid-argument", `Invalid ${key} bonus max amount.`);
      }
      if (!Number.isFinite(minDeposit) || minDeposit < 0) {
        throw new HttpsError("invalid-argument", `Invalid ${key} bonus min deposit.`);
      }
      const rule: Record<string, unknown> = {
        enabled: src.enabled !== false,
        percent,
        maxAmount,
        minDeposit,
      };
      if (extra?.includes("fridayStartHour")) {
        const h = Number(src.fridayStartHour);
        if (!Number.isFinite(h) || h < 0 || h > 23) {
          throw new HttpsError("invalid-argument", "Friday start hour must be 0–23.");
        }
        rule.fridayStartHour = h;
      }
      if (extra?.includes("sundayEndHour")) {
        const h = Number(src.sundayEndHour);
        if (!Number.isFinite(h) || h < 0 || h > 23) {
          throw new HttpsError("invalid-argument", "Sunday end hour must be 0–23.");
        }
        rule.sundayEndHour = h;
      }
      return rule;
    };
    clean.bonuses = {
      firstDeposit: parseRule("firstDeposit"),
      weeklyCrash: parseRule("weeklyCrash"),
      weekend: parseRule("weekend", ["fridayStartHour", "sundayEndHour"]),
    };
  }

  if (data.playerReferral && typeof data.playerReferral === "object") {
    const pr = data.playerReferral as Record<string, unknown>;
    const bonusAmount = Number(pr.bonusAmount);
    const minQualifyingDeposit = Number(pr.minQualifyingDeposit);
    if (!Number.isFinite(bonusAmount) || bonusAmount < 0) {
      throw new HttpsError("invalid-argument", "Invalid referral bonus amount.");
    }
    if (!Number.isFinite(minQualifyingDeposit) || minQualifyingDeposit < 0) {
      throw new HttpsError("invalid-argument", "Invalid referral min qualifying deposit.");
    }
    clean.playerReferral = {
      enabled: pr.enabled !== false,
      bonusAmount,
      minQualifyingDeposit,
      requireFirstBet: pr.requireFirstBet !== false,
    };
  }

  if (data.customerCare && typeof data.customerCare === "object") {
    const cc = data.customerCare as Record<string, unknown>;
    clean.customerCare = {
      phone: String(cc.phone ?? "").replace(/\D/g, "").slice(0, 16),
      whatsapp: String(cc.whatsapp ?? "").replace(/\D/g, "").slice(0, 16),
      label: String(cc.label ?? "BETESE Customer Care").trim().slice(0, 80),
    };
  }

  if (data.qtech && typeof data.qtech === "object") {
    const qt = data.qtech as Record<string, unknown>;
    clean.qtech = {
      enabled: qt.enabled === true,
      passKey: String(qt.passKey ?? "").trim().slice(0, 256),
      apiBaseUrl: String(qt.apiBaseUrl ?? "")
        .trim()
        .replace(/\/+$/, "")
        .slice(0, 256),
      operatorId: String(qt.operatorId ?? "").trim().slice(0, 128),
      apiPassword: String(qt.apiPassword ?? "").trim().slice(0, 256),
      currency: String(qt.currency ?? "GMD")
        .trim()
        .toUpperCase()
        .slice(0, 3),
      country: String(qt.country ?? "GM")
        .trim()
        .toUpperCase()
        .slice(0, 2),
      lang: String(qt.lang ?? "en_GM").trim().slice(0, 16),
      lobbyUrl: String(qt.lobbyUrl ?? "https://www.beteseaviator.com/play").trim().slice(0, 256),
    };
  }

  await db.doc("settings/platform").set(clean, { merge: true });
  return { ok: true };
});

/** Rebuild stats/platform counters from the transactions ledger (admin repair tool). */
export const adminRebuildPlatformStats = onCall(async (req) => {
  await requireRole(req, ["admin"]);

  let totalBets = 0;
  let totalWins = 0;
  let totalDeposits = 0;
  let totalWithdrawals = 0;

  const snap = await db.collection("transactions").get();
  for (const doc of snap.docs) {
    const type = String(doc.data().type || "");
    const amount = Math.abs(Number(doc.data().amount) || 0);
    if (amount <= 0) continue;
    switch (type) {
      case "bet":
        totalBets += amount;
        break;
      case "win":
        totalWins += amount;
        break;
      case "deposit":
        totalDeposits += amount;
        break;
      case "withdrawal":
        totalWithdrawals += amount;
        break;
      default:
        break;
    }
  }

  const customers = await db.collection("users").where("role", "==", "player").count().get();
  const agents = await db
    .collection("users")
    .where("role", "in", ["super_agent", "sub_agent"])
    .count()
    .get();

  await db.doc("stats/platform").set(
    {
      customerCount: customers.data().count,
      agentCount: agents.data().count,
      totalBets,
      totalWins,
      totalDeposits,
      totalWithdrawals,
      rebuiltAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    ok: true,
    customerCount: customers.data().count,
    agentCount: agents.data().count,
    totalBets,
    totalWins,
    totalDeposits,
    totalWithdrawals,
    ggr: Math.max(0, totalBets - totalWins),
  };
});

/** Lobby banner ads — images + text shown on /play carousel. */
export const adminSaveLobbyPromos = onCall(async (req) => {
  await requireRole(req, ["admin"]);
  const slides = req.data?.slides;
  const ticker = req.data?.ticker;

  if (!Array.isArray(slides) || slides.length === 0) {
    throw new HttpsError("invalid-argument", "At least one slide is required.");
  }
  if (slides.length > 12) {
    throw new HttpsError("invalid-argument", "Maximum 12 slides allowed.");
  }

  const cleanSlides: Record<string, unknown>[] = [];
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i] as Record<string, unknown>;
    const id = String(s.id ?? `promo-${i}`).trim().slice(0, 64);
    const title = String(s.title ?? "").trim().slice(0, 120);
    const subtitle = String(s.subtitle ?? "").trim().slice(0, 240);
    const imageUrl = s.imageUrl ? String(s.imageUrl).trim().slice(0, 2048) : undefined;
    if (!title && !imageUrl) {
      throw new HttpsError("invalid-argument", `Slide ${i + 1} needs a title or image.`);
    }
    cleanSlides.push({
      id,
      title,
      subtitle,
      cta: s.cta ? String(s.cta).trim().slice(0, 40) : undefined,
      href: s.href ? String(s.href).trim().slice(0, 512) : undefined,
      imageUrl,
      gradient: s.gradient
        ? String(s.gradient).trim().slice(0, 120)
        : "from-emerald-700 via-emerald-900 to-black",
      accent: s.accent ? String(s.accent).trim().slice(0, 40) : "text-betese-yellow",
      active: s.active !== false,
      sortOrder: Number(s.sortOrder ?? i),
    });
  }

  let cleanTicker: string[] | undefined;
  if (Array.isArray(ticker)) {
    cleanTicker = ticker
      .map((line) => String(line).trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 20);
  }

  await db.doc("settings/lobbyPromos").set(
    {
      slides: cleanSlides,
      ...(cleanTicker?.length ? { ticker: cleanTicker } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true };
});

/** Refresh today's customer demo accounts (new phones + reset balances). */
export const adminRefreshDailyDemos = onCall(async (req) => {
  await requireRole(req, ["admin"]);
  const date = todayIso();
  const mmdd = date.slice(5).replace("-", "");
  const password = "password";
  const demoDefs = [
    { id: "customer-1", label: "Demo Player 1", phone: `301${mmdd}`, balance: 10_000 },
    { id: "customer-2", label: "Demo Player 2", phone: `302${mmdd}`, balance: 5_000 },
  ];

  const accounts: Record<string, unknown>[] = [];

  for (const demo of demoDefs) {
    const authEmail = phoneToEmail(demo.phone);
    let uid: string;
    try {
      const u = await auth.createUser({ email: authEmail, password, displayName: demo.label });
      uid = u.uid;
      await auth.setCustomUserClaims(uid, { role: "player" });
      await db.doc(`users/${uid}`).set({
        name: demo.label,
        email: null,
        phone: demo.phone,
        role: "player",
        parentId: null,
        agentSlug: null,
        ancestors: [],
        status: "active",
        stats: {},
        createdAt: FieldValue.serverTimestamp(),
      });
      await db.doc(`phones/${demo.phone}`).set({ uid });
    } catch (e: unknown) {
      if ((e as { code?: string }).code !== "auth/email-already-exists") throw e;
      uid = (await auth.getUserByEmail(authEmail)).uid;
      await auth.updateUser(uid, { password });
    }

    await db.runTransaction(async (tx) => {
      const wallet = await walletRead(tx, uid);
      const current = round2(wallet.balance);
      if (current !== demo.balance) {
        walletWrite(tx, wallet, {
          uid,
          amount: demo.balance - current,
          type: "deposit",
          description: `Daily demo reset ${date}`,
          meta: { demo: true, demoDate: date },
          ignoreFrozen: true,
        });
      }
    });

    accounts.push({
      id: demo.id,
      label: demo.label,
      role: "Customer",
      login: demo.phone,
      loginHint: "Phone number at sign-in",
      password,
      balance: `${demo.balance.toLocaleString()} GMD`,
      description: `Today's demo account (${date}). Resets daily.`,
    });
  }

  await db.doc("settings/demoAccounts").set({
    date,
    password,
    accounts,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, date, accounts };
});

/** Admin toggles lobby games (Aviator/Crash via QTech or native). */
export const adminSetGameStatus = onCall(async (req) => {
  await requireRole(req, ["admin"]);
  const gameId = String(req.data?.gameId ?? "").trim();
  if (!gameId) throw new HttpsError("invalid-argument", "gameId is required.");

  const patch: Record<string, unknown> = {};
  if (req.data?.status !== undefined) {
    const status = String(req.data.status);
    if (status !== "active" && status !== "inactive") {
      throw new HttpsError("invalid-argument", "status must be active or inactive.");
    }
    patch.status = status;
  }
  if (req.data?.name !== undefined) {
    patch.name = String(req.data.name).trim().slice(0, 80) || "Game";
  }
  if (req.data?.engine !== undefined) {
    const engine = String(req.data.engine);
    if (engine !== "native" && engine !== "qtech") {
      throw new HttpsError("invalid-argument", "engine must be native or qtech.");
    }
    patch.engine = engine;
  }
  if (req.data?.qtechGameId !== undefined) {
    patch.qtechGameId = String(req.data.qtechGameId).trim().slice(0, 128);
  }
  if (req.data?.rtp !== undefined) {
    const rtp = Number(req.data.rtp);
    if (!Number.isFinite(rtp) || rtp < 0 || rtp > 100) {
      throw new HttpsError("invalid-argument", "rtp must be between 0 and 100.");
    }
    patch.rtp = rtp;
  }
  if (Object.keys(patch).length === 0) {
    throw new HttpsError("invalid-argument", "Nothing to update.");
  }

  const ref = db.doc(`games/${gameId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Game not found.");

  await ref.set(patch, { merge: true });
  return { ok: true };
});

/** Creates/refreshes QTech Aviator + Crash game documents in Firestore. */
export const adminSeedQTechGames = onCall(async (req) => {
  await requireRole(req, ["admin"]);
  const { ensureQTechGameDocs, getQTechSetupStatus } = await import("./qtech/games");
  const ids = await ensureQTechGameDocs();
  const status = await getQTechSetupStatus();
  return { ok: true, gameIds: ids, ...status };
});

/** Readiness checklist for QTech wallet + game launch. */
export const adminGetQTechSetup = onCall(async (req) => {
  await requireRole(req, ["admin"]);
  const { getQTechSetupStatus } = await import("./qtech/games");
  return getQTechSetupStatus();
});

/** Save only QTech integration settings (credentials + enable toggle). */
export const adminSaveQTechSettings = onCall(async (req) => {
  await requireRole(req, ["admin"]);
  const data = req.data ?? {};
  if (!data.qtech || typeof data.qtech !== "object") {
    throw new HttpsError("invalid-argument", "qtech settings object is required.");
  }
  const qt = data.qtech as Record<string, unknown>;
  const qtech = {
    enabled: qt.enabled === true,
    passKey: String(qt.passKey ?? "").trim().slice(0, 256),
    apiBaseUrl: String(qt.apiBaseUrl ?? "")
      .trim()
      .replace(/\/+$/, "")
      .slice(0, 256),
    operatorId: String(qt.operatorId ?? "").trim().slice(0, 128),
    apiPassword: String(qt.apiPassword ?? "").trim().slice(0, 256),
    currency: String(qt.currency ?? "GMD")
      .trim()
      .toUpperCase()
      .slice(0, 3),
    country: String(qt.country ?? "GM")
      .trim()
      .toUpperCase()
      .slice(0, 2),
    lang: String(qt.lang ?? "en_GM").trim().slice(0, 16),
    lobbyUrl: String(qt.lobbyUrl ?? "https://www.beteseaviator.com/play").trim().slice(0, 256),
  };
  await db.doc("settings/platform").set({ qtech }, { merge: true });
  const { getQTechSetupStatus } = await import("./qtech/games");
  const status = await getQTechSetupStatus();
  return { ok: true, ...status };
});
