"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { subscribeActiveGames } from "@/lib/games/api";
import {
  filterGamesByLobbyCategory,
  LOBBY_NAV,
  type LobbyNavCategory,
} from "@/lib/games/promotions";
import type { Game } from "@/lib/types";
import { EmptyState, Spinner } from "@/components/ui";
import { DemoAccountsPanel } from "./DemoAccountsPanel";
import { GameLobbyCard } from "./GameLobbyCard";
import { LobbyCategoryNav } from "./LobbyCategoryNav";
import { LobbySearchBar } from "./LobbySearchBar";
import { PromoBannerCarousel } from "./PromoBannerCarousel";

function searchGames(games: Game[], query: string): Game[] {
  const q = query.trim().toLowerCase();
  if (!q) return games;
  return games.filter(
    (g) =>
      g.name.toLowerCase().includes(q) ||
      g.provider.toLowerCase().includes(q) ||
      g.type.toLowerCase().includes(q) ||
      g.id.toLowerCase().includes(q)
  );
}

export function GameLobby() {
  const { profile } = useAuth();
  const isPlayer = profile?.role === "player";
  const [games, setGames] = useState<Game[] | null>(null);
  const [category, setCategory] = useState<LobbyNavCategory>("aviator");
  const [search, setSearch] = useState("");

  useEffect(() => subscribeActiveGames(setGames), []);

  const filtered = useMemo(() => {
    if (!games) return [];
    const byCat = filterGamesByLobbyCategory(games, category);
    return searchGames(byCat, search);
  }, [games, category, search]);

  const counts = useMemo(() => {
    if (!games) return {};
    return {
      aviator: games.filter((g) => g.id === "aviator").length,
      crash: games.filter((g) => g.type === "crash" && g.id !== "aviator").length,
    } as Partial<Record<LobbyNavCategory, number>>;
  }, [games]);

  const sectionTitle =
    LOBBY_NAV.find((n) => n.id === category)?.label ?? "Games";

  if (!games) return <Spinner label="Loading game lobby…" />;

  return (
    <div className="lobby-page -mx-4 space-y-5 px-4 pb-8 sm:-mx-0 sm:px-0">
      {/* top promo banner + scrolling ticker */}
      <PromoBannerCarousel />

      {/* search */}
      <LobbySearchBar value={search} onChange={setSearch} />

      {/* horizontal category icons */}
      <LobbyCategoryNav active={category} onChange={setCategory} counts={counts} />

      {/* section heading */}
      <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2">
        <h2 className="text-sm font-black uppercase tracking-widest text-betese-yellow">
          {sectionTitle}
        </h2>
        <span className="text-xs text-slate-500">{filtered.length} available</span>
      </div>

      {/* game tile grid — 2–5 columns like casino lobby */}
      {filtered.length === 0 ? (
        <EmptyState
          message={
            !LOBBY_NAV.find((n) => n.id === category)?.available
              ? `${sectionTitle} coming soon on BETESE.`
              : search
                ? `No games match "${search}".`
                : "No games in this category yet."
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((game) => (
            <GameLobbyCard key={game.id} game={game} />
          ))}
        </div>
      )}

      {/* demo accounts */}
      {!isPlayer && (
        <div id="demo-accounts" className="scroll-mt-24 pt-4">
          <DemoAccountsPanel />
        </div>
      )}
    </div>
  );
}
