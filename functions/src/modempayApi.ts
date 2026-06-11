import express from "express";
import cors from "cors";
import { onRequest } from "firebase-functions/v2/https";
import {
  checkoutHandler,
  wavePaymentHandler,
  apsPaymentHandler,
  afrimoneyPaymentHandler,
  qmoneyPaymentHandler,
  cardPaymentHandler,
  payoutHandler,
  refundHandler,
  balancesHandler,
  transactionHandler,
  webhookHandler,
  reconcileDepositHandler,
} from "./routes/modempay";

/**
 * Single Cloud Function hosting every ModemPay route (same handlers as betesepmu).
 * Webhook uses raw body on its path only — required for HMAC-SHA512 verification.
 */
const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: true }));

app.post(
  "/modempay-webhook",
  express.raw({ type: "*/*", limit: "2mb" }),
  (req, res) => void webhookHandler(req, res)
);

app.use(express.json({ limit: "6mb" }));

app.post("/modempay-checkout", (req, res) => void checkoutHandler(req, res));
app.post("/wave-payment", (req, res) => void wavePaymentHandler(req, res));
app.post("/aps-payment", (req, res) => void apsPaymentHandler(req, res));
app.post("/afrimoney-payment", (req, res) => void afrimoneyPaymentHandler(req, res));
app.post("/qmoney-payment", (req, res) => void qmoneyPaymentHandler(req, res));
app.post("/card-payment", (req, res) => void cardPaymentHandler(req, res));
app.post("/modempay-payout", (req, res) => void payoutHandler(req, res));
app.post("/modempay-refund", (req, res) => void refundHandler(req, res));
app.get("/modempay-balances", (req, res) => void balancesHandler(req, res));
app.get("/modempay-transactions/:id", (req, res) => void transactionHandler(req, res));
app.post("/modempay-reconcile-deposit", (req, res) => void reconcileDepositHandler(req, res));

export const modempayApi = onRequest(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, maxInstances: 5, cpu: 1 },
  app
);

/** Alias — same URL surface as betesepmu `modempayWebhook` export (points to shared app). */
export const modempayWebhook = modempayApi;
