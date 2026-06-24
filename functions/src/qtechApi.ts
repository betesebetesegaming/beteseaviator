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

app.use(qtechErrorMiddleware);

export const qtcwApi = onRequest(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 60,
    maxInstances: 10,
    invoker: "public",
    vpcConnector: "projects/beteseaviator-a05ae/locations/us-central1/connectors/betese-qtech",
    vpcConnectorEgressSettings: "ALL_TRAFFIC",
  },
  app
);
