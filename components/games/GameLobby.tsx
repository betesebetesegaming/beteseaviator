"use client";

import { useEffect, useState } from "react";
import { subscribeActiveGames } from "@/lib/games/subscriptions";
import type { Game } from "@/lib/types";
import { EmptyState, Spinner } from "@/components/ui";
import { GameLobbyCard } from "./GameLobbyCard";
import { PromoBannerCarousel } from "./PromoBannerCarousel";

export function GameLobby() {
  const [games, setGames] = useState<Game[] | null>(null);

  useEffect(() => subscribeActiveGames(setGames), []);

  if (!games) return <Spinner label="Loading games…" />;

  return (
    <div className="lobby-page -mx-4 space-y-5 px-4 pb-8 sm:-mx-0 sm:px-0">
      <PromoBannerCarousel />

      {games.length === 0 ? (
        <EmptyState message="No QTech games are live yet. Ask admin to add games with QTech catalog IDs." />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3.5 md:grid-cols-4 lg:grid-cols-5">
          {games.map((game) => (
            <GameLobbyCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}
