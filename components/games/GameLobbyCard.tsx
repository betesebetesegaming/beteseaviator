"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { onValue, ref } from "firebase/database";
import {
  ChevronRight,
  Plane,
  Rocket,
  Sparkles,
  Dices,
  Users,
  Zap,
} from "lucide-react";
import { rtdb } from "@/lib/firebase";
import { gamePlayPath } from "@/lib/games/api";
import { getGameLobbyVisual } from "@/lib/games/lobbyMeta";
import { multiplierAt } from "@/lib/format";
import type { Game, LiveRound } from "@/lib/types";

const ICONS = {
  plane: Plane,
  rocket: Rocket,
  slots: Sparkles,
  dice: Dices,
} as const;

function LiveRoundBadge({ round }: { round: LiveRound | null }) {
  if (!round) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/90 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-500" />
        Starting…
      </span>
    );
  }

  if (round.status === "betting") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-300 ring-1 ring-emerald-500/30">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
        Betting open
      </span>
    );
  }

  if (round.status === "flying") {
    const sec = Math.max(0, (Date.now() - round.phaseStart) / 1000);
    const mult = multiplierAt(sec, round.growthRate);
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/20 px-2.5 py-1 text-[11px] font-bold text-sky-300 ring-1 ring-sky-500/30">
        <Zap size={12} className="animate-pulse" />
        Live x{mult.toFixed(2)}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold text-red-300">
      Crashed x{(round.crashPoint ?? 1).toFixed(2)}
    </span>
  );
}

export function GameLobbyCard({ game }: { game: Game }) {
  const visual = getGameLobbyVisual(game);
  const Icon = ICONS[visual.icon] ?? Plane;
  const [round, setRound] = useState<LiveRound | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    return onValue(ref(rtdb, `rounds/${game.id}/current`), (snap) => {
      setRound(snap.val());
    });
  }, [game.id]);

  useEffect(() => {
    if (round?.status !== "flying") return;
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [round?.status]);

  const maxMult = game.settings?.maxMultiplier ?? 100;

  return (
    <Link
      href={gamePlayPath(game)}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 shadow-xl shadow-black/30 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-500/50 hover:shadow-emerald-900/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
    >
      {/* artwork */}
      <div className={`relative h-40 overflow-hidden bg-gradient-to-br ${visual.gradient}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_55%)]" />
        <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/5 blur-2xl transition-transform duration-500 group-hover:scale-110" />
        <Icon
          className={`absolute bottom-4 right-4 h-16 w-16 ${visual.accent} opacity-90 transition-transform duration-500 group-hover:scale-110 group-hover:-translate-y-1`}
          strokeWidth={1.5}
        />
        <div className="absolute left-4 top-4">
          <LiveRoundBadge round={round} />
        </div>
        <span className="absolute bottom-4 left-4 rounded-md bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/80 backdrop-blur-sm">
          {game.type}
        </span>
      </div>

      {/* body */}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-white group-hover:text-emerald-300 transition-colors">
              {game.name}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">{visual.tagline}</p>
          </div>
          <span className="shrink-0 rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-bold uppercase text-slate-400">
            {game.provider}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-950/60 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">RTP</p>
            <p className="text-sm font-bold text-emerald-400">{Number(game.rtp).toFixed(0)}%</p>
          </div>
          <div className="rounded-xl bg-slate-950/60 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Max</p>
            <p className="text-sm font-bold text-white">x{maxMult}</p>
          </div>
          <div className="rounded-xl bg-slate-950/60 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Players</p>
            <p className="text-sm font-bold text-slate-200">
              <Users size={14} className="mx-auto" />
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-emerald-500/10 px-3 py-2.5 ring-1 ring-emerald-500/20 transition-colors group-hover:bg-emerald-500/20">
          <span className="text-sm font-bold text-emerald-300">Play now</span>
          <ChevronRight
            size={18}
            className="text-emerald-400 transition-transform group-hover:translate-x-0.5"
          />
        </div>
      </div>
    </Link>
  );
}
