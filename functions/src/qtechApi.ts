import { isAllowedPaymentOrigin } from "./corsMiddleware";
import express from "express";
import { logger } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import {
  getBalanceHandler,
  qtechErrorMiddleware,
  rewardHandler,
  rollbackV1Handler,
  rollbackV2Handler,
  transactionHandler,
  verifySessionHandler,
} from "./qtech/routes";

/**
 * QTech Common Wallet (Transfer Wallet) — operator-side API.
 * QTech game servers call these endpoints for session, balance, bet, win, rollback.
 *
 * Base URL: https://us-central1-<project>.cloudfunctions.net/qtcwApi
 */
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

function setPlayerHttpCors(req: express.Request, res: express.Response): void {
  const origin = req.headers.origin;
  if (origin && isAllowedPaymentOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/** Fast demo launch for lobby — skips Firebase callable cold start. */
app.options("/player/demo-launch", (req, res) => {
  setPlayerHttpCors(req, res);
  res.status(204).end();
});

app.get("/player/demo-launch", async (req, res) => {
  setPlayerHttpCors(req, res);
  const gameId = String(req.query.gameId ?? "").trim().slice(0, 128);
  if (!gameId) {
    res.status(400).json({ error: "gameId_required" });
    return;
  }
  try {
    const { parsePlayDevice, resolveDemoLaunchUrl, warmDemoLaunchDependencies } = await import("./qtech/demoLaunch");
    warmDemoLaunchDependencies();
    const device = parsePlayDevice(String(req.query.device ?? "mobile"));
    const launchUrl = await resolveDemoLaunchUrl(gameId, device);
    res.status(200).json({ launchUrl });
  } catch (e) {
    logger.warn("player demo-launch failed", { gameId, err: e instanceof Error ? e.message : String(e) });
    const message = e instanceof Error ? e.message : "demo_launch_failed";
    res.status(502).json({ error: "demo_launch_failed", message });
  }
});

app.get("/accounts/:playerId/session", (req, res) => void verifySessionHandler(req, res));
app.get("/accounts/:playerId/balance", (req, res) => void getBalanceHandler(req, res));

app.post("/transactions/rollback", (req, res) => void rollbackV2Handler(req, res));
app.post("/transactions/:referenceId/rollback", (req, res) => void rollbackV1Handler(req, res));
app.post("/transactions", (req, res) => void transactionHandler(req, res));
app.post("/transactions/", (req, res) => void transactionHandler(req, res));
app.post("/bonus/reward", (req, res) => void rewardHandler(req, res));
app.post("/bonus/rewards", (req, res) => void rewardHandler(req, res));

app.get("/health", async (_req, res) => {
  try {
    const { purgeLegacyLobbyGames, ensureLobbyGamesIfEmpty } = await import("./lobbyGames");
    // Old deployments recreated native games on health — always purge first.
    await purgeLegacyLobbyGames();
    await ensureLobbyGamesIfEmpty();
  } catch (e) {
    logger.error("lobby seed on health failed", e);
  }
  res.status(200).json({ ok: true, service: "betese-qtcw" });
});

/** Purge fake native games + refresh QTech catalog. ?key=beteseaviator-reset-2026 */
app.get("/bootstrap/purge-fake-games", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const { seedAllLobbyGames } = await import("./lobbyGames");
    const result = await seedAllLobbyGames();
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    logger.error("bootstrap purge-fake-games failed", e);
    res.status(500).json({ error: "purge_failed" });
  }
});

/** One-time / recovery: seed Aviator + Turbo (+ inactive QTech docs). ?key=beteseaviator-reset-2026 */
app.get("/bootstrap/seed-lobby", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const { seedAllLobbyGames } = await import("./lobbyGames");
    const result = await seedAllLobbyGames();
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    logger.error("bootstrap seed-lobby failed", e);
    res.status(500).json({ error: "seed_failed" });
  }
});

