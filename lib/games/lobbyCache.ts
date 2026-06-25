"use client";

const CACHE_KEY = "betese-lobby-games-v1";

export function readCachedLobbyGames<T>(): T[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCachedLobbyGames<T>(games: T[]): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(games));
  } catch {
    /* quota — ignore */
  }
}
