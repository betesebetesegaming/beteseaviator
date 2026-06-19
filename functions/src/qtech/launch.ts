import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { db, requireRole } from "../helpers";
import { getQTechSettings } from "./config";
import { createWalletSession } from "./session";

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

async function getQTechAccessToken(cfg: Awaited<ReturnType<typeof getQTechSettings>>): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }
  if (!cfg.apiBaseUrl || !cfg.operatorId || !cfg.apiPassword) {
    throw new HttpsError("failed-precondition", "QTech API credentials are not configured.");
  }

  const url = `${cfg.apiBaseUrl}/v1/auth/token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "password",
      response_type: "token",
      username: cfg.operatorId,
      password: cfg.apiPassword,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    logger.error("QTech auth failed", { status: res.status, body });
    throw new HttpsError("failed-precondition", "Could not authenticate with QTech.");
  }

  const token = String(body.access_token || body.token || "");
  const expiresIn = Number(body.expires_in || 3600);
  if (!token) {
    throw new HttpsError("failed-precondition", "QTech auth response did not include a token.");
  }

  tokenCache = { token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

async function fetchLaunchUrl(
  cfg: Awaited<ReturnType<typeof getQTechSettings>>,
  args: {
    playerId: string;
    qtechGameId: string;
    walletSession: string;
    device: "MOBILE" | "DESKTOP";
  }
): Promise<string> {
  const token = await getQTechAccessToken(cfg);
  const path = cfg.gameLaunchPath.startsWith("/") ? cfg.gameLaunchPath : `/${cfg.gameLaunchPath}`;
  const url = `${cfg.apiBaseUrl}${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      playerId: args.playerId,
      gameId: args.qtechGameId,
      currency: cfg.currency,
      language: "en",
      mode: "real",
      device: args.device,
      clientType: "HTML5",
      walletSessionId: args.walletSession,
      returnUrl: cfg.lobbyUrl,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    logger.error("QTech launch failed", { status: res.status, body });
    throw new HttpsError("failed-precondition", "QTech could not launch this game.");
  }

  const launchUrl = String(body.url || body.gameUrl || body.launchUrl || "");
  if (!launchUrl) {
    throw new HttpsError("failed-precondition", "QTech launch response did not include a game URL.");
  }
  return launchUrl;
}

/** Player launches a QTech-hosted Aviator/Crash game. */
export const launchQTechGame = onCall(async (req) => {
  const { uid } = await requireRole(req, ["player"]);
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
  const device: "MOBILE" | "DESKTOP" = deviceRaw === "desktop" ? "DESKTOP" : "MOBILE";
  const walletSession = await createWalletSession(uid, gameId, qtechGameId);
  const launchUrl = await fetchLaunchUrl(cfg, {
    playerId: uid,
    qtechGameId,
    walletSession,
    device,
  });

  return { launchUrl, walletSession };
});
