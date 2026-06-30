import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { db, requireRole } from "../helpers";
import { getQTechAccessToken, qtechNetworkError } from "./auth";
import { getQTechSettings } from "./config";
import { fetchDemoLaunchUrl, parsePlayDevice, resolveDemoLaunchUrl } from "./demoLaunch";
import { createWalletSession } from "./session";

/** Route outbound QTech API calls through Cloud NAT static IP (QTech IP whitelist). */
export const QTECH_OUTBOUND = {
  vpcConnector: "projects/beteseaviator-a05ae/locations/us-central1/connectors/betese-qtech",
  vpcConnectorEgressSettings: "ALL_TRAFFIC" as const,
};

const gameMetaCache = new Map<string, { qtechGameId: string; expiresAt: number }>();
const GAME_META_CACHE_MS = 10 * 60 * 1000;

async function loadActiveQTechGame(gameId: string): Promise<{ qtechGameId: string }> {
  const cached = gameMetaCache.get(gameId);
  if (cached && cached.expiresAt > Date.now()) {
    return { qtechGameId: cached.qtechGameId };
  }

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
  gameMetaCache.set(gameId, { qtechGameId, expiresAt: Date.now() + GAME_META_CACHE_MS });
  return { qtechGameId };
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
  },
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
    betLimitCode: "1",
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

  const device = parsePlayDevice(req.data?.device);
  const [{ qtechGameId }, cfg] = await Promise.all([loadActiveQTechGame(gameId), getQTechSettings()]);
  if (!cfg.enabled) {
    throw new HttpsError("failed-precondition", "QTech integration is disabled in admin settings.");
  }

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

/** Anyone can try a lobby game in demo mode (no login, no wallet). */
export const launchQTechGameDemo = onCall(QTECH_OUTBOUND, async (req) => {
  const gameId = String(req.data?.gameId || "").trim();
  if (!gameId) throw new HttpsError("invalid-argument", "gameId is required.");

  const device = parsePlayDevice(req.data?.device);
  const launchUrl = await resolveDemoLaunchUrl(gameId, device);
  return { launchUrl };
});

/** Admin previews a QTech game in DEMO mode (no wallet session, no certification) before adding it. */
export const adminPreviewQTechGame = onCall(QTECH_OUTBOUND, async (req) => {
  await requireRole(req, ["admin"]);
  const qtechGameId = String(req.data?.qtechGameId || "").trim();
  if (!qtechGameId) throw new HttpsError("invalid-argument", "Enter a QTech game ID to preview.");

  const cfg = await getQTechSettings();
  const device = parsePlayDevice(req.data?.device);
  const launchUrl = await fetchDemoLaunchUrl(cfg, qtechGameId, device, "preview");
  return { launchUrl };
});
