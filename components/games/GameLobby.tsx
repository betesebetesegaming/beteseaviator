"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeActiveGames } from "@/lib/games/subscriptions";
import type { Game } from "@/lib/types";
import { EmptyState, Spinner } from "@/components/ui";
import { GameLobbyCard } from "./GameLobbyCard";
import { PromoBannerCarousel } from "./PromoBannerCarousel";
import { LobbyCategoryNav } from "./LobbyCategoryNav";
import { LOBBY_NAV, type LobbyNavCategory } from "@/lib/games/promotions";

type LobbySection = {
  id: LobbyNavCategory;
  label: string;
  games: Game[];
};

function lobbyCategoryOf(game: Game): Exclude<LobbyNavCategory, "all"> {
  if (game.lobbyCategory === "aviator" || game.lobbyCategory === "crash" || game.lobbyCategory === "instantwin") {
    return game.lobbyCategory;
  }
  if (game.name.toLowerCase().includes("aviator")) return "aviator";
  if (game.type === "crash") return "crash";
  return "instantwin";
}

function buildLobbySections(games: Game[]): LobbySection[] {
  const byCategory: Record<Exclude<LobbyNavCategory, "all">, Game[]> = {
    aviator: [],
    crash: [],
    instantwin: [],
  };

  for (const game of games) {
    byCategory[lobbyCategoryOf(game)].push(game);
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
      {games.map((game) => (
        <GameLobbyCard key={game.id} game={game} />
      ))}
    </div>
  );
}

export function GameLobby() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [category, setCategory] = useState<LobbyNavCategory>("all");

  useEffect(() => subscribeActiveGames(setGames), []);

  const counts = useMemo(() => {
    if (!games) return {};
    const next: Partial<Record<LobbyNavCategory, number>> = { all: games.length };
    for (const game of games) {
      const cat = lobbyCategoryOf(game);
      next[cat] = (next[cat] ?? 0) + 1;
    }
    return next;
  }, [games]);

  const sections = useMemo(() => (games ? buildLobbySections(games) : []), [games]);

  const filteredGames = useMemo(() => {
    if (!games) return [];
    if (category === "all") return games;
    return games.filter((game) => lobbyCategoryOf(game) === category);
  }, [games, category]);

  if (!games) return <Spinner label="Loading games…" />;

  return (
    <div className="lobby-page -mx-4 space-y-4 px-4 pb-8 sm:-mx-0 sm:space-y-5 sm:px-0">
      <PromoBannerCarousel />

      <LobbyCategoryNav active={category} onChange={setCategory} counts={counts} />

      {games.length === 0 ? (
        <EmptyState message="No QTech games are live yet. Ask admin to add games with QTech catalog IDs." />
      ) : category === "all" ? (
        <div className="space-y-5">
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