/** Sync QTech CDN thumbnails onto lobby game docs. ?key=beteseaviator-reset-2026 */
app.get("/bootstrap/sync-images", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const { syncQTechLobbyImages } = await import("./qtech/gameList");
    const imageSync = await syncQTechLobbyImages();
    res.status(200).json({ ok: true, imageSync });
  } catch (e) {
    logger.error("bootstrap sync-images failed", e);
    res.status(500).json({ error: "sync_failed", message: e instanceof Error ? e.message : String(e) });
  }
});

/** Search QTech catalog and optionally import matches. ?key=...&q=chick&import=1 */
app.get("/bootstrap/search-games", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const q = String(req.query.q ?? "chick").trim();
  const doImport = String(req.query.import ?? "") === "1";
  try {
    const { searchQTechCatalog, importQTechGamesToLobby, syncQTechLobbyImages } = await import(
      "./qtech/gameList"
    );
    const games = await searchQTechCatalog(q);
    let importResult: { imported: string[]; skipped: string[] } | undefined;
    let imageSync: Awaited<ReturnType<typeof syncQTechLobbyImages>> | undefined;
    if (doImport && games.length > 0) {
      importResult = await importQTechGamesToLobby(games);
      imageSync = await syncQTechLobbyImages();
    }
    res.status(200).json({
      ok: true,
      query: q,
      count: games.length,
      games,
      importResult,
      imageSync,
    });
  } catch (e) {
    logger.error("bootstrap search-games failed", e);
    res.status(500).json({
      error: "search_failed",
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** List games from QTech API for given providers (when permitted). */
app.get("/bootstrap/list-games", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const providers = String(req.query.providers ?? "IOG,INO,INOUT,SPB,EVP,EVO,PPC,BTL").trim();
  const q = String(req.query.q ?? "chick").trim().toLowerCase();
  try {
    const { searchQTechCatalogByProviders } = await import("./qtech/gameList");
    const games = await searchQTechCatalogByProviders(providers, q);
    res.status(200).json({ ok: true, count: games.length, games });
  } catch (e) {
    res.status(500).json({ error: "list_failed", message: e instanceof Error ? e.message : String(e) });
  }
});

/** Debug game id probes. ?key=...&ids=SPB-aviator,IOG-chickenroad */
app.get("/bootstrap/probe-games", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const ids = String(req.query.ids ?? "SPB-aviator,SPB-pilotchicken,IOG-chickenroad,INO-chickenroad")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    const { probeQTechGameIds } = await import("./qtech/gameList");
    const probes = await probeQTechGameIds(ids);
    res.status(200).json({ ok: true, probes });
  } catch (e) {
    res.status(500).json({ error: "probe_failed", message: e instanceof Error ? e.message : String(e) });
  }
});

/** Import explicit game IDs from query string. ?key=...&ids=IOG-chickenroad,SPB-pilotchicken */
app.get("/bootstrap/import-games", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const ids = String(req.query.ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length) {
    res.status(400).json({ error: "ids_required", message: "Pass comma-separated QTech game IDs in ?ids=" });
    return;
  }
  try {
    const { importQTechGamesByIds, syncQTechLobbyImages } = await import("./qtech/gameList");
    const { games, importResult } = await importQTechGamesByIds(ids);
    const imageSync = await syncQTechLobbyImages();
    res.status(200).json({ ok: true, count: games.length, games, importResult, imageSync });
  } catch (e) {
    logger.error("bootstrap import-games failed", e);
    res.status(500).json({ error: "import_failed", message: e instanceof Error ? e.message : String(e) });
  }
});

/** Fix lobby: sync catalog QTech IDs and remove games that fail launch. */
app.get("/bootstrap/reconcile-games", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const { reconcileQTechLobbyGames, syncQTechLobbyImages } = await import("./qtech/gameList");
    const reconcile = await reconcileQTechLobbyGames();
    const imageSync = await syncQTechLobbyImages();
    res.status(200).json({ ok: true, reconcile, imageSync });
  } catch (e) {
    logger.error("bootstrap reconcile-games failed", e);
    res.status(500).json({ error: "reconcile_failed", message: e instanceof Error ? e.message : String(e) });
  }
});

