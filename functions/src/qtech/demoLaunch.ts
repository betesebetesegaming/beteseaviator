import { HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { db } from "../helpers";
import { isCatalogQTechGameId, resolveLobbyGameId } from "../gameCatalog";
import { getQTechAccessToken, qtechNetworkError, shouldRefreshQTechToken } from "./auth";
import { getQTechSettings } from "./config";
import {
  demoLaunchCacheGet,
  demoLaunchCacheSet,
  isIntApiBase,
  qtechEnvironmentLabel,
} from "./runtimeCache";

export type QTechPlayDevice = "mobile" | "desktop";

const gameMetaCache = new Map<string, { qtechGameId: string; expiresAt: number }>();
const GAME_META_CACHE_MS = 10 * 60 * 1000;
/** Match client localStorage TTL — reuse URLs across warm instances. */
export const DEMO_LAUNCH_CACHE_MS = 20 * 60 * 1000;

function demoLaunchCacheKey(qtechGameId: string, device: string, apiBaseUrl: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}|${qtechGameId}|${device}`;
}

export function parsePlayDevice(raw: string | undefined): QTechPlayDevice {
  return String(raw || "mobile").toLowerCase() === "desktop" ? "desktop" : "mobile";
}

/** Firestore doc id qt-spb-aviator → QTech id SPB-aviator (catalog games only). */
export function deriveQtechGameIdFromDocId(gameId: string): string | null {
  const slug = gameId.trim().replace(/^qt-/, "");
  if (!slug.includes("-")) return null;
  const parts = slug.split("-");
  parts[0] = parts[0].toUpperCase();
  const qtechGameId = parts.join("-");
  return isCatalogQTechGameId(qtechGameId) ? qtechGameId : null;
}

async function loadActiveQTechGame(rawGameId: string): Promise<{ qtechGameId: string }> {
  const gameId = resolveLobbyGameId(rawGameId);
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

async function resolveQtechGameId(rawGameId: string): Promise<string> {
  const gameId = resolveLobbyGameId(rawGameId);
  const derived = deriveQtechGameIdFromDocId(gameId);
  if (derived) return derived;
  const { qtechGameId } = await loadActiveQTechGame(gameId);
  return qtechGameId;
}

async function requestDemoLaunchUrl(
  cfg: Awaited<ReturnType<typeof getQTechSettings>>,
  qtechGameId: string,
  device: QTechPlayDevice,
  playerId: string,
  accessToken: string,
): Promise<{ ok: true; url: string } | { ok: false; status: number; body: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await fetch(`${cfg.apiBaseUrl}/v1/games/${encodeURIComponent(qtechGameId)}/launch-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        playerId: playerId.slice(0, 34),
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
  if (!res.ok) return { ok: false, status: res.status, body };
  const launchUrl = String(body.url || "");
  if (!launchUrl) {
    throw new HttpsError("failed-precondition", "QTech demo did not return a game URL.");
  }
  return { ok: true, url: launchUrl };
}

/** Demo / fun mode — no wallet session (play for free). */
export async function fetchDemoLaunchUrl(
  cfg: Awaited<ReturnType<typeof getQTechSettings>>,
  qtechGameId: string,
  device: QTechPlayDevice,
  playerId = "demo",
): Promise<string> {
  const cacheKey = demoLaunchCacheKey(qtechGameId, device, cfg.apiBaseUrl);
  const cached = demoLaunchCacheGet(cacheKey, cfg.apiBaseUrl);
  if (cached) return cached;

  if (!cfg.apiBaseUrl || !cfg.operatorId || !cfg.apiPassword) {
    throw new HttpsError("failed-precondition", "QTech API credentials are not configured.");
  }

  let token = await getQTechAccessToken(cfg);
  let result = await requestDemoLaunchUrl(cfg, qtechGameId, device, playerId, token);

  // One automatic retry after credential / environment switches leave a warm INT token.
  if (!result.ok && shouldRefreshQTechToken(result.status, result.body)) {
    logger.warn("QTech demo launch token rejected — refreshing", {
      qtechGameId,
      status: result.status,
      env: qtechEnvironmentLabel(cfg.apiBaseUrl),
    });
    token = await getQTechAccessToken(cfg, { forceRefresh: true });
    result = await requestDemoLaunchUrl(cfg, qtechGameId, device, playerId, token);
  }

  if (!result.ok) {
    throw new HttpsError(
      "failed-precondition",
      String(result.body.message || result.body.code || "QTech could not load demo for this game."),
    );
  }

  // Guard: production API must not hand us an INT launcher URL.
  if (isIntApiBase(cfg.apiBaseUrl) === false && /client\.int\.|gl-int\./i.test(result.url)) {
    logger.error("QTech production demo returned INT launcher URL", { qtechGameId, url: result.url });
    throw new HttpsError(
      "failed-precondition",
      "QTech returned an integration launcher URL while production API is configured. Contact QTech.",
    );
  }

  demoLaunchCacheSet(cacheKey, result.url, cfg.apiBaseUrl, DEMO_LAUNCH_CACHE_MS);
  return result.url;
}

/** Resolve demo launch URL for a Firestore game doc id. */
export async function resolveDemoLaunchUrl(gameId: string, device: QTechPlayDevice): Promise<string> {
  const [qtechGameId, cfg] = await Promise.all([resolveQtechGameId(gameId), getQTechSettings()]);
  return fetchDemoLaunchUrl(cfg, qtechGameId, device);
}

/** Warm QTech auth + settings when a launch instance starts. */
export function warmDemoLaunchDependencies(): void {
  void getQTechSettings()
    .then((cfg) => getQTechAccessToken(cfg))
    .catch(() => undefined);
}
