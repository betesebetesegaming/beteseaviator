"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { subscribeActiveGames } from "@/lib/games/subscriptions";
import { writeCachedLobbyGames } from "@/lib/games/lobbyCache";
import {
  lobbyLayoutOrDefault,
  sortLobbyGames,
  subscribeLobbyLayout,
  topPickGames,
  type LobbyLayoutSettings,
} from "@/lib/games/lobbyLayout";
import { warmDemoLaunches } from "@/lib/games/qtechLaunchCache";
import { LobbyGameSkeleton } from "@/components/games/LobbyGameSkeleton";
import type { Game } from "@/lib/types";
import { EmptyState } from "@/components/ui";
import { GameLobbyCard } from "./GameLobbyCard";
import { LobbyCategoryNav } from "./LobbyCategoryNav";
import { LOBBY_NAV, type LobbyNavCategory } from "@/lib/games/promotions";

const PromoBannerCarousel = dynamic(
  () => import("./PromoBannerCarousel").then((m) => ({ default: m.PromoBannerCarousel })),
  { ssr: false, loading: () => <div className="h-36 animate-pulse rounded-2xl bg-white/5 sm:h-44" /> },
);

type LobbySection = {
  id: LobbyNavCategory;
  label: string;
  games: Game[];
};

function lobbyCategoryOf(game: Game): Exclude<LobbyNavCategory, "all"> {
  if (game.lobbyCategory === "aviator" || game.lobbyCategory === "crash" || game.lobbyCategory === "instantwin") {
    return game.lobbyCategory;
  }

  if (game.type === "crash") return "crash";
  return "instantwin";
}

function buildLobbySections(games: Game[], layout: LobbyLayoutSettings | null): LobbySection[] {
  const cfg = lobbyLayoutOrDefault(layout);
  const featuredSet = new Set(cfg.featuredGameIds);

  const byCategory: Record<Exclude<LobbyNavCategory, "all">, Game[]> = {
    aviator: [],
    crash: [],
    instantwin: [],
  };

  for (const game of games) {
    if (featuredSet.has(game.id)) continue;
    byCategory[lobbyCategoryOf(game)].push(game);
  }

  for (const key of Object.keys(byCategory) as Array<Exclude<LobbyNavCategory, "all">>) {
    byCategory[key] = sortLobbyGames(byCategory[key], {
      ...cfg,
      featuredGameIds: [],
    });
  }

  return LOBBY_NAV.filter((item) => item.id !== "all" && item.available)
    .map((item) => ({
      id: item.id,
      label: item.label,
      games: byCategory[item.id as Exclude<LobbyNavCategory, "all">] ?? [],
    }))
    .filter((section) => section.games.length > 0);
}

function GameGrid({ games }: { games: Game[] }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5 md:grid-cols-5 lg:grid-cols-6">
      {games.map((game, index) => (
        <GameLobbyCard key={game.id} game={game} priority={index < 9} />
      ))}
    </div>
  );
}

export function GameLobby() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [liveReady, setLiveReady] = useState(false);
  const [layout, setLayout] = useState<LobbyLayoutSettings | null>(null);
  const [category, setCategory] = useState<LobbyNavCategory>("all");

  useEffect(() => {
    return subscribeActiveGames((next) => {
      setGames(next);
      setLiveReady(true);
      writeCachedLobbyGames(next);
    });
  }, []);

  useEffect(() => subscribeLobbyLayout(setLayout), []);

  useEffect(() => {
    if (!games?.length) return;
    const ordered = sortLobbyGames(games, layout);
    const picks = topPickGames(games, layout).map((g) => g.id);
    const warmIds = picks.length ? picks : ordered.slice(0, 4).map((g) => g.id);
    warmDemoLaunches(warmIds);
  }, [games, layout]);

  const orderedGames = useMemo(
    () => (games ? sortLobbyGames(games, layout) : []),
    [games, layout]
  );

  const topPicks = useMemo(
    () => (games ? topPickGames(games, layout) : []),
    [games, layout]
  );

  const counts = useMemo(() => {
    if (!games) return {};
    const next: Partial<Record<LobbyNavCategory, number>> = { all: games.length };
    for (const game of games) {
      const cat = lobbyCategoryOf(game);
      next[cat] = (next[cat] ?? 0) + 1;
    }
    return next;
  }, [games]);

  const sections = useMemo(
    () => (games ? buildLobbySections(games, layout) : []),
    [games, layout]
  );

  const filteredGames = useMemo(() => {
    if (!orderedGames.length) return [];
    if (category === "all") return orderedGames;
    return sortLobbyGames(
      orderedGames.filter((game) => lobbyCategoryOf(game) === category),
      layout
    );
  }, [orderedGames, category, layout]);

  const showSkeleton = !liveReady;

  return (
    <div className="lobby-page -mx-4 space-y-4 px-4 pb-8 sm:-mx-0 sm:space-y-5 sm:px-0">
      <PromoBannerCarousel />

      <LobbyCategoryNav active={category} onChange={setCategory} counts={counts} />

      {showSkeleton ? (
        <LobbyGameSkeleton />
      ) : !games || games.length === 0 ? (
        <EmptyState message="No games are live yet. Check back soon." />
      ) : category === "all" ? (
        <div className="space-y-5">
          {topPicks.length > 0 ? (
            <section>
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-white sm:text-base">Top picks</h2>
              </div>
              <GameGrid games={topPicks} />
            </section>
          ) : null}
          {sections.map((section) => (
            <section key={section.id}>
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-white sm:text-base">{section.label}</h2>
                <button
                  type="button"
                  onClick={() => setCategory(section.id)}
                  className="shrink-0 rounded-lg bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-slate-400 transition-colors hover:bg-white/10 hover:text-white sm:text-xs"
                >
                  All games ›
                </button>
              </div>
              <GameGrid games={section.games} />
            </section>
          ))}
        </div>
      ) : (
        <section>
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-white sm:text-base">
              {LOBBY_NAV.find((item) => item.id === category)?.label ?? "Games"}
            </h2>
            <span className="text-[10px] font-semibold text-slate-500 sm:text-xs">
              {filteredGames.length} games
            </span>
          </div>
          <GameGrid games={filteredGames} />
        </section>
      )}
    </div>
  );
}
