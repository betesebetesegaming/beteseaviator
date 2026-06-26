"use client";

const CACHE_KEY = "betese-lobby-games-v2";
const TTL_MS = 10 * 60 * 1000; // 10 minutes

type CacheEntry<T> = { games: T[]; at: number };

export function readCachedLobbyGames<T>(): T[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (!Array.isArray(entry?.games) || entry.games.length === 0) return null;
    if (Date.now() - entry.at > TTL_MS) return null;
    return entry.games;
  } catch {
    return null;
  }
}

export function writeCachedLobbyGames<T>(games: T[]): void {
  if (typeof window === "undefined") return;
  try {
    const entry: CacheEntry<T> = { games, at: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* quota — ignore */
  }
}
