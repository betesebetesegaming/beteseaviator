"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Rocket, TrendingUp, Eye } from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import type { Game } from "@/lib/types";
import { Card, Spinner, EmptyState, Badge } from "@/components/ui";

export default function LobbyPage() {
  const { profile } = useAuth();
  const isPlayer = profile?.role === "player";
  const [games, setGames] = useState<Game[] | null>(null);

  useEffect(() => {
    const q = query(collection(db, "games"), where("status", "==", "active"));
    return onSnapshot(q, (snap) => {
      setGames(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Game));
    });
  }, []);

  if (!games) return <Spinner label="Loading games…" />;

  return (
    <div>
      {!isPlayer && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <Eye size={16} className="shrink-0" />
          Browse and watch live rounds for free. Create an account when you want to bet with real
          XOF.
        </div>
      )}
      <h1 className="mb-1 text-xl font-bold">Game Lobby</h1>
      <p className="mb-6 text-sm text-slate-400">Pick a game and cash out before the crash.</p>

      {games.length === 0 ? (
        <EmptyState message="No games available right now. Check back soon!" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <Card key={game.id} className="group transition-colors hover:border-emerald-500/40">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                  <Rocket size={22} />
                </div>
                <Badge value={game.type} />
              </div>
              <h2 className="text-lg font-semibold">{game.name}</h2>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                <TrendingUp size={13} />
                RTP {Number(game.rtp).toFixed(0)}% · up to x
                {game.settings?.maxMultiplier ?? 100}
              </p>
              <Link
                href={`/play/game/${game.id}`}
                className="mt-4 block rounded-lg bg-emerald-500 py-2 text-center text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400"
              >
                Play now
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
