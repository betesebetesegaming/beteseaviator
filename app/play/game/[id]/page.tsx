"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { subscribeGame } from "@/lib/games/api";
import { isPlayerLobbyGame } from "@/lib/games/catalog";
import type { Game } from "@/lib/types";
import { QTechGameView } from "@/components/games/QTechGameView";
import { Spinner } from "@/components/ui";

function GamePageContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const gameId = params.id;
  const isDemo = searchParams.get("mode") === "demo";
  const [game, setGame] = useState<Game | null>(null);
  const [gameLoading, setGameLoading] = useState(true);

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
          Back to games
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
    <div className="flex min-h-0 flex-1 flex-col">
      {game.engine === "qtech" ? (
        <QTechGameView game={game} immersive demo={isDemo} />
      ) : null}
    </div>
  );
}

export default function GamePage() {
  return (
    <Suspense fallback={<Spinner label="Loading game…" />}>
      <GamePageContent />
    </Suspense>
  );
}
