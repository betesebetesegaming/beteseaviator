import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { db, requireRole } from "../helpers";
import { getQTechSettings } from "./config";
import { createWalletSession } from "./session";

/** Route outbound QTech API calls through Cloud NAT static IP (QTech IP whitelist). */
const QTECH_OUTBOUND = {
  vpcConnector: "projects/beteseaviator-a05ae/locations/us-central1/connectors/betese-qtech",
  vpcConnectorEgressSettings: "ALL_TRAFFIC" as const,
};

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

function qtechNetworkError(e: unknown): HttpsError {
  const cause = e instanceof Error ? String(e.cause ?? e.message) : String(e);
  logger.error("QTech network error", { cause });
  const ipBlocked = /UND_ERR_SOCKET|other side closed|ECONNRESET/i.test(cause);
  return new HttpsError(
    "failed-precondition",
    ipBlocked
      ? "QTech blocked our server IP. Ask QTech to whitelist outbound IP 35.226.2.98 for qa_BETESE (INT)."
      : "Could not reach QTech API — check https://api-int.qtplatform.com is correct."
  );
}

/** QTech Common Wallet API v2.53 — section 4.1 Retrieve an Access Token. */
async function getQTechAccessToken(cfg: Awaited<ReturnType<typeof getQTechSettings>>): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }
  if (!cfg.apiBaseUrl || !cfg.operatorId || !cfg.apiPassword) {
    throw new HttpsError("failed-precondition", "QTech API credentials are not configured.");
  }

  const params = new URLSearchParams({
    grant_type: "password",
    response_type: "token",
    username: cfg.operatorId,
    password: cfg.apiPassword,
  });
  const url = `${cfg.apiBaseUrl}/v1/auth/token?${params.toString()}`;

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
        : "Could not authenticate with QTech — check operator ID and API password."
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

/**
 * QTech Common Wallet API v2.53 — section 5.1 Game Launcher.
 * POST /v1/games/{gameId}/launch-url
 */
async function fetchLaunchUrl(
  cfg: Awaited<ReturnType<typeof getQTechSettings>>,
  args: {
    playerId: string;
    displayName?: string;
    qtechGameId: string;
    walletSession: string;
    device: "mobile" | "desktop";
  }
): Promise<string> {
  const token = await getQTechAccessToken(cfg);
  const url = `${cfg.apiBaseUrl}/v1/games/${encodeURIComponent(args.qtechGameId)}/launch-url`;

  const payload: Record<string, unknown> = {
    playerId: args.playerId.slice(0, 34),
    currency: cfg.currency,
    country: cfg.country,
    lang: cfg.lang,
    mode: "real",
    device: args.device,
    returnUrl: cfg.lobbyUrl,
    walletSessionId: args.walletSession,
  };
  if (args.displayName?.trim()) {
    payload.displayName = args.displayName.trim().slice(0, 50);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    throw qtechNetworkError(e);
  }

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    logger.error("QTech launch failed", { status: res.status, body, gameId: args.qtechGameId });
    const msg = String(body.message || body.code || "QTech could not launch this game.");
    throw new HttpsError("failed-precondition", msg);
  }

  const launchUrl = String(body.url || "");
  if (!launchUrl) {
    throw new HttpsError("failed-precondition", "QTech launch response did not include a game URL.");
  }
  return launchUrl;
}

/** Player launches a QTech-hosted Aviator/Crash game. */
export const launchQTechGame = onCall(QTECH_OUTBOUND, async (req) => {
  const { uid, profile } = await requireRole(req, ["player"]);
  const gameId = String(req.data?.gameId || "").trim();
  if (!gameId) throw new HttpsError("invalid-argument", "gameId is required.");

  const gameSnap = await db.doc(`games/${gameId}`).get();
  if (!gameSnap.exists) throw new HttpsError("not-found", "Game not found.");
  const game = gameSnap.data()!;
  if (game.status !== "active") throw new HttpsError("failed-precondition", "This game is not active.");
  if (game.engine !== "qtech") {
    throw new HttpsError("failed-precondition", "This game does not use the QTech provider.");
  }

  const qtechGameId = String(game.qtechGameId || "").trim();
  if (!qtechGameId) {
    throw new HttpsError("failed-precondition", "QTech game ID is not configured for this game.");
  }

  const cfg = await getQTechSettings();
  if (!cfg.enabled) {
    throw new HttpsError("failed-precondition", "QTech integration is disabled in admin settings.");
  }

  const deviceRaw = String(req.data?.device || "mobile").toLowerCase();
  const device: "mobile" | "desktop" = deviceRaw === "desktop" ? "desktop" : "mobile";
  const walletSession = await createWalletSession(uid, gameId, qtechGameId);
  const launchUrl = await fetchLaunchUrl(cfg, {
    playerId: uid,
    displayName: profile.name,
    qtechGameId,
    walletSession,
    device,
  });

  return { launchUrl, walletSession };
});

/** Admin previews a QTech game in DEMO mode (no wallet session, no certification) before adding it. */
export const adminPreviewQTechGame = onCall(QTECH_OUTBOUND, async (req) => {
  await requireRole(req, ["admin"]);
  const qtechGameId = String(req.data?.qtechGameId || "").trim();
  if (!qtechGameId) throw new HttpsError("invalid-argument", "Enter a QTech game ID to preview.");

  const cfg = await getQTechSettings();
  if (!cfg.apiBaseUrl || !cfg.operatorId || !cfg.apiPassword) {
    throw new HttpsError("failed-precondition", "QTech API credentials are not configured.");
  }

  const deviceRaw = String(req.data?.device || "desktop").toLowerCase();
  const device: "mobile" | "desktop" = deviceRaw === "mobile" ? "mobile" : "desktop";

  const token = await getQTechAccessToken(cfg);
  let res: Response;
  try {
    res = await fetch(`${cfg.apiBaseUrl}/v1/games/${encodeURIComponent(qtechGameId)}/launch-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        playerId: "preview",
        currency: cfg.currency,
        country: cfg.country,
        lang: cfg.lang,
        mode: "demo",
        device,
        returnUrl: cfg.lobbyUrl,
      }),
    });
  } catch (e) {
    throw qtechNetworkError(e);
  }

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    logger.error("QTech preview failed", { status: res.status, body, gameId: qtechGameId });
    throw new HttpsError(
      "failed-precondition",
      String(body.message || body.code || "QTech could not load this game — check the game ID.")
    );
  }
  const launchUrl = String(body.url || "");
  if (!launchUrl) throw new HttpsError("failed-precondition", "QTech preview did not return a game URL.");
  return { launchUrl };
});
