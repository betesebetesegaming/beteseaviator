"use client";

import { launchQTechGame, launchQTechGameDemo } from "@/lib/api";
import { fetchDemoLaunchUrlHttp } from "@/lib/games/demoLaunchHttp";
import { resolveLobbyGameId } from "@/lib/games/legacyGameIds";
import type { Game } from "@/lib/types";

const GAME_DOC_PREFIX = "betese-game-doc-v1:";
const LAUNCH_URL_PREFIX = "betese-qtech-launch-v5:";
/** Demo URLs are reusable. */
const DEMO_LAUNCH_TTL_MS = 15 * 60 * 1000;
/**
 * Real-money launch URLs + wallet sessions are single-use at QTech.
 * Creating a second launch for the same play kills the first session and
 * shows Spribe's "You have been disconnected" screen.
 */
const REAL_HANDOFF_TTL_MS = 90_000;
const GAME_DOC_TTL_MS = 30 * 60 * 1000;

type LaunchCacheEntry = { url: string; at: number };
type GameDocEntry = { game: Game; at: number };

export type QTechPlayDevice = "mobile" | "desktop";

const inflightLaunches = new Map<string, Promise<string | null>>();
/** Survives React Strict Mode remounts (sessionStorage alone can be cleared too early). */
const realMemoryHandoff = new Map<string, LaunchCacheEntry>();

export function qtechPlayDevice(): QTechPlayDevice {
  if (typeof window === "undefined") return "mobile";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.matchMedia("(max-width: 900px)").matches;
  return coarse || narrow ? "mobile" : "desktop";
}

function launchKey(gameId: string, demo: boolean, device: QTechPlayDevice): string {
  return `${LAUNCH_URL_PREFIX}${resolveLobbyGameId(gameId)}:${demo ? "demo" : "real"}:${device}`;
}

function readRealHandoff(key: string): string | null {
  const mem = realMemoryHandoff.get(key);
  if (mem?.url && Date.now() - mem.at <= REAL_HANDOFF_TTL_MS) return mem.url;
  if (mem) realMemoryHandoff.delete(key);

  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as LaunchCacheEntry;
    if (!entry?.url || Date.now() - entry.at > REAL_HANDOFF_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    realMemoryHandoff.set(key, entry);
    return entry.url;
  } catch {
    return null;
  }
}

export function readCachedQTechLaunchUrl(
  gameId: string,
  demo: boolean,
  device: QTechPlayDevice,
): string | null {
  const id = resolveLobbyGameId(gameId);
  const key = launchKey(id, demo, device);

  if (!demo) return readRealHandoff(key);

  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as LaunchCacheEntry;
    if (!entry?.url || Date.now() - entry.at > DEMO_LAUNCH_TTL_MS) return null;
    return entry.url;
  } catch {
    return null;
  }
}

export function writeCachedQTechLaunchUrl(
  gameId: string,
  demo: boolean,
  url: string,
  device: QTechPlayDevice,
): void {
  const id = resolveLobbyGameId(gameId);
  const key = launchKey(id, demo, device);
  const entry: LaunchCacheEntry = { url, at: Date.now() };

  if (!demo) {
    realMemoryHandoff.set(key, entry);
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(key, JSON.stringify(entry));
      } catch {
        /* ignore */
      }
    }
    return;
  }

  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* quota — ignore */
  }
}

export function clearCachedQTechLaunchUrl(
  gameId: string,
  demo: boolean,
  device: QTechPlayDevice,
): void {
  const id = resolveLobbyGameId(gameId);
  const key = launchKey(id, demo, device);
  if (!demo) realMemoryHandoff.delete(key);
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(key);
    if (demo) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export async function prefetchQTechLaunch(opts: {
  gameId: string;
  demo: boolean;
  device: QTechPlayDevice;
  force?: boolean;
}): Promise<string | null> {
  const gameId = resolveLobbyGameId(opts.gameId);
  const { demo, device, force = false } = opts;
  const key = launchKey(gameId, demo, device);

  if (!force) {
    const cached = readCachedQTechLaunchUrl(gameId, demo, device);
    if (cached) return cached;
    const inflight = inflightLaunches.get(key);
    if (inflight) return inflight;
  } else {
    clearCachedQTechLaunchUrl(gameId, demo, device);
  }

  const promise = (async () => {
    try {
      let launchUrl: string;
      if (demo) {
        try {
          launchUrl = await fetchDemoLaunchUrlHttp(gameId, device);
        } catch {
          const res = await launchQTechGameDemo({ gameId, device });
          launchUrl = res.launchUrl;
        }
      } else {
        const res = await launchQTechGame({ gameId, device });
        launchUrl = res.launchUrl;
      }
      writeCachedQTechLaunchUrl(gameId, demo, launchUrl, device);
      return launchUrl;
    } finally {
      inflightLaunches.delete(key);
    }
  })();

  inflightLaunches.set(key, promise);
  return promise;
}

/** Prefetch demo launch URLs for visible lobby tiles (runs in background). */
export function warmDemoLaunches(gameIds: string[], device: QTechPlayDevice = qtechPlayDevice()): void {
  for (const gameId of gameIds.slice(0, 6)) {
    const id = resolveLobbyGameId(gameId);
    if (readCachedQTechLaunchUrl(id, true, device)) continue;
    void prefetchQTechLaunch({ gameId: id, demo: true, device });
  }
}

export function cacheGameDoc(game: Game): void {
  if (typeof window === "undefined") return;
  try {
    const entry: GameDocEntry = { game, at: Date.now() };
    localStorage.setItem(`${GAME_DOC_PREFIX}${game.id}`, JSON.stringify(entry));
  } catch {
    /* quota — ignore */
  }
}

export function readCachedGameDoc(gameId: string): Game | null {
  if (typeof window === "undefined") return null;
  try {
    const id = resolveLobbyGameId(gameId);
    const raw = localStorage.getItem(`${GAME_DOC_PREFIX}${id}`);
    if (!raw) return null;
    const entry = JSON.parse(raw) as GameDocEntry;
    if (!entry?.game || Date.now() - entry.at > GAME_DOC_TTL_MS) return null;
    return entry.game;
  } catch {
    return null;
  }
}

/** Hint browser to open connections to QTech game hosts early. */
export function preconnectQTechGameHosts(): void {
  if (typeof document === "undefined") return;
  for (const href of [
    "https://client.int.qtlauncher.com",
    "https://gl-int.qtplatform.com",
    "https://ps-int.qtplatform.com",
    "https://api-int.qtplatform.com",
  ]) {
    if (document.querySelector(`link[rel="preconnect"][href="${href}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = href;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }
}

/** Warm Firebase callable SDK on play routes (real-money launch). */
export function warmLaunchCallableClient(): void {
  if (typeof window === "undefined") return;
  void import("@/lib/api").catch(() => undefined);
}
