"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { gamePlayPath } from "@/lib/games/paths";
import { gameLobbyImageUrl } from "@/lib/games/lobbyImages";
import { qtechCdnBannerImage } from "@/lib/games/qtechImages";
import { getGameLobbyVisual } from "@/lib/games/lobbyMeta";
import type { Game } from "@/lib/types";

export function GameLobbyCard({ game }: { game: Game }) {
  const visual = getGameLobbyVisual(game);
  const primaryUrl = gameLobbyImageUrl(game);
  const fallbackUrl = useMemo(() => {
    const id = String(game.qtechGameId ?? "").trim();
    return id ? qtechCdnBannerImage(id) : undefined;
  }, [game.qtechGameId]);

  const [src, setSrc] = useState(primaryUrl);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setSrc(primaryUrl);
    setImgFailed(false);
  }, [primaryUrl]);

  const showImage = Boolean(src) && !imgFailed;

  return (
    <Link
      href={gamePlayPath(game)}
      className="group block overflow-hidden rounded-2xl bg-[#141414] shadow-md shadow-black/30 ring-1 ring-white/6 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:ring-white/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lobby-accent)]"
    >
      <div
        className={`relative aspect-[3/4] overflow-hidden ${showImage ? "bg-[#1a1a1a]" : `bg-gradient-to-br ${visual.gradient}`}`}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={game.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            loading="lazy"
            onError={() => {
              if (fallbackUrl && src !== fallbackUrl) {
                setSrc(fallbackUrl);
                return;
              }
              setImgFailed(true);
            }}
          />
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,0,0.12),transparent_55%)]" />
            <Sparkles
              className={`absolute bottom-12 right-3 h-14 w-14 ${visual.accent} opacity-90 drop-shadow-lg`}
              strokeWidth={1.25}
            />
          </>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 px-2 pb-2.5 pt-8 text-center">
          <p className="truncate text-[11px] font-black uppercase leading-tight tracking-wide text-white sm:text-xs">
            {game.name}
          </p>
          <p className="mt-0.5 truncate text-[8px] font-semibold uppercase tracking-wider text-white/65 sm:text-[9px]">
            {game.provider}
          </p>
        </div>
      </div>
    </Link>
  );
}
