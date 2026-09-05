import type { Request, Response } from "express";
import { createHash, randomInt } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { logger } from "firebase-functions";
import { db } from "../helpers";
import { toOtpMsisdn } from "../phone";

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
const OTP_SEND_LIMIT_PER_PHONE = 5;
const OTP_SEND_LIMIT_PER_IP = 30;

function getOtpSalt(): string {
  const salt = process.env.OTP_HASH_SALT?.trim();
  if (!salt) {
    throw new Error("OTP_HASH_SALT is not configured");
  }
  return salt;
}

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return req.socket?.remoteAddress || "unknown";
}

async function enforceOtpSendRateLimit(msisdn: string, ip: string): Promise<string | null> {
  const hourBucket = Math.floor(Date.now() / 3_600_000);
  const phoneRef = db.doc(`otp_rate_limits/phone_${msisdn}_${hourBucket}`);
  const ipRef = db.doc(`otp_rate_limits/ip_${ip.replace(/[^a-zA-Z0-9._-]/g, "_")}_${hourBucket}`);

  return db.runTransaction(async (tx) => {
    const [phoneSnap, ipSnap] = await Promise.all([tx.get(phoneRef), tx.get(ipRef)]);
    const phoneCount = Number(phoneSnap.data()?.count ?? 0);
    const ipCount = Number(ipSnap.data()?.count ?? 0);
    if (phoneCount >= OTP_SEND_LIMIT_PER_PHONE) {
      return "Too many verification codes for this number. Try again later.";
    }
    if (ipCount >= OTP_SEND_LIMIT_PER_IP) {
      return "Too many verification code requests. Try again later.";
    }
    tx.set(phoneRef, { count: phoneCount + 1, updatedAt: new Date().toISOString() }, { merge: true });
    tx.set(ipRef, { count: ipCount + 1, updatedAt: new Date().toISOString() }, { merge: true });
    return null;
  });
}

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

/** Gambian mobiles — 7-digit (legacy) or 9-digit, with or without 220. */
function normalizeMsisdn(raw: string): string | null {
  return toOtpMsisdn(raw);
}

function hashOtp(code: string, phone: string, salt: string): string {
  return createHash("sha256").update(`${code}|${phone}|${salt}`).digest("hex");
}

function africellPost(
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
      const isHttp = parsed.protocol === "http:";
      const transport = isHttp ? http : https;
      const payload = Buffer.from(body, "utf8");
      const req = transport.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (isHttp ? 80 : 443),
          path: `${parsed.pathname}${parsed.search}`,
          method: "POST",
          family: 4,
          headers: {
            ...headers,
            "Content-Length": String(payload.length),
          },
          timeout: timeoutMs,
          rejectUnauthorized: false,
        } as https.RequestOptions,
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

function africellCandidateUrls(baseUrl: string, sender: string, msisdn: string): string[] {
  const path = `/api/sendsms?sender=${encodeURIComponent(sender)}&msisdn=${encodeURIComponent(msisdn)}`;
  const host = baseUrl.replace(/^https?:\/\//, "");
  // Africell PDF: POST http://host:port/api/sendsms. HTTPS to :5991 hangs from
  // us-central1, so try HTTP first, then HTTPS.
  return [`http://${host}${path}`, `https://${host}${path}`];
}

export async function sendViaAfricell(msisdn: string, message: string): Promise<{ messageId: string | null }> {
  const baseUrl = (process.env.AFRICELL_SMS_URL || "").replace(/\/+$/, "");
  const username = process.env.AFRICELL_SMS_USERNAME || "";
  const password = process.env.AFRICELL_SMS_PASSWORD || "";
  const sender = process.env.AFRICELL_SMS_SENDER || "Betese";
  const timeoutMs = Number(process.env.AFRICELL_SMS_TIMEOUT_MS || 8000);

  if (!baseUrl || !username || !password) {
    throw new Error(
      "Africell SMS credentials not configured (AFRICELL_SMS_URL / AFRICELL_SMS_USERNAME / AFRICELL_SMS_PASSWORD)",
    );
  }

  const basic = Buffer.from(`${username}:${password}`).toString("base64");
  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    Authorization: `Basic ${basic}`,
  };

  const urls = africellCandidateUrls(baseUrl, sender, msisdn);
  let lastError = "Africell SMS gateway unreachable";

  for (const url of urls) {
    const result = await africellPost(url, headers, message, timeoutMs);
    if (result.error) {
      lastError = `Africell SMS gateway unreachable: ${result.error} (${result.elapsedMs}ms) via ${new URL(url).protocol}`;
      logger.warn("Africell SMS attempt failed", {
        protocol: new URL(url).protocol,
        elapsedMs: result.elapsedMs,
        error: result.error,
      });
      continue;
    }

    const parsed = parseAfricellSmsResponse(result.body, result.httpStatus);
    const { statusCode, gatewayMessage, messageId } = parsed;

    if (statusCode !== 200) {
      if (statusCode === 407) {
        throw new Error(
          "Africell SMS account has no tokens. Contact Africell to top up the Betese sender account.",
        );
      }
      lastError = `Africell gateway error (${statusCode}): ${gatewayMessage}`;
      logger.warn("Africell SMS rejected", {
        protocol: new URL(url).protocol,
        statusCode,
        gatewayMessage,
        elapsedMs: result.elapsedMs,
      });
      continue;
    }

    logger.info("Africell SMS sent", {
      msisdn,
      statusCode,
      messageId,
      protocol: new URL(url).protocol,
      elapsedMs: result.elapsedMs,
    });
    return { messageId };
  }

  throw new Error(lastError);
}

