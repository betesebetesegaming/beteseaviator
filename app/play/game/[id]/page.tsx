"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { fetchGame } from "@/lib/games/api";
import { useAuth } from "@/lib/auth-context";
import type { Game } from "@/lib/types";
import { CrashGameView } from "@/components/games/CrashGameView";
import { Spinner } from "@/components/ui";

export default function GamePage() {
  const params = useParams<{ id: string }>();
  const gameId = params.id;
  const { profile } = useAuth();
  const [game, setGame] = useState<Game | null>(null);

  const isPlayer = !!profile && profile.role === "player" && profile.status === "active";

  useEffect(() => {
    fetchGame(gameId).then(setGame);
  }, [gameId]);

  if (!game) return <Spinner label="Loading game…" />;

  return (
    <div>
      {!isPlayer && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <Eye size={16} className="shrink-0" />
          <span>
            You&apos;re watching in <strong>demo mode</strong> — rounds are live. Sign up when
            you&apos;re ready to bet with real GMD.
          </span>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/play"
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft size={16} /> All games
        </Link>
        <h1 className="font-semibold">{game.name}</h1>
        <span className="text-xs text-slate-500">RTP {Number(game.rtp).toFixed(0)}%</span>
      </div>

      {game.type === "crash" ? (
        <CrashGameView game={game} />
      ) : (
        <p className="rounded-xl border border-white/10 bg-slate-900/70 p-6 text-center text-slate-400">
          {game.type} games are coming soon. Check back later.
        </p>
      )}
    </div>
  );
}
