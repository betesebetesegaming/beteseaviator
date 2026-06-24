import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { getQTechSettings } from "./config";

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

export function qtechNetworkError(e: unknown): HttpsError {
  const cause = e instanceof Error ? String(e.cause ?? e.message) : String(e);
  logger.error("QTech network error", { cause });
  const ipBlocked = /UND_ERR_SOCKET|other side closed|ECONNRESET/i.test(cause);
  return new HttpsError(
    "failed-precondition",
    ipBlocked
      ? "QTech blocked our server IP. Ask QTech to whitelist outbound IP 35.226.2.98 for qa_BETESE (INT)."
      : "Could not reach QTech API — check https://api-int.qtplatform.com is correct.",
  );
}

/** QTech Common Wallet API v2.53 — section 4.1 Retrieve an Access Token. */
export async function getQTechAccessToken(
  cfg?: Awaited<ReturnType<typeof getQTechSettings>>,
): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const settings = cfg ?? (await getQTechSettings());
  if (!settings.apiBaseUrl || !settings.operatorId || !settings.apiPassword) {
    throw new HttpsError("failed-precondition", "QTech API credentials are not configured.");
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
    logger.error("QTech auth failed", { status: res.status, body });
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

  tokenCache = { token, expiresAt: Date.now() + expiresIn };
  return token;
}
