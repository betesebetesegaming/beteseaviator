"use client";

import { useEffect, useMemo, useState } from "react";
import { Gamepad2, LayoutGrid, Plane, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { subscribeActiveGames } from "@/lib/games/api";
import {
  filterGamesByCategory,
  type GameCategory,
} from "@/lib/games/lobbyMeta";
import type { Game } from "@/lib/types";
import { EmptyState, Spinner } from "@/components/ui";
import { DemoAccountsPanel } from "./DemoAccountsPanel";
import { GameLobbyCard } from "./GameLobbyCard";

const CATEGORIES: { id: GameCategory; label: string; icon: typeof Plane }[] = [
  { id: "all", label: "All games", icon: LayoutGrid },
  { id: "crash", label: "Crash", icon: Plane },
  { id: "slots", label: "Slots", icon: Sparkles },
];

export function GameLobby() {
  const { profile } = useAuth();
  const isPlayer = profile?.role === "player";
  const [games, setGames] = useState<Game[] | null>(null);
  const [category, setCategory] = useState<GameCategory>("all");

  useEffect(() => subscribeActiveGames(setGames), []);

  const filtered = useMemo(
    () => (games ? filterGamesByCategory(games, category) : []),
    [games, category]
  );

  const counts = useMemo(() => {
    if (!games) return { all: 0, crash: 0, slots: 0 };
    return {
      all: games.length,
      crash: games.filter((g) => g.type === "crash").length,
      slots: games.filter((g) => g.type === "slots").length,
    };
  }, [games]);

  if (!games) return <Spinner label="Loading game lobby…" />;

  return (
    <div className="space-y-8">
      {/* hero */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-black px-6 py-8 sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 h-48 w-48 rounded-full bg-red-500/10 blur-3xl" />
        <div className="relative max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-emerald-300">
            <Gamepad2 size={14} />
            Betese game lobby
          </p>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Choose your game
          </h1>
          <p className="mt-3 text-base text-slate-400 sm:text-lg">
            Every table runs live on one platform — tap a game box to enter, use{" "}
            <strong className="text-white">+ / −</strong> to set your stake, and cash out before
            the crash.
          </p>
        </div>
      </section>

      {/* category filters */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(({ id, label, icon: Icon }) => {
          const count = counts[id === "all" ? "all" : id];
          const active = category === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setCategory(id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
                active
                  ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-900/30"
                  : "border border-white/10 bg-slate-900/80 text-slate-300 hover:border-white/20 hover:text-white"
              }`}
            >
              <Icon size={16} />
              {label}
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] ${
                  active ? "bg-black/20 text-slate-950" : "bg-slate-800 text-slate-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* game grid */}
      {filtered.length === 0 ? (
        <EmptyState
          message={
            category === "all"
              ? "No games available right now. Run /setup to seed games."
              : `No ${category} games yet — check back soon.`
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((game) => (
            <GameLobbyCard key={game.id} game={game} />
          ))}
        </div>
      )}

      {/* demo panel for guests */}
      {!isPlayer && <DemoAccountsPanel />}
    </div>
  );
}
