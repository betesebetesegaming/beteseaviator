"use client";

import { launchQTechGame, launchQTechGameDemo } from "@/lib/api";
import type { Game } from "@/lib/types";

const GAME_DOC_PREFIX = "betese-game-doc-v1:";
const LAUNCH_URL_PREFIX = "betese-qtech-launch-v1:";
const LAUNCH_TTL_MS = 8 * 60 * 1000;
const DEMO_LAUNCH_TTL_MS = 15 * 60 * 1000;
const GAME_DOC_TTL_MS = 30 * 60 * 1000;

type LaunchCacheEntry = { url: string; at: number };
type GameDocEntry = { game: Game; at: number };

export type QTechPlayDevice = "mobile" | "desktop";

const inflightLaunches = new Map<string, Promise<string | null>>();

export function qtechPlayDevice(): QTechPlayDevice {
  if (typeof window === "undefined") return "mobile";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.matchMedia("(max-width: 900px)").matches;
  return coarse || narrow ? "mobile" : "desktop";
}

function launchKey(gameId: string, demo: boolean, device: QTechPlayDevice): string {
  return `${LAUNCH_URL_PREFIX}${gameId}:${demo ? "demo" : "real"}:${device}`;
}

function launchTtlMs(demo: boolean): number {
  return demo ? DEMO_LAUNCH_TTL_MS : LAUNCH_TTL_MS;
}

export function readCachedQTechLaunchUrl(
  gameId: string,
  demo: boolean,
  device: QTechPlayDevice,
): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(launchKey(gameId, demo, device));
    if (!raw) return null;
    const entry = JSON.parse(raw) as LaunchCacheEntry;
    if (!entry?.url || Date.now() - entry.at > launchTtlMs(demo)) return null;
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
  if (typeof window === "undefined") return;
  try {
    const entry: LaunchCacheEntry = { url, at: Date.now() };
    localStorage.setItem(launchKey(gameId, demo, device), JSON.stringify(entry));
  } catch {
    /* quota — ignore */
  }
}

export async function prefetchQTechLaunch(opts: {
  gameId: string;
  demo: boolean;
  device: QTechPlayDevice;
}): Promise<string | null> {
  const { gameId, demo, device } = opts;
  const key = launchKey(gameId, demo, device);
  const cached = readCachedQTechLaunchUrl(gameId, demo, device);
  if (cached) return cached;

  const inflight = inflightLaunches.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const res = demo
        ? await launchQTechGameDemo({ gameId, device })
        : await launchQTechGame({ gameId, device });
      writeCachedQTechLaunchUrl(gameId, demo, res.launchUrl, device);
      return res.launchUrl;
    } catch {
      return null;
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
    if (readCachedQTechLaunchUrl(gameId, true, device)) continue;
    void prefetchQTechLaunch({ gameId, demo: true, device });
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
    const raw = localStorage.getItem(`${GAME_DOC_PREFIX}${gameId}`);
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
