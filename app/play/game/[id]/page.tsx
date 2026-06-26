"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { subscribeGame, fetchGame } from "@/lib/games/api";
import { readCachedGameDoc } from "@/lib/games/qtechLaunchCache";
import { isPlayerLobbyGame } from "@/lib/games/catalog";
import type { Game } from "@/lib/types";
import { QTechGameView } from "@/components/games/QTechGameView";
import { Spinner } from "@/components/ui";

function GamePageContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const gameId = params.id;
  const isDemo = searchParams.get("mode") === "demo";
  const [game, setGame] = useState<Game | null>(() => readCachedGameDoc(gameId));
  const [gameLoading, setGameLoading] = useState(() => !readCachedGameDoc(gameId));

  useEffect(() => {
    let alive = true;
    setGameLoading((prev) => prev && !readCachedGameDoc(gameId));
    void fetchGame(gameId).then((g) => {
      if (!alive) return;
      if (g) setGame(g);
      setGameLoading(false);
    });
    const slow = window.setTimeout(() => {
      if (alive) setGameLoading(false);
    }, 10_000);
    const unsub = subscribeGame(gameId, (g) => {
      if (!alive) return;
      setGame(g);
      setGameLoading(false);
      window.clearTimeout(slow);
    });
    return () => {
      alive = false;
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
