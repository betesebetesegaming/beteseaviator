import type { Request, Response } from "express";
import { createHash, randomInt } from "node:crypto";
import https from "node:https";
import { logger } from "firebase-functions";
import { db } from "../helpers";

/**
 * Africell SMS OTP HTTP handlers (sendOtp / verifyOtp).
 *
 * WARNING: Do NOT use Firebase Phone Auth or Identity Toolkit for SMS codes.
 * BETESE only sends OTP via Africell gateway. See lib/otpPolicy.ts (frontend mirror).
 */

const OTP_TTL_SECONDS = 300;
const OTP_VERIFIED_TTL_SECONDS = 600;
const OTP_LENGTH = 6;
const MAX_ATTEMPTS = 5;

/** betesepmu Cloud Functions — fallback when Aviator Africell egress is blocked. */
const PMU_OTP_BASE_URL = (
  process.env.PMU_OTP_API_BASE_URL || "https://us-central1-betesepmu-4ffc7.cloudfunctions.net"
).replace(/\/+$/, "");

async function proxyPmuOtp(
  fn: "sendOtp" | "verifyOtp",
  body: Record<string, unknown>,
): Promise<{ httpStatus: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(`${PMU_OTP_BASE_URL}/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Number(process.env.PMU_OTP_TIMEOUT_MS || 20000)),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { httpStatus: res.status, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { httpStatus: 502, data: { error: `PMU OTP proxy failed: ${msg}` } };
  }
}

async function mirrorOtpVerified(msisdn: string): Promise<void> {
  const verifiedExpiresAt = Date.now() + OTP_VERIFIED_TTL_SECONDS * 1000;
  await db.collection("otp_verified").doc(msisdn).set({
    phone: msisdn,
    verified_at: new Date().toISOString(),
    expires_at: new Date(verifiedExpiresAt).toISOString(),
    source: "pmu",
  });
}

/**
 * Africell Gambia SMS API Gateway — 20 February 2020
 * A. POST http://ip:port/api/sendsms?sender=&msisdn=  (Basic auth, plain-text body)
 * B. Response body: status line + message + messageId (XML tags also supported)
 */
const AFRICELL_STATUS_MESSAGES: Record<number, string> = {
  200: "Success",
  400: "Account doesn't exist / Bad parameters / Credentials not provided",
  401: "Account inactive",
  402: "Account blocked",
  403: "Incorrect password",
  405: "Sender ID not allowed",
  406: "Destination not allowed",
  407: "NoTokens",
  408: "Invalid destination",
  417: "Insufficient funds",
  429: "Too Many Requests",
  500: "Unknown error occurred",
  501: "Error sending message",
};

function parseAfricellSmsResponse(
  text: string,
  httpStatus: number,
): { statusCode: number; gatewayMessage: string; messageId: string | null } {
  const trimmed = String(text || "").trim();
  const xmlStatus = trimmed.match(/<Status>(\d+)<\/Status>/i);
  const xmlMessage = trimmed.match(/<Message>([^<]+)<\/Message>/i);
  const xmlMessageId = trimmed.match(/<MessageId>([^<]+)<\/MessageId>/i);
  if (xmlStatus) {
    const statusCode = Number(xmlStatus[1]);
    return {
      statusCode,
      gatewayMessage: xmlMessage?.[1] || AFRICELL_STATUS_MESSAGES[statusCode] || trimmed,
      messageId: xmlMessageId?.[1] || null,
    };
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 0 && /^\d{3}$/.test(lines[0])) {
    const statusCode = Number(lines[0]);
    return {
      statusCode,
      gatewayMessage: lines[1] || AFRICELL_STATUS_MESSAGES[statusCode] || trimmed,
      messageId: lines[2] || null,
    };
  }

  return {
    statusCode: httpStatus,
    gatewayMessage: trimmed || AFRICELL_STATUS_MESSAGES[httpStatus] || "SMS gateway error",
    messageId: null,
  };
}

/** Gambian Africell numbers only — 7 local digits or 220-prefixed msisdn. */
function normalizeMsisdn(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("220") && digits.length >= 10) return digits;
  if (digits.length === 7) return `220${digits}`;
  return null;
}

function hashOtp(code: string, phone: string, salt: string): string {
  return createHash("sha256").update(`${code}|${phone}|${salt}`).digest("hex");
}

function httpsPost(
  url: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<{ httpStatus: number; body: string; elapsedMs: number; error?: string }> {
  const started = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: {
      httpStatus: number;
      body: string;
      elapsedMs: number;
      error?: string;
    }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      const parsed = new URL(url);
      const payload = Buffer.from(body, "utf8");
      const req = https.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || 443,
          path: `${parsed.pathname}${parsed.search}`,
          method: "POST",
          headers: {
            ...headers,
            "Content-Length": String(payload.length),
          },
          timeout: timeoutMs,
        },
        (res) => {
          let text = "";
          res.on("data", (chunk) => {
            text += chunk;
          });
          res.on("end", () =>
            finish({ httpStatus: res.statusCode || 0, body: text, elapsedMs: Date.now() - started }),
          );
        },
      );
      req.on("error", (err) =>
        finish({
          httpStatus: 0,
          body: "",
          elapsedMs: Date.now() - started,
          error: err.message,
        }),
      );
      req.on("timeout", () => {
        req.destroy();
        finish({ httpStatus: 0, body: "", elapsedMs: Date.now() - started, error: "timeout" });
      });
      req.write(payload);
      req.end();
    } catch (err) {
      finish({
        httpStatus: 0,
        body: "",
        elapsedMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

async function africellRequest(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ httpStatus: number; body: string; elapsedMs: number; error?: string }> {
  const started = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const body = await res.text();
    return { httpStatus: res.status, body, elapsedMs: Date.now() - started };
  } catch (err) {
    return {
      httpStatus: 0,
      body: "",
      elapsedMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function probeAfricellLive(): Promise<Record<string, unknown>> {
  const baseUrl = (process.env.AFRICELL_SMS_URL || "").replace(/\/+$/, "");
  const username = process.env.AFRICELL_SMS_USERNAME || "";
  const password = process.env.AFRICELL_SMS_PASSWORD || "";
  const sender = process.env.AFRICELL_SMS_SENDER || "Betese";
  const timeoutMs = Number(process.env.AFRICELL_SMS_TIMEOUT_MS || 25000);
  const msisdn = "2207701234";
  const message = "BETESE gateway connectivity test";

  const basicUrl = `${baseUrl}/api/sendsms?sender=${encodeURIComponent(sender)}&msisdn=${encodeURIComponent(msisdn)}`;
  const basic = Buffer.from(`${username}:${password}`).toString("base64");
  const basicResult = await httpsPost(
    basicUrl,
    {
      "Content-Type": "text/plain; charset=utf-8",
      Authorization: `Basic ${basic}`,
    },
    message,
    timeoutMs,
  );

  const queryParams = new URLSearchParams({
    sender,
    msisdn,
    username,
    password,
    message,
  });
  const queryUrl = `${baseUrl}/api/sendsms?${queryParams.toString()}`;
  const queryResult = await africellRequest(queryUrl, { method: "POST" }, timeoutMs);

  return {
    gateway: baseUrl,
    port: baseUrl.match(/:(\d+)/)?.[1] || "unknown",
    msisdn,
    basicAuth: basicResult.error
      ? basicResult
      : { ...basicResult, parsed: parseAfricellSmsResponse(basicResult.body, basicResult.httpStatus) },
    queryParams: queryResult.error
      ? queryResult
      : { ...queryResult, parsed: parseAfricellSmsResponse(queryResult.body, queryResult.httpStatus) },
  };
}

async function sendViaAfricell(msisdn: string, message: string): Promise<{ messageId: string | null }> {
  const baseUrl = (process.env.AFRICELL_SMS_URL || "").replace(/\/+$/, "");
  const username = process.env.AFRICELL_SMS_USERNAME || "";
  const password = process.env.AFRICELL_SMS_PASSWORD || "";
  const sender = process.env.AFRICELL_SMS_SENDER || "Betese";
  // Keep this short so a hung gateway fails over to PMU instead of spinning ~50s.
  const timeoutMs = Number(process.env.AFRICELL_SMS_TIMEOUT_MS || 10000);

  if (!baseUrl || !username || !password) {
    throw new Error(
      "Africell SMS credentials not configured (AFRICELL_SMS_URL / AFRICELL_SMS_USERNAME / AFRICELL_SMS_PASSWORD)",
    );
  }

  const url = `${baseUrl}/api/sendsms?sender=${encodeURIComponent(sender)}&msisdn=${encodeURIComponent(msisdn)}`;
  const basic = Buffer.from(`${username}:${password}`).toString("base64");

  const result = await httpsPost(
    url,
    {
      "Content-Type": "text/plain; charset=utf-8",
      Authorization: `Basic ${basic}`,
    },
    message,
    timeoutMs,
  );

  if (result.error) {
    throw new Error(`Africell SMS gateway unreachable: ${result.error} (${result.elapsedMs}ms)`);
  }

  const parsed = parseAfricellSmsResponse(result.body, result.httpStatus);
  const { statusCode, gatewayMessage, messageId } = parsed;

  if (statusCode !== 200) {
    if (statusCode === 407) {
      throw new Error(
        "Africell SMS account has no tokens. Contact Africell to top up the Betese sender account.",
      );
    }
    throw new Error(`Africell gateway error (${statusCode}): ${gatewayMessage}`);
  }

  logger.info("Africell SMS sent", {
    msisdn,
    statusCode,
    messageId,
    elapsedMs: result.elapsedMs,
  });
  return { messageId };
}

export async function sendOtpHandler(req: Request, res: Response): Promise<void> {
  const started = Date.now();
  const body = (req.body || {}) as { phone?: string; code?: string; message?: string; probe?: boolean | string };

  if (body.probe === true) {
    const baseUrl = process.env.AFRICELL_SMS_URL || "";
    const username = process.env.AFRICELL_SMS_USERNAME || "";
    const password = process.env.AFRICELL_SMS_PASSWORD || "";
    if (!baseUrl || !username || !password) {
      const proxied = await proxyPmuOtp("sendOtp", { probe: true });
      if (proxied.httpStatus >= 200 && proxied.httpStatus < 300 && proxied.data.probe === true) {
        res.json({ probe: true, gateway: proxied.data.gateway, via: "pmu" });
        return;
      }
      res.status(503).json({ error: "Africell SMS credentials not configured" });
      return;
    }
    res.json({ probe: true, gateway: baseUrl });
    return;
  }

  if (body.probe === "live") {
    const baseUrl = process.env.AFRICELL_SMS_URL || "";
    const username = process.env.AFRICELL_SMS_USERNAME || "";
    const password = process.env.AFRICELL_SMS_PASSWORD || "";
    if (!baseUrl || !username || !password) {
      res.status(503).json({ error: "Africell SMS credentials not configured" });
      return;
    }
    try {
      const result = await probeAfricellLive();
      res.json({ ok: true, live: result });
    } catch (err) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  const phoneInput = (body.phone || "").trim();
  if (!phoneInput) {
    res.status(400).json({ error: "phone is required" });
    return;
  }
  const msisdn = normalizeMsisdn(phoneInput);
  if (!msisdn) {
    res.status(400).json({ error: "Invalid Gambian mobile number. Use 7 digits (e.g. 7701234)." });
    return;
  }

  const otpSalt = process.env.OTP_HASH_SALT || "betese-otp-default-salt";

  const suppliedCode = (body.code || "").trim();
  let code: string;
  let storeHashForVerification = false;
  if (suppliedCode) {
    code = suppliedCode;
  } else {
    const min = 10 ** (OTP_LENGTH - 1);
    const max = 10 ** OTP_LENGTH;
    code = String(randomInt(min, max));
    storeHashForVerification = true;
  }

  const messageTemplate =
    body.message ||
    process.env.OTP_MESSAGE_TEMPLATE ||
    "Your BETESE verification code is: {{code}}. It expires in 5 minutes. Do not share this code with anyone.";
  const smsText = messageTemplate.replace("{{code}}", code);

  if (storeHashForVerification) {
    const expiresAt = Date.now() + OTP_TTL_SECONDS * 1000;
    const persist = db.collection("otp_codes").doc(msisdn).set({
      phone: msisdn,
      code_hash: hashOtp(code, msisdn, otpSalt),
      expires_at: new Date(expiresAt).toISOString(),
      attempts: 0,
      created_at: new Date().toISOString(),
    });

    try {
      // Start Africell at the same time as Firestore so SMS isn't delayed by the write.
      const [{ messageId }] = await Promise.all([sendViaAfricell(msisdn, smsText), persist]);
      logger.info("OTP send complete", {
        msisdn,
        path: "africell",
        elapsedMs: Date.now() - started,
      });
      res.json({ ok: true, messageId, expirySeconds: OTP_TTL_SECONDS });
      return;
    } catch (err) {
      await db.collection("otp_codes").doc(msisdn).delete().catch(() => undefined);
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("Local Africell SMS failed, trying PMU OTP proxy", {
        msisdn,
        msg,
        elapsedMs: Date.now() - started,
      });

      const proxied = await proxyPmuOtp("sendOtp", { phone: phoneInput });
      if (proxied.httpStatus >= 200 && proxied.httpStatus < 300 && proxied.data.ok === true) {
        logger.info("OTP sent via PMU proxy", {
          msisdn,
          elapsedMs: Date.now() - started,
        });
        res.json(proxied.data);
        return;
      }

      logger.error("Africell SMS dispatch failed", {
        msisdn,
        msg,
        pmuError: proxied.data.error,
        elapsedMs: Date.now() - started,
      });
      const timedOut = /timeout|abort|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|fetch failed/i.test(msg);
      res.status(502).json({
        error: timedOut ? "Africell SMS gateway timed out." : msg,
        detail: timedOut ? msg : undefined,
        pmuError: proxied.data.error,
      });
      return;
    }
  }

  try {
    const { messageId } = await sendViaAfricell(msisdn, smsText);
    logger.info("OTP send complete", {
      msisdn,
      path: "africell",
      elapsedMs: Date.now() - started,
    });
    res.json({ ok: true, messageId, expirySeconds: OTP_TTL_SECONDS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("Local Africell SMS failed, trying PMU OTP proxy", {
      msisdn,
      msg,
      elapsedMs: Date.now() - started,
    });

    const proxied = await proxyPmuOtp("sendOtp", { phone: phoneInput });
    if (proxied.httpStatus >= 200 && proxied.httpStatus < 300 && proxied.data.ok === true) {
      logger.info("OTP sent via PMU proxy", { msisdn, elapsedMs: Date.now() - started });
      res.json(proxied.data);
      return;
    }

    logger.error("Africell SMS dispatch failed", { msisdn, msg, pmuError: proxied.data.error });
    const timedOut = /timeout|abort|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|fetch failed/i.test(msg);
    res.status(502).json({
      error: timedOut ? "Africell SMS gateway timed out." : msg,
      detail: timedOut ? msg : undefined,
      pmuError: proxied.data.error,
    });
  }
}

/** Verify SMS OTP and mark phone verified in Firestore. Used by HTTP + callables. */
export async function verifySmsOtp(phoneInput: string, code: string): Promise<string> {
  const trimmedPhone = String(phoneInput || "").trim();
  const trimmedCode = String(code || "").trim();
  if (!trimmedPhone || !trimmedCode) {
    throw new Error("phone and code are required");
  }
  const msisdn = normalizeMsisdn(trimmedPhone);
  if (!msisdn) {
    throw new Error("Invalid Gambian mobile number. Use 7 digits (e.g. 7701234).");
  }

  const otpSalt = process.env.OTP_HASH_SALT || "betese-otp-default-salt";
  const ref = db.collection("otp_codes").doc(msisdn);
  const snap = await ref.get();
  if (!snap.exists) {
    const proxied = await proxyPmuOtp("verifyOtp", { phone: trimmedPhone, code: trimmedCode });
    if (proxied.httpStatus >= 200 && proxied.httpStatus < 300 && proxied.data.ok === true) {
      await mirrorOtpVerified(msisdn);
      return msisdn;
    }
    throw new Error(
      String(proxied.data.error || "No OTP request found for this number. Please request a new code."),
    );
  }

  const data = snap.data() as { code_hash?: string; expires_at?: string; attempts?: number };
  const expiresAt = data.expires_at ? Date.parse(data.expires_at) : 0;
  if (!expiresAt || Date.now() > expiresAt) {
    await ref.delete().catch(() => undefined);
    throw new Error("OTP code expired. Please request a new code.");
  }

  const attempts = Number(data.attempts || 0);
  if (attempts >= MAX_ATTEMPTS) {
    await ref.delete().catch(() => undefined);
    throw new Error("Too many failed attempts. Please request a new code.");
  }

  const expectedHash = data.code_hash || "";
  const actualHash = hashOtp(trimmedCode, msisdn, otpSalt);
  if (expectedHash !== actualHash) {
    await ref.update({ attempts: attempts + 1 }).catch(() => undefined);
    throw new Error("Invalid OTP code.");
  }

  await ref.delete().catch(() => undefined);
  const verifiedExpiresAt = Date.now() + OTP_VERIFIED_TTL_SECONDS * 1000;
  await db.collection("otp_verified").doc(msisdn).set({
    phone: msisdn,
    verified_at: new Date().toISOString(),
    expires_at: new Date(verifiedExpiresAt).toISOString(),
  });
  return msisdn;
}

export async function verifyOtpHandler(req: Request, res: Response): Promise<void> {
  const body = (req.body || {}) as { phone?: string; code?: string };

  const phoneInput = (body.phone || "").trim();
  const code = (body.code || "").trim();
  if (!phoneInput || !code) {
    res.status(400).json({ error: "phone and code are required" });
    return;
  }
  const msisdn = normalizeMsisdn(phoneInput);
  if (!msisdn) {
    res.status(400).json({ error: "Invalid Gambian mobile number. Use 7 digits (e.g. 7701234)." });
    return;
  }

  try {
    await verifySmsOtp(phoneInput, code);
    res.json({ ok: true, verified: true, phone: msisdn });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Invalid OTP")) {
      res.status(401).json({ error: msg });
      return;
    }
    if (msg.includes("expired") || msg.includes("Too many")) {
      res.status(410).json({ error: msg });
      return;
    }
    if (msg.includes("No OTP request")) {
      res.status(404).json({ error: msg });
      return;
    }
    logger.error("OTP verification failed", err);
    res.status(500).json({ error: msg });
  }
}
