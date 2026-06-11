"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { onValue, ref } from "firebase/database";
import { Rocket, TrendingUp, Eye } from "lucide-react";
import { rtdb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { gamePlayPath, subscribeActiveGames } from "@/lib/games/api";
import { multiplierAt } from "@/lib/format";
import type { Game, LiveRound } from "@/lib/types";
import { Card, Spinner, EmptyState, Badge } from "@/components/ui";

function GameLobbyCard({ game }: { game: Game }) {
  const [round, setRound] = useState<LiveRound | null>(null);

  useEffect(() => {
    return onValue(ref(rtdb, `rounds/${game.id}/current`), (snap) => {
      setRound(snap.val());
    });
  }, [game.id]);

  const liveLabel = (() => {
    if (!round) return "Starting…";
    if (round.status === "betting") return "Betting open";
    if (round.status === "flying") {
      const sec = Math.max(0, (Date.now() - round.phaseStart) / 1000);
      return `Flying x${multiplierAt(sec, round.growthRate).toFixed(2)}`;
    }
    return `Crashed x${(round.crashPoint ?? 1).toFixed(2)}`;
  })();

  return (
    <Card className="group transition-colors hover:border-emerald-500/40">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
          <Rocket size={22} />
        </div>
        <Badge value={game.type} />
      </div>
      <h2 className="text-lg font-semibold">{game.name}</h2>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
        <TrendingUp size={13} />
        RTP {Number(game.rtp).toFixed(0)}% · up to x{game.settings?.maxMultiplier ?? 100}
      </p>
      <p className="mt-2 inline-flex rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
        {liveLabel}
      </p>
      <Link
        href={gamePlayPath(game)}
        className="mt-4 block rounded-lg bg-emerald-500 py-2.5 text-center text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-400"
      >
        Play now
      </Link>
    </Card>
  );
}

export default function LobbyPage() {
  const { profile } = useAuth();
  const isPlayer = profile?.role === "player";
  const [games, setGames] = useState<Game[] | null>(null);

  useEffect(() => subscribeActiveGames(setGames), []);

  if (!games) return <Spinner label="Loading games…" />;

  return (
    <div>
      {!isPlayer && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <Eye size={16} className="shrink-0" />
          Browse and watch live rounds for free. Create an account when you want to bet with real
          GMD.
        </div>
      )}
      <h1 className="mb-1 text-xl font-bold">Game Lobby</h1>
      <p className="mb-6 text-sm text-slate-400">
        All games connect through one live API — pick a table and cash out before the crash.
      </p>

      {games.length === 0 ? (
        <EmptyState message="No games available right now. Check back soon!" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <GameLobbyCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}
