import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getQTechSettings } from "./config";
import { isIntApiBase } from "./runtimeCache";

type TokenCache = { key: string; token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

function tokenCacheKey(apiBaseUrl: string, operatorId: string, apiPassword: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}|${operatorId}|${apiPassword}`;
}

export function clearQTechAccessTokenCache(): void {
  tokenCache = null;
}

export function qtechNetworkError(e: unknown): HttpsError {
  const cause = e instanceof Error ? String(e.cause ?? e.message) : String(e);
  logger.error("QTech network error", { cause });
  const ipBlocked = /UND_ERR_SOCKET|other side closed|ECONNRESET/i.test(cause);
  return new HttpsError(
    "failed-precondition",
    ipBlocked
      ? "QTech blocked our server IP. Ask QTech to whitelist outbound IP 35.226.2.98 for your API account."
      : "Could not reach QTech API — check the API base URL in Admin → QTech & Games.",
  );
}

function isInvalidTokenError(status: number, body: Record<string, unknown>): boolean {
  if (status === 401 || status === 403) return true;
  const detail = `${body.message || ""} ${body.error || ""} ${body.code || ""}`.toLowerCase();
  return /invalid|expired|access.?token|unauthorized|authentication/i.test(detail);
}

/** QTech Common Wallet API v2.53 — section 4.1 Retrieve an Access Token. */
export async function getQTechAccessToken(
  cfg?: Awaited<ReturnType<typeof getQTechSettings>>,
  opts?: { forceRefresh?: boolean },
): Promise<string> {
  const settings = cfg ?? (await getQTechSettings());
  if (!settings.apiBaseUrl || !settings.operatorId || !settings.apiPassword) {
    throw new HttpsError("failed-precondition", "QTech API credentials are not configured.");
  }

  const key = tokenCacheKey(settings.apiBaseUrl, settings.operatorId, settings.apiPassword);
  if (
    !opts?.forceRefresh &&
    tokenCache &&
    tokenCache.key === key &&
    tokenCache.expiresAt > Date.now() + 60_000
  ) {
    return tokenCache.token;
  }

  const params = new URLSearchParams({
    grant_type: "password",
    response_type: "token",
    username: settings.operatorId,
    password: settings.apiPassword,
  });
  const url = `${settings.apiBaseUrl}/v1/auth/token?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (e) {
    throw qtechNetworkError(e);
  }

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    tokenCache = null;
    logger.error("QTech auth failed", {
      status: res.status,
      body,
      env: isIntApiBase(settings.apiBaseUrl) ? "integration" : "production",
      operatorId: settings.operatorId,
      apiBaseUrl: settings.apiBaseUrl,
    });
    const detail = String(body.message || body.error || body.code || "").trim();
    throw new HttpsError(
      "failed-precondition",
      detail
        ? `QTech login failed: ${detail}`
        : "Could not authenticate with QTech — check operator ID and API password.",
    );
  }

  const token = String(body.access_token || body.token || "");
  const expiresIn = Number(body.expires_in || 21_600_000);
  if (!token) {
    throw new HttpsError("failed-precondition", "QTech auth response did not include a token.");
  }

  tokenCache = { key, token, expiresAt: Date.now() + expiresIn };
  return token;
}

/** True when a launch/API response means the cached bearer token is dead. */
export function shouldRefreshQTechToken(status: number, body: Record<string, unknown>): boolean {
  return isInvalidTokenError(status, body);
}