/**
 * Send any SMS via Africell, falling back to the PMU OTP relay when Aviator
 * cannot reach esme.africell.gm (common from us-central1). PMU is called with a
 * supplied `code` so it delivers `message` as-is and does not create an OTP hash.
 */
export async function sendSmsWithFallback(
  msisdn: string,
  message: string,
): Promise<{ messageId: string | null; via: "africell" | "pmu" }> {
  try {
    const { messageId } = await sendViaAfricell(msisdn, message);
    return { messageId, via: "africell" };
  } catch (err) {
    const localError = err instanceof Error ? err.message : String(err);
    const phone = msisdn.startsWith("220") && msisdn.length >= 10 ? msisdn.slice(3) : msisdn;
    logger.warn("Local Africell SMS failed, trying PMU SMS proxy", { msisdn, msg: localError });

    const proxied = await proxyPmuOtp("sendOtp", {
      phone,
      message,
      // Non-empty code → PMU/Aviator skip otp_codes write and just send the body.
      code: "000000",
    });
    if (proxied.httpStatus >= 200 && proxied.httpStatus < 300 && proxied.data.ok === true) {
      return {
        messageId: (proxied.data.messageId as string | null | undefined) ?? null,
        via: "pmu",
      };
    }
    throw new Error(String(proxied.data.error || localError));
  }
}

function otpGatewayReady(): { ok: boolean; via?: "africell" | "pmu"; error?: string } {
  try {
    getOtpSalt();
  } catch {
    return { ok: false, error: "OTP service is not configured." };
  }
  const hasAfricell = Boolean(
    (process.env.AFRICELL_SMS_URL || "").trim() &&
      (process.env.AFRICELL_SMS_USERNAME || "").trim() &&
      (process.env.AFRICELL_SMS_PASSWORD || "").trim(),
  );
  const hasPmu = Boolean((process.env.PMU_OTP_API_BASE_URL || PMU_OTP_BASE_URL).trim());
  if (hasAfricell) return { ok: true, via: "africell" };
  if (hasPmu) return { ok: true, via: "pmu" };
  return { ok: false, error: "Africell SMS credentials not configured" };
}

export async function sendOtpHandler(req: Request, res: Response): Promise<void> {
  const started = Date.now();
  const body = (req.body || {}) as { phone?: string; code?: string; message?: string; probe?: boolean | string };

  // Config-only health check — never send SMS. `live` stays disabled (it used to
  // fire a real Africell message at a hardcoded number).
  if (body.probe === true) {
    const ready = otpGatewayReady();
    if (!ready.ok) {
      res.status(503).json({ error: ready.error || "SMS gateway unavailable." });
      return;
    }
    res.json({ probe: true, gateway: ready.via });
    return;
  }
  if (body.probe === "live") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const phoneInput = (body.phone || "").trim();
  if (!phoneInput) {
    res.status(400).json({ error: "phone is required" });
    return;
  }
  const msisdn = normalizeMsisdn(phoneInput);
  if (!msisdn) {
    res.status(400).json({ error: "Invalid Gambian mobile. Use the old 7-digit or new 9-digit number (e.g. 7793854 or 877793854)." });
    return;
  }

  const rateLimitErr = await enforceOtpSendRateLimit(msisdn, clientIp(req));
  if (rateLimitErr) {
    res.status(429).json({ error: rateLimitErr });
    return;
  }

  let otpSalt: string;
  try {
    otpSalt = getOtpSalt();
  } catch {
    res.status(503).json({ error: "OTP service is not configured." });
    return;
  }

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
    try {
      await db.collection("otp_codes").doc(msisdn).set({
        phone: msisdn,
        code_hash: hashOtp(code, msisdn, otpSalt),
        expires_at: new Date(expiresAt).toISOString(),
        attempts: 0,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      logger.error("Failed to persist OTP hash", err);
      res.status(502).json({ error: "Failed to persist OTP. Please try again." });
      return;
    }
  }

  try {
    // Same code in the SMS whether Africell or PMU delivers it — keep local hash.
    const { messageId, via } = await sendSmsWithFallback(msisdn, smsText);
    logger.info("OTP send complete", {
      msisdn,
      path: via,
      elapsedMs: Date.now() - started,
    });
    res.json({ ok: true, messageId, expirySeconds: OTP_TTL_SECONDS, via });
  } catch (err) {
    if (storeHashForVerification) {
      await db.collection("otp_codes").doc(msisdn).delete().catch(() => undefined);
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Africell SMS dispatch failed", {
      msisdn,
      msg,
      elapsedMs: Date.now() - started,
    });
    res.status(502).json(otpSendFailurePayload(msg, undefined));
  }
}

/** Prefer actionable Africell/PMU reasons (e.g. no tokens) over generic timeout text. */
function otpSendFailurePayload(localError: string, pmuError: unknown): Record<string, unknown> {
  const pmu = String(pmuError || "").trim();
  const timedOut = /timeout|abort|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|fetch failed/i.test(localError);
  const noTokens = /no tokens/i.test(pmu) || /no tokens/i.test(localError);
  const error = noTokens
    ? "SMS service is out of credit. Contact BETESE support — Africell sender account needs tokens topped up."
    : timedOut
      ? "Africell SMS gateway timed out. Please try again in a minute."
      : pmu || localError;
  return {
    error,
    detail: timedOut ? localError : undefined,
    pmuError: pmu || undefined,
  };
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
    throw new Error("Invalid Gambian mobile. Use the old 7-digit or new 9-digit number (e.g. 7793854 or 877793854).");
  }

  const otpSalt = getOtpSalt();
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
    res.status(400).json({ error: "Invalid Gambian mobile. Use the old 7-digit or new 9-digit number (e.g. 7793854 or 877793854)." });
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
