"use client";

import { useMemo } from "react";
import { Plane } from "lucide-react";
import { multiplierAt } from "@/lib/format";
import type { LiveRound } from "@/lib/types";
import type { CrashHistoryItem } from "@/lib/games/api";

type Props = {
  round: LiveRound | null;
  history: CrashHistoryItem[];
  serverNow: number;
  gameName?: string;
  demoMode?: boolean;
};

export function CrashGameBoard({ round, history, serverNow, gameName, demoMode }: Props) {
  const phase = round?.status ?? null;
  const flyingSeconds =
    round && phase === "flying" ? Math.max(0, (serverNow - round.phaseStart) / 1000) : 0;
  const liveMultiplier = round
    ? phase === "flying"
      ? multiplierAt(flyingSeconds, round.growthRate)
      : phase === "crashed"
        ? (round.crashPoint ?? 1)
        : 1
    : 1;

  const bettingSecondsLeft =
    round && phase === "betting" ? Math.max(0, (round.bettingEndsAt - serverNow) / 1000) : 0;

  const multiplierColor = useMemo(() => {
    if (phase === "crashed") return "text-red-500";
    if (liveMultiplier >= 3) return "text-emerald-400";
    if (liveMultiplier >= 2) return "text-yellow-400";
    return "text-white";
  }, [phase, liveMultiplier]);

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {history.map((h) => (
          <span
            key={h.roundId}
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              h.crashPoint >= 3
                ? "bg-emerald-500/15 text-emerald-300"
                : h.crashPoint >= 2
                  ? "bg-yellow-500/15 text-yellow-300"
                  : "bg-sky-500/15 text-sky-300"
            }`}
          >
            x{h.crashPoint.toFixed(2)}
          </span>
        ))}
      </div>

      <div className="relative flex h-72 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900 to-black sm:h-96">
        {demoMode && (
          <span className="absolute left-3 top-3 rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-200">
            Demo
          </span>
        )}
        {gameName && (
          <span className="absolute right-3 top-3 text-xs font-semibold text-slate-500">{gameName}</span>
        )}

        {!round ? (
          <p className="text-slate-400">Waiting for the next round…</p>
        ) : phase === "betting" ? (
          <div className="text-center">
            <p className="text-sm uppercase tracking-widest text-slate-400">Place your bets</p>
            <p className="mt-2 text-6xl font-black text-white tabular-nums">
              {bettingSecondsLeft.toFixed(1)}s
            </p>
            <p className="mt-2 text-xs text-slate-500">Round #{round.roundId.slice(-6)}</p>
          </div>
        ) : (
          <div className="text-center">
            {phase === "flying" && (
              <Plane
                className="mx-auto mb-3 animate-float text-emerald-400"
                size={48}
                style={{ transform: `translateY(-${Math.min(flyingSeconds * 6, 80)}px)` }}
              />
            )}
            <p className={`text-7xl font-black tabular-nums ${multiplierColor}`}>
              x{liveMultiplier.toFixed(2)}
            </p>
            {phase === "crashed" && (
              <p className="mt-3 text-lg font-bold uppercase tracking-widest text-red-500">Crashed!</p>
            )}
          </div>
        )}

        <p className="absolute bottom-3 right-4 text-[10px] text-slate-600">
          Provably fair · {round?.hash ? `${round.hash.slice(0, 16)}…` : ""}
        </p>
      </div>
    </div>
  );
}

export function useCrashLiveState(round: LiveRound | null, serverNow: number) {
  const phase = round?.status ?? null;
  const flyingSeconds =
    round && phase === "flying" ? Math.max(0, (serverNow - round.phaseStart) / 1000) : 0;
  const liveMultiplier = round
    ? phase === "flying"
      ? multiplierAt(flyingSeconds, round.growthRate)
      : phase === "crashed"
        ? (round.crashPoint ?? 1)
        : 1
    : 1;
  return { phase, flyingSeconds, liveMultiplier };
}