/** Permanently delete inactive non-catalog games (bad auto-imports). */
app.get("/bootstrap/purge-broken-games", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const { purgeBrokenLobbyGames } = await import("./qtech/gameList");
    const purge = await purgeBrokenLobbyGames();
    res.status(200).json({ ok: true, purge });
  } catch (e) {
    logger.error("bootstrap purge-broken-games failed", e);
    res.status(500).json({ error: "purge_failed", message: e instanceof Error ? e.message : String(e) });
  }
});

/** Remove slot, table, and lottery games from lobby (all providers). */
app.get("/bootstrap/purge-disallowed-lobby-games", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const { purgeDisallowedLobbyGames } = await import("./qtech/gameList");
    const purge = await purgeDisallowedLobbyGames();
    res.status(200).json({ ok: true, purge });
  } catch (e) {
    logger.error("bootstrap purge-disallowed-lobby-games failed", e);
    res.status(500).json({ error: "purge_failed", message: e instanceof Error ? e.message : String(e) });
  }
});

/** Remove non-catalog auto-imported games (broken provider iframes). */
app.get("/bootstrap/purge-non-catalog-games", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const { purgeNonCatalogLobbyGames } = await import("./qtech/gameList");
    const purge = await purgeNonCatalogLobbyGames();
    res.status(200).json({ ok: true, purge });
  } catch (e) {
    logger.error("bootstrap purge-non-catalog-games failed", e);
    res.status(500).json({ error: "purge_failed", message: e instanceof Error ? e.message : String(e) });
  }
});

/** Remove IOG slot, table, and lottery games from lobby. */
app.get("/bootstrap/purge-iog-slots-tables-lottery", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const { purgeDisallowedLobbyGames } = await import("./qtech/gameList");
    const purge = await purgeDisallowedLobbyGames();
    res.status(200).json({ ok: true, purge });
  } catch (e) {
    logger.error("bootstrap purge-iog failed", e);
    res.status(500).json({ error: "purge_failed", message: e instanceof Error ? e.message : String(e) });
  }
});

/** Import InOut (IOG) games from QTech release — no lottery/loto. */
app.get("/bootstrap/import-iog-games", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const { importIOGProviderGames } = await import("./qtech/gameList");
    const result = await importIOGProviderGames();
    res.status(200).json({ ok: true, ...result });
  } catch (e) {
    logger.error("bootstrap import-iog-games failed", e);
    res.status(500).json({ error: "import_failed", message: e instanceof Error ? e.message : String(e) });
  }
});

/** Discover chicken games via launch probe and import to Firestore. */
app.get("/bootstrap/import-chicken-games", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const { discoverChickenGamesViaLaunch, importQTechGamesToLobby, syncQTechLobbyImages } =
      await import("./qtech/gameList");
    const games = await discoverChickenGamesViaLaunch();
    const importResult = games.length ? await importQTechGamesToLobby(games) : { imported: [], skipped: [] };
    const imageSync = games.length ? await syncQTechLobbyImages() : undefined;
    res.status(200).json({ ok: true, count: games.length, games, importResult, imageSync });
  } catch (e) {
    logger.error("bootstrap import-chicken-games failed", e);
    res.status(500).json({ error: "import_failed", message: e instanceof Error ? e.message : String(e) });
  }
});

