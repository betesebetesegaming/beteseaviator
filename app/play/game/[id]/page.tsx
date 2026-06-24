"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { subscribeGame } from "@/lib/games/api";
import { isPlayerLobbyGame } from "@/lib/games/catalog";
import { useAuth } from "@/lib/auth-context";
import type { Game } from "@/lib/types";
import { QTechGameView } from "@/components/games/QTechGameView";
import { Spinner } from "@/components/ui";

export default function GamePage() {
  const params = useParams<{ id: string }>();
  const gameId = params.id;
  const { profile, fbUser, loading } = useAuth();
  const [game, setGame] = useState<Game | null>(null);
  const [gameLoading, setGameLoading] = useState(true);

  const needsProfile = !!fbUser && !profile && !loading;
  const isPlayer = !!profile && profile.role === "player" && profile.status === "active";

  useEffect(() => {
    setGameLoading(true);
    const slow = window.setTimeout(() => setGameLoading(false), 10_000);
    const unsub = subscribeGame(gameId, (g) => {
      setGame(g);
      setGameLoading(false);
      window.clearTimeout(slow);
    });
    return () => {
      window.clearTimeout(slow);
      unsub();
    };
  }, [gameId]);

  if (gameLoading && !game) return <Spinner label="Loading game…" />;

  if (!game) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/70 p-8 text-center">
        <p className="text-slate-300">Could not load this game. Check your connection and try again.</p>
        <Link href="/play" className="mt-4 inline-block text-sm text-betese-yellow hover:underline">
          Back to Aviator &amp; Crash games
        </Link>
      </div>
    );
  }

  if (!isPlayerLobbyGame(game)) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/70 p-8 text-center">
        <p className="text-slate-300">This game is not available.</p>
        <Link href="/play" className="mt-4 inline-block text-sm text-betese-yellow hover:underline">
          Back to games
        </Link>
      </div>
    );
  }

  return (
    <div>
      {!isPlayer && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <Eye size={16} className="shrink-0" />
          <span>
            {needsProfile ? (
              <>
                You&apos;re signed in — <strong>complete your profile</strong> to bet with real GMD
                (use the &quot;Complete account&quot; button above).
              </>
            ) : (
              <>
                You&apos;re watching in <strong>demo mode</strong> — rounds are live. Sign up when
                you&apos;re ready to bet with real GMD.
              </>
            )}
          </span>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/play"
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft size={16} /> Games
        </Link>
        <h1 className="font-semibold">{game.name}</h1>
        <span className="text-xs text-slate-500">RTP {Number(game.rtp).toFixed(0)}%</span>
      </div>

      {game.engine === "qtech" ? (
        <QTechGameView game={game} />
      ) : null}
    </div>
  );
}
