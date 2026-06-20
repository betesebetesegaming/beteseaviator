"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { onValue, ref } from "firebase/database";
import { Plane, Rocket, Sparkles, Dices } from "lucide-react";
import { rtdb } from "@/lib/rtdb";
import { gamePlayPath } from "@/lib/games/paths";
import { gameLobbyImageUrl } from "@/lib/games/lobbyImages";
import { getGameLobbyVisual } from "@/lib/games/lobbyMeta";
import { liveCrashMultiplier } from "@/lib/format";
import type { Game, LiveRound } from "@/lib/types";

const ICONS = {
  plane: Plane,
  rocket: Rocket,
  slots: Sparkles,
  dice: Dices,
} as const;

function useLiveRound(gameId: string) {
  const [round, setRound] = useState<LiveRound | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    return onValue(ref(rtdb, `rounds/${gameId}/current`), (snap) => {
      setRound(snap.val());
    });
  }, [gameId]);

  useEffect(() => {
    if (round?.status !== "flying") return;
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [round?.status]);

  return round;
}

export function GameLobbyCard({ game }: { game: Game }) {
  const visual = getGameLobbyVisual(game);
  const Icon = ICONS[visual.icon] ?? Plane;
  const round = useLiveRound(game.id);
  const imageUrl = gameLobbyImageUrl(game);
  const maxM = game.settings?.maxMultiplier ?? 100;
  const growth = game.settings?.growthRate ?? round?.growthRate ?? 0.06;

  const liveTag = (() => {
    if (!round) return null;
    if (round.status === "betting") return { label: "LIVE", className: "bg-emerald-500 text-black" };
    if (round.status === "flying") {
      const elapsed = Math.max(0, (Date.now() - round.phaseStart) / 1000);
      const m = liveCrashMultiplier(elapsed, round.growthRate ?? growth, maxM);
      return {
        label: `x${m.toFixed(2)}`,
        className: "bg-sky-500 text-white",
      };
    }
    return null;
  })();

  return (
    <Link
      href={gamePlayPath(game)}
      className="group block overflow-hidden rounded-xl bg-[#1a1a1a] ring-1 ring-white/5 transition-all hover:-translate-y-0.5 hover:ring-[color-mix(in_srgb,var(--lobby-accent)_40%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lobby-accent)]"
    >
      <div className={`relative aspect-[4/3] overflow-hidden ${imageUrl ? "bg-black" : `bg-gradient-to-br ${visual.gradient}`}`}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={game.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,0,0.15),transparent_50%)]" />
            <Icon
              className={`absolute bottom-2 right-2 h-14 w-14 sm:h-16 sm:w-16 ${visual.accent} drop-shadow-lg transition-transform duration-300 group-hover:scale-110`}
              strokeWidth={1.25}
            />
          </>
        )}
        {liveTag && (
          <span
            className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${liveTag.className}`}
          >
            {liveTag.label}
          </span>
        )}
      </div>

      <div className="border-t border-white/5 bg-[#141414] px-2.5 py-2 sm:px-3 sm:py-2.5">
        <p className="truncate text-sm font-bold text-[var(--lobby-accent)] group-hover:brightness-125">
          {game.name}
        </p>
      </div>
    </Link>
  );
}
