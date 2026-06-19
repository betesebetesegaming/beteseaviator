import express from "express";
import { onRequest } from "firebase-functions/v2/https";
import {
  depositHandler,
  getBalanceHandler,
  qtechErrorMiddleware,
  rewardHandler,
  rollbackV1Handler,
  rollbackV2Handler,
  verifySessionHandler,
  withdrawalHandler,
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
app.post("/transactions/", (req, res) => void withdrawalHandler(req, res));
app.post("/transactions", (req, res) => void depositHandler(req, res));
app.post("/bonus/reward", (req, res) => void rewardHandler(req, res));
app.post("/bonus/rewards", (req, res) => void rewardHandler(req, res));

app.get("/health", (_req, res) => {
  void import("./lobbyGames")
    .then(({ ensureNativeLobbyGamesIfEmpty }) => ensureNativeLobbyGamesIfEmpty())
    .catch(() => {});
  res.status(200).json({ ok: true, service: "betese-qtcw" });
});

app.use(qtechErrorMiddleware);

export const qtcwApi = onRequest(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 60,
    maxInstances: 10,
    invoker: "public",
  },
  app
);