/** Patch platform min withdrawal (live). ?key=beteseaviator-reset-2026&min=100 */
app.get("/bootstrap/set-min-withdrawal", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const min = Number(req.query.min ?? 100);
  if (!Number.isFinite(min) || min < 0) {
    res.status(400).json({ error: "invalid_min" });
    return;
  }
  try {
    const { db } = await import("./helpers");
    await db.doc("settings/platform").set({ minWithdrawal: min }, { merge: true });
    res.status(200).json({ ok: true, minWithdrawal: min });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** List player wallets for CW certification setup. ?key=beteseaviator-reset-2026 */
app.get("/bootstrap/list-cw-players", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const { db } = await import("./helpers");
    const snap = await db.collection("users").where("role", "==", "player").limit(30).get();
    const players = [];
    for (const doc of snap.docs) {
      const u = doc.data();
      const w = await db.doc(`wallets/${doc.id}`).get();
      const balance = Number(w.data()?.balance ?? 0);
      const bonus = Number(w.data()?.bonusBalance ?? 0);
      players.push({
        uid: doc.id,
        name: u.name ?? null,
        phone: u.phone ?? null,
        status: u.status ?? null,
        balance,
        bonusBalance: bonus,
        playable: Math.round((balance + bonus) * 100) / 100,
      });
    }
    players.sort((a, b) => b.playable - a.playable);
    res.status(200).json({ ok: true, players });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Run CW certification + return cw_qtcw_tester.cfg for QTech handover. ?key=beteseaviator-reset-2026 */
/** Diagnose player login by phone. ?key=beteseaviator-reset-2026&phone=3905806 */
app.get("/bootstrap/diagnose-player", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const { auth, db, normalizePhone, phoneToEmail } = await import("./helpers");
    const phone = normalizePhone(String(req.query.phone ?? ""));
    if (!phone) {
      res.status(400).json({ error: "invalid_phone" });
      return;
    }
    const expectedEmail = phoneToEmail(phone);
    const phoneSnap = await db.doc(`phones/${phone}`).get();
    const userFromPhone = phoneSnap.exists ? String(phoneSnap.data()?.uid ?? "") : null;
    let authByUid: Record<string, unknown> | null = null;
    let authByEmail: Record<string, unknown> | null = null;
    if (userFromPhone) {
      try {
        const u = await auth.getUser(userFromPhone);
        authByUid = { uid: u.uid, email: u.email, disabled: u.disabled };
      } catch {
        authByUid = null;
      }
    }
    try {
      const u = await auth.getUserByEmail(expectedEmail);
      authByEmail = { uid: u.uid, email: u.email, disabled: u.disabled };
    } catch {
      authByEmail = null;
    }
    const profileSnap = userFromPhone ? await db.doc(`users/${userFromPhone}`).get() : null;
    res.status(200).json({
      ok: true,
      phone,
      expectedEmail,
      phonesDocUid: userFromPhone,
      profile: profileSnap?.exists ? profileSnap.data() : null,
      authByUid,
      authByEmail,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/bootstrap/repair-player-login", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const { auth, db, normalizePhone, phoneToEmail } = await import("./helpers");
    const phone = normalizePhone(String(req.query.phone ?? ""));
    const password = String(req.query.password ?? "");
    if (!phone) {
      res.status(400).json({ error: "invalid_phone" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "password_too_short" });
      return;
    }

    const authEmail = phoneToEmail(phone);
    const phoneSnap = await db.doc(`phones/${phone}`).get();
    if (!phoneSnap.exists) {
      res.status(404).json({ error: "phone_not_registered" });
      return;
    }
    const profileUid = String(phoneSnap.data()?.uid ?? "");

    let emailOwnerUid: string | null = null;
    try {
      emailOwnerUid = (await auth.getUserByEmail(authEmail)).uid;
    } catch {
      emailOwnerUid = null;
    }

    const actions: string[] = [];

    if (emailOwnerUid && emailOwnerUid !== profileUid) {
      const orphanProfile = await db.doc(`users/${emailOwnerUid}`).get();
      const orphanWallet = await db.doc(`wallets/${emailOwnerUid}`).get();
      if (!orphanProfile.exists && !orphanWallet.exists) {
        await auth.deleteUser(emailOwnerUid);
        actions.push(`deleted_orphan_auth:${emailOwnerUid}`);
        emailOwnerUid = null;
      } else {
        res.status(409).json({
          error: "email_owner_has_data",
          emailOwnerUid,
          profileUid,
          authEmail,
        });
        return;
      }
    }

    const profileSnap = await db.doc(`users/${profileUid}`).get();
    const name = profileSnap.exists ? String(profileSnap.data()?.name ?? "") : "";

    try {
      const current = await auth.getUser(profileUid);
      if (current.email !== authEmail) {
        await auth.updateUser(profileUid, { email: authEmail });
        actions.push("fixed_auth_email");
      }
    } catch {
      await auth.createUser({
        uid: profileUid,
        email: authEmail,
        password,
        displayName: name || undefined,
      });
      actions.push("created_auth_user");
    }

    await auth.updateUser(profileUid, {
      password,
      ...(name ? { displayName: name } : {}),
    });
    actions.push("password_updated");
    await auth.setCustomUserClaims(profileUid, { role: "player" });

    await db.doc(`phones/${phone}`).set({ uid: profileUid }, { merge: true });

    res.status(200).json({
      ok: true,
      phone,
      authEmail,
      profileUid,
      name,
      actions,
    });
  } catch (e) {
    logger.error("bootstrap repair-player-login failed", e);
    res.status(500).json({
      error: "repair_failed",
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

app.get("/bootstrap/reset-player-password", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const { auth, db, normalizePhone, phoneToEmail } = await import("./helpers");
    const phone = normalizePhone(String(req.query.phone ?? ""));
    const password = String(req.query.password ?? "");
    if (!phone) {
      res.status(400).json({ error: "invalid_phone" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "password_too_short" });
      return;
    }
    const phoneSnap = await db.doc(`phones/${phone}`).get();
    if (!phoneSnap.exists) {
      res.status(404).json({ error: "phone_not_registered" });
      return;
    }
    const uid = String(phoneSnap.data()?.uid ?? "");
    const authEmail = phoneToEmail(phone);
    const userSnap = await db.doc(`users/${uid}`).get();
    const name = userSnap.exists ? String(userSnap.data()?.name ?? "") : "";

    let authUser;
    try {
      authUser = await auth.getUser(uid);
    } catch {
      authUser = null;
    }

    if (authUser?.email === authEmail) {
      await auth.updateUser(uid, { password, ...(name ? { displayName: name } : {}) });
    } else {
      let emailOwnerUid: string | null = null;
      try {
        emailOwnerUid = (await auth.getUserByEmail(authEmail)).uid;
      } catch {
        emailOwnerUid = null;
      }
      if (emailOwnerUid && emailOwnerUid !== uid) {
        res.status(409).json({
          error: "auth_email_conflict",
          message: "Phone auth email belongs to a different Firebase user.",
          phonesDocUid: uid,
          emailOwnerUid,
          authEmail,
        });
        return;
      }
      await auth.updateUser(uid, {
        email: authEmail,
        password,
        ...(name ? { displayName: name } : {}),
      });
    }
    res.status(200).json({ ok: true, uid, phone, authEmail, name });
  } catch (e) {
    logger.error("bootstrap reset-player-password failed", e);
    res.status(500).json({
      error: "reset_failed",
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** Diagnose wallet vs ledger (excludes QTech test pollution). ?key=...&phone=3905806 */
app.get("/bootstrap/diagnose-wallet", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const { db, normalizePhone } = await import("./helpers");
    const { computeLegitimateWallet } = await import("./qtech/walletRepair");
    const phone = normalizePhone(String(req.query.phone ?? req.query.uid ?? ""));
    let uid = String(req.query.uid ?? "").trim();
    if (phone) {
      const phoneSnap = await db.doc(`phones/${phone}`).get();
      if (!phoneSnap.exists) {
        res.status(404).json({ error: "phone_not_found" });
        return;
      }
      uid = String(phoneSnap.data()?.uid ?? "");
    }
    if (!uid) {
      res.status(400).json({ error: "phone_or_uid_required" });
      return;
    }
    const walletSnap = await db.doc(`wallets/${uid}`).get();
    const ledger = await computeLegitimateWallet(uid);
    const current = {
      cash: Number(walletSnap.data()?.balance ?? 0),
      bonus: Number(walletSnap.data()?.bonusBalance ?? 0),
    };
    res.status(200).json({
      uid,
      phone: phone || null,
      current,
      legitimate: { cash: ledger.cash, bonus: ledger.bonus },
      delta: {
        cash: Math.round((ledger.cash - current.cash) * 100) / 100,
        bonus: Math.round((ledger.bonus - current.bonus) * 100) / 100,
      },
      excludedQTechTxns: ledger.excludedCount,
      includedTxns: ledger.includedCount,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

/** Repair wallet to ledger (removes QTech CW test pollution). ?key=...&phone=3905806&apply=1 */
app.get("/bootstrap/repair-wallet", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const { db, normalizePhone } = await import("./helpers");
    const { computeLegitimateWallet, repairWalletFromLedger } = await import("./qtech/walletRepair");
    const phone = normalizePhone(String(req.query.phone ?? ""));
    let uid = String(req.query.uid ?? "").trim();
    if (phone) {
      const phoneSnap = await db.doc(`phones/${phone}`).get();
      if (!phoneSnap.exists) {
        res.status(404).json({ error: "phone_not_found" });
        return;
      }
      uid = String(phoneSnap.data()?.uid ?? "");
    }
    if (!uid) {
      res.status(400).json({ error: "phone_or_uid_required" });
      return;
    }
    const apply = String(req.query.apply ?? "") === "1";
    if (!apply) {
      const walletSnap = await db.doc(`wallets/${uid}`).get();
      const ledger = await computeLegitimateWallet(uid);
      res.status(200).json({
        uid,
        phone: phone || null,
        dryRun: true,
        current: {
          cash: Number(walletSnap.data()?.balance ?? 0),
          bonus: Number(walletSnap.data()?.bonusBalance ?? 0),
        },
        wouldSet: { cash: ledger.cash, bonus: ledger.bonus },
        excludedQTechTxns: ledger.excludedCount,
        hint: "Add &apply=1 to apply the repair.",
      });
      return;
    }
    const result = await repairWalletFromLedger(uid, "Remove QTech CW test pollution");
    res.status(200).json({ ok: true, uid, phone: phone || null, ...result });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/bootstrap/refresh-cw-sessions", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const playerUid = String(req.query.playerUid ?? "").trim() || undefined;
    const { seedCwTestSessions, buildCwTesterCfg } = await import("./qtech/cwTester");
    const { getQTechSettings } = await import("./qtech/config");
    const { ensureCwTestPlayer } = await import("./qtech/cwTestPlayer");

    const settings = await getQTechSettings();
    if (!settings.passKey) {
      res.status(400).json({ error: "pass_key_not_configured" });
      return;
    }

    let uid = playerUid;
    if (!uid) {
      const player = await ensureCwTestPlayer();
      uid = player.uid;
    }

    const gameId = String(req.query.gameId ?? "SPB-aviator").trim();
    const sessions = await seedCwTestSessions(uid, "qtech-crash", gameId);
    const cfg = buildCwTesterCfg({
      passKey: settings.passKey,
      playerId: uid,
      sessions,
      gameId,
      currency: settings.currency,
    });

    res.status(200).json({
      ok: true,
      playerId: uid,
      sessions,
      cfg,
      note: "Send cfg.walletsession and cfg.passkey to QTech. Sessions valid 7 days; verify extends TTL.",
    });
  } catch (e) {
    logger.error("bootstrap refresh-cw-sessions failed", e);
    res.status(500).json({
      error: "refresh_failed",
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

app.get("/bootstrap/run-cw-certification", async (req, res) => {
  const key = String(req.query.key ?? "");
  if (key !== "beteseaviator-reset-2026") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  try {
    const playerUid = String(req.query.playerUid ?? "").trim() || undefined;
    const { runCwHandoverPackage } = await import("./qtech/cwTester");
    const pkg = await runCwHandoverPackage({ playerUid });
    res.status(200).json(pkg);
  } catch (e) {
    logger.error("bootstrap run-cw-certification failed", e);
    res.status(500).json({
      error: "cw_certification_failed",
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

app.use(qtechErrorMiddleware);

export const qtcwApi = onRequest(
  {
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 540,
    maxInstances: 10,
    invoker: "public",
    vpcConnector: "projects/beteseaviator-a05ae/locations/us-central1/connectors/betese-qtech",
    vpcConnectorEgressSettings: "ALL_TRAFFIC",
  },
  app
);
