import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onInit } from "firebase-functions/v2/core";
import { logger } from "firebase-functions/v2";
import { resolveLobbyGameId } from "../gameCatalog";
import { db, requireRole } from "../helpers";
import { getQTechAccessToken, qtechNetworkError, shouldRefreshQTechToken } from "./auth";
import { getQTechSettings } from "./config";
import {
  deriveQtechGameIdFromDocId,
  fetchDemoLaunchUrl,
  parsePlayDevice,
  resolveDemoLaunchUrl,
  warmDemoLaunchDependencies,
} from "./demoLaunch";
import { qtechEnvironmentLabel } from "./runtimeCache";
import { createWalletSession } from "./session";

/** Route outbound QTech API calls through Cloud NAT static IP (QTech IP whitelist). */
// Game-launch path: overrides the fractional-CPU / concurrency-1 global
// defaults so opening a game is fast (full vCPU, parallel launches).
export const QTECH_OUTBOUND = {
  memory: "512MiB" as const,
  cpu: 1,
  concurrency: 20,
  vpcConnector: "projects/beteseaviator-a05ae/locations/us-central1/connectors/betese-qtech",
  vpcConnectorEgressSettings: "ALL_TRAFFIC" as const,
};

/** Keep QTech auth token warm on the always-on launch instance. */
onInit(() => {
  warmDemoLaunchDependencies();
});

const gameMetaCache = new Map<string, { qtechGameId: string; expiresAt: number }>();
const GAME_META_CACHE_MS = 10 * 60 * 1000;

async function loadActiveQTechGame(rawGameId: string): Promise<{ gameId: string; qtechGameId: string }> {
  const gameId = resolveLobbyGameId(rawGameId);
  const cached = gameMetaCache.get(gameId);
  if (cached && cached.expiresAt > Date.now()) {
    return { gameId, qtechGameId: cached.qtechGameId };
  }

  // Catalog ids (qt-spb-aviator → SPB-aviator) skip a Firestore round-trip.
  const derived = deriveQtechGameIdFromDocId(gameId);
  if (derived) {
    gameMetaCache.set(gameId, { qtechGameId: derived, expiresAt: Date.now() + GAME_META_CACHE_MS });
    return { gameId, qtechGameId: derived };
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
  return { gameId, qtechGameId };
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
    accessToken?: string;
  },
): Promise<string> {
  const token = args.accessToken || (await getQTechAccessToken(cfg));
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
  // betLimitCode 1–5 are EUR/CNY tiers — omit for GMD so QTech uses the game default.
  if (args.displayName?.trim()) {
    payload.displayName = args.displayName.trim().slice(0, 50);
  }

  async function postLaunch(accessToken: string): Promise<{
    ok: true;
    url: string;
  } | {
    ok: false;
    status: number;
    body: Record<string, unknown>;
  }> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      throw qtechNetworkError(e);
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, status: res.status, body };
    const launchUrl = String(body.url || "");
    if (!launchUrl) {
      throw new HttpsError("failed-precondition", "QTech launch response did not include a game URL.");
    }
    return { ok: true, url: launchUrl };
  }

  let result = await postLaunch(token);
  if (!result.ok && shouldRefreshQTechToken(result.status, result.body)) {
    logger.warn("QTech real launch token rejected — refreshing", {
      qtechGameId: args.qtechGameId,
      status: result.status,
      env: qtechEnvironmentLabel(cfg.apiBaseUrl),
    });
    const freshToken = await getQTechAccessToken(cfg, { forceRefresh: true });
    result = await postLaunch(freshToken);
  }

  if (!result.ok) {
    logger.error("QTech launch failed", {
      status: result.status,
      body: result.body,
      gameId: args.qtechGameId,
      env: qtechEnvironmentLabel(cfg.apiBaseUrl),
    });
    const msg = String(result.body.message || result.body.code || "QTech could not launch this game.");
    throw new HttpsError("failed-precondition", msg);
  }

  return result.url;
}

/** Player launches a QTech-hosted Aviator/Crash game. Kept warm so the
 *  real player path never pays a cold start when opening a game. */
export const launchQTechGame = onCall({ ...QTECH_OUTBOUND, minInstances: 1 }, async (req) => {
  const started = Date.now();
  const { uid, profile } = await requireRole(req, ["player"]);
  const gameId = String(req.data?.gameId || "").trim();
  if (!gameId) throw new HttpsError("invalid-argument", "gameId is required.");

  const device = parsePlayDevice(req.data?.device);
  const [{ gameId: lobbyGameId, qtechGameId }, cfg] = await Promise.all([
    loadActiveQTechGame(gameId),
    getQTechSettings(),
  ]);
  if (!cfg.enabled) {
    throw new HttpsError("failed-precondition", "QTech integration is disabled in admin settings.");
  }

  // Session write + QTech token in parallel — biggest win on launch latency.
  const [walletSession, accessToken] = await Promise.all([
    createWalletSession(uid, lobbyGameId, qtechGameId),
    getQTechAccessToken(cfg),
  ]);

  const launchUrl = await fetchLaunchUrl(cfg, {
    playerId: uid,
    displayName: profile.name,
    qtechGameId,
    walletSession,
    device,
    accessToken,
  });

  logger.info("QTech real launch ready", {
    gameId: lobbyGameId,
    qtechGameId,
    ms: Date.now() - started,
    env: qtechEnvironmentLabel(cfg.apiBaseUrl),
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
