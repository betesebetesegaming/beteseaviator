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
