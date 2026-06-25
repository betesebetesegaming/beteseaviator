"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { gamePlayPath } from "@/lib/games/paths";
import { gameLobbyImageUrl } from "@/lib/games/lobbyImages";
import { getGameLobbyVisual } from "@/lib/games/lobbyMeta";
import type { Game } from "@/lib/types";

export function GameLobbyCard({ game }: { game: Game }) {
  const visual = getGameLobbyVisual(game);
  const imageUrl = gameLobbyImageUrl(game);
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !imgFailed;

  return (
    <Link
      href={gamePlayPath(game)}
      className="group block overflow-hidden rounded-2xl bg-[#141414] shadow-lg shadow-black/20 ring-1 ring-white/8 transition-all hover:-translate-y-1 hover:shadow-xl hover:ring-[color-mix(in_srgb,var(--lobby-accent)_45%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lobby-accent)]"
    >
      <div
        className={`relative aspect-[4/3] overflow-hidden ${showImage ? "bg-black" : `bg-gradient-to-br ${visual.gradient}`}`}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={game.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,0,0.12),transparent_55%)]" />
            <Sparkles
              className={`absolute bottom-3 right-3 h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem] ${visual.accent} opacity-90 drop-shadow-lg transition-transform duration-300 group-hover:scale-110`}
              strokeWidth={1.25}
            />
          </>
        )}
        <span className="absolute left-2 top-2 rounded-md bg-violet-600 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow-sm">
          QTech
        </span>
      </div>

      <div className="space-y-0.5 border-t border-white/5 px-3 py-2.5">
        <p className="truncate text-sm font-bold text-white group-hover:text-[var(--lobby-accent)]">
          {game.name}
        </p>
      </div>
    </Link>
  );
};
