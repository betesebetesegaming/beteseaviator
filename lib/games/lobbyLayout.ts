import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firestore";
import type { Game } from "@/lib/types";

export type LobbySortMode = "manual" | "best_selling";

/** Stored at settings/lobbyLayout — managed from admin → Lobby order. */
export type LobbyLayoutSettings = {
  /** Pinned at the top of /play in this order. */
  featuredGameIds: string[];
  /** Full manual order for non-featured games (when sortMode is manual). */
  manualOrder: string[];
  sortMode: LobbySortMode;
  updatedAt?: string;
};

export const DEFAULT_LOBBY_LAYOUT: LobbyLayoutSettings = {
  featuredGameIds: [
    "qt-spb-aviator",
    "qt-spb-goal",
    "qt-gzx-pilotcup",
    "qt-tad-crashgoal",
    "qt-sms-footballx",
    "qt-sms-worldchampionx",
    "qt-sms-jetx",
    "qt-blc-crash",
    "qt-spb-balloon",
    "qt-sms-balloonx",
    "qt-sms-propelx",
    "qt-sms-cricketx",
    "qt-iog-chickenroad",
  ],
  manualOrder: [],
  sortMode: "best_selling",
};

const DOC_PATH = ["settings", "lobbyLayout"] as const;

export function subscribeLobbyLayout(
  onLayout: (layout: LobbyLayoutSettings | null) => void
): Unsubscribe {
  return onSnapshot(doc(db, ...DOC_PATH), (snap) => {
    if (!snap.exists()) {
      onLayout(null);
      return;
    }
    onLayout(normalizeLobbyLayout(snap.data() as Partial<LobbyLayoutSettings>));
  });
}

export function normalizeLobbyLayout(raw: Partial<LobbyLayoutSettings> | null): LobbyLayoutSettings {
  const sortMode = raw?.sortMode === "manual" ? "manual" : "best_selling";
  return {
    featuredGameIds: Array.isArray(raw?.featuredGameIds)
      ? raw!.featuredGameIds.map(String).filter(Boolean)
      : [],
    manualOrder: Array.isArray(raw?.manualOrder) ? raw!.manualOrder.map(String).filter(Boolean) : [],
    sortMode,
    updatedAt: raw?.updatedAt,
  };
}

export function lobbyLayoutOrDefault(layout: LobbyLayoutSettings | null): LobbyLayoutSettings {
  return layout ? normalizeLobbyLayout(layout) : DEFAULT_LOBBY_LAYOUT;
}

function manualRank(gameId: string, manualOrder: string[]): number {
  const idx = manualOrder.indexOf(gameId);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

function compareByBestSelling(a: Game, b: Game): number {
  const volDiff = (b.lobbyStats?.betVolume ?? 0) - (a.lobbyStats?.betVolume ?? 0);
  if (volDiff !== 0) return volDiff;
  const countDiff = (b.lobbyStats?.betCount ?? 0) - (a.lobbyStats?.betCount ?? 0);
  if (countDiff !== 0) return countDiff;
  return a.name.localeCompare(b.name);
}

function compareByManual(a: Game, b: Game, manualOrder: string[]): number {
  const rankDiff = manualRank(a.id, manualOrder) - manualRank(b.id, manualOrder);
  if (rankDiff !== 0) return rankDiff;
  return a.name.localeCompare(b.name);
}

/** Sort lobby games: featured first, then manual or best-selling order. */
export function sortLobbyGames(games: Game[], layout: LobbyLayoutSettings | null): Game[] {
  const cfg = lobbyLayoutOrDefault(layout);
  const featuredSet = new Set(cfg.featuredGameIds);

  const featured = cfg.featuredGameIds
    .map((id) => games.find((g) => g.id === id))
    .filter((g): g is Game => Boolean(g));

  const rest = games.filter((g) => !featuredSet.has(g.id));
  const sortedRest =
    cfg.sortMode === "manual"
      ? [...rest].sort((a, b) => compareByManual(a, b, cfg.manualOrder))
      : [...rest].sort(compareByBestSelling);

  return [...featured, ...sortedRest];
}

export function topPickGames(games: Game[], layout: LobbyLayoutSettings | null): Game[] {
  const cfg = lobbyLayoutOrDefault(layout);
  return cfg.featuredGameIds
    .map((id) => games.find((g) => g.id === id))
    .filter((g): g is Game => Boolean(g));
}

export function moveListItem<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const next = [...list];
  const target = index + direction;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
