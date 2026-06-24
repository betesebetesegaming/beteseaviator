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

function useLiveRound(gameId: string, enabled: boolean) {
  const [round, setRound] = useState<LiveRound | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setRound(null);
      return;
    }
    return onValue(ref(rtdb, `rounds/${gameId}/current`), (snap) => {
      setRound(snap.val());
    });
  }, [gameId, enabled]);

  useEffect(() => {
    if (!enabled || round?.status !== "flying") return;
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [enabled, round?.status]);

  return round;
}

export function GameLobbyCard({ game }: { game: Game }) {
  const isQTech = game.engine === "qtech";
  const visual = getGameLobbyVisual(game);
  const Icon = ICONS[visual.icon] ?? Plane;
  const round = useLiveRound(game.id, !isQTech);
  const imageUrl = gameLobbyImageUrl(game);
  const maxM = game.settings?.maxMultiplier ?? 100;
  const growth = game.settings?.growthRate ?? round?.growthRate ?? 0.06;

  const liveTag = (() => {
    if (isQTech) {
      return { label: "QTech", className: "bg-violet-600 text-white" };
    }
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
      className="group block overflow-hidden rounded-2xl bg-[#141414] shadow-lg shadow-black/20 ring-1 ring-white/8 transition-all hover:-translate-y-1 hover:shadow-xl hover:ring-[color-mix(in_srgb,var(--lobby-accent)_45%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lobby-accent)]"
    >
      <div className={`relative aspect-[4/3] overflow-hidden ${imageUrl ? "bg-black" : `bg-gradient-to-br ${visual.gradient}`}`}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={game.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
          />
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,0,0.12),transparent_55%)]" />
            <Icon
              className={`absolute bottom-3 right-3 h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem] ${visual.accent} opacity-90 drop-shadow-lg transition-transform duration-300 group-hover:scale-110`}
              strokeWidth={1.25}
            />
          </>
        )}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-2">
          {liveTag ? (
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide shadow-sm ${liveTag.className}`}
            >
              {liveTag.label}
            </span>
          ) : (
            <span />
          )}
          <span className="rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-200 backdrop-blur-sm">
            {isQTech ? "QTech" : game.provider}
          </span>
        </div>
        {!isQTech && maxM > 0 && (
          <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 backdrop-blur-sm">
            up to x{maxM}
          </span>
        )}
      </div>

      <div className="space-y-0.5 border-t border-white/5 px-3 py-2.5">
        <p className="truncate text-sm font-bold text-white group-hover:text-[var(--lobby-accent)]">
          {game.name}
        </p>
        <p className="truncate text-[11px] text-slate-500">{visual.tagline}</p>
      </div>
    </Link>
  );
}
