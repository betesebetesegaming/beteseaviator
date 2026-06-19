import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { db, requireRole } from "../helpers";
import { getQTechSettings } from "./config";
import { createWalletSession } from "./session";

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

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

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    logger.error("QTech auth failed", { status: res.status, body });
    throw new HttpsError("failed-precondition", "Could not authenticate with QTech.");
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

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

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
export const launchQTechGame = onCall(async (req) => {
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
