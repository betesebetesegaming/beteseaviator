"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { collection, onSnapshot } from "firebase/firestore";
import { ArrowDown, ArrowUp, Plus, Search, Star, TrendingUp } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/firestore";
import { adminSaveLobbyLayout, errorMessage } from "@/lib/api";
import { filterLobbyGames } from "@/lib/games/catalog";
import { gameLobbyImageUrl } from "@/lib/games/lobbyImages";
import {
  lobbyLayoutOrDefault,
  moveListItem,
  subscribeLobbyLayout,
  type LobbyLayoutSettings,
  type LobbySortMode,
} from "@/lib/games/lobbyLayout";
import type { Game } from "@/lib/types";
import { Badge, Button, Card, Input } from "@/components/ui";

function formatVolume(value: number | undefined): string {
  const n = value ?? 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M GMD`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k GMD`;
  return `${n.toLocaleString()} GMD`;
}

function OrderRow({
  game,
  index,
  total,
  onMove,
  onRemove,
  badge,
}: {
  game: Game;
  index: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
  onRemove?: () => void;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2">
      <span className="w-6 shrink-0 text-center text-xs font-bold text-slate-500">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{game.name}</p>
        <p className="truncate text-[11px] text-slate-500">
          {game.lobbyCategory ?? "game"} · {formatVolume(game.lobbyStats?.betVolume)} wagered
        </p>
      </div>
      {badge ? (
        <span className="shrink-0 rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
          {badge}
        </span>
      ) : null}
      <Badge value={game.status} />
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          className="rounded bg-slate-800 p-1.5 text-slate-300 hover:text-white disabled:opacity-30"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          aria-label="Move up"
        >
          <ArrowUp size={14} />
        </button>
        <button
          type="button"
          className="rounded bg-slate-800 p-1.5 text-slate-300 hover:text-white disabled:opacity-30"
          disabled={index >= total - 1}
          onClick={() => onMove(1)}
          aria-label="Move down"
        >
          <ArrowDown size={14} />
        </button>
        {onRemove ? (
          <button
            type="button"
            className="rounded bg-slate-800 px-2 py-1 text-[10px] text-rose-300 hover:text-rose-200"
            onClick={onRemove}
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}

function GamePickTile({
  game,
  pinned,
  onPin,
}: {
  game: Game;
  pinned: boolean;
  onPin: () => void;
}) {
  const imageUrl = gameLobbyImageUrl(game);

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border bg-slate-950/60 ${
        pinned ? "border-amber-500/40 ring-1 ring-amber-500/20" : "border-white/10"
      }`}
    >
      <div className="relative aspect-[4/3] bg-black/40">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-slate-500">No image</div>
        )}
        {pinned ? (
          <span className="absolute left-2 top-2 rounded bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold uppercase text-black">
            Top pick
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <div>
          <p className="truncate text-sm font-semibold text-white">{game.name}</p>
          <p className="truncate text-[10px] text-slate-500">
            {game.lobbyCategory ?? "game"} · {game.status}
          </p>
        </div>
        <Button
          type="button"
          variant={pinned ? "secondary" : "primary"}
          className="mt-auto w-full px-2 py-1.5 text-xs"
          disabled={pinned}
          onClick={onPin}
        >
          {pinned ? "Already pinned" : (
            <>
              <Plus size={14} className="mr-1 inline" />
              Pin to top
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/** Admin UI: pin top games + sort lobby on /play. */
export function LobbyOrderEditor({ showPageHeader = false }: { showPageHeader?: boolean }) {
  const [games, setGames] = useState<Game[]>([]);
  const [savedLayout, setSavedLayout] = useState<LobbyLayoutSettings | null>(null);
  const [featuredIds, setFeaturedIds] = useState<string[]>([]);
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [sortMode, setSortMode] = useState<LobbySortMode>("best_selling");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeLobbyLayout(setSavedLayout), []);

  useEffect(() => {
    return onSnapshot(collection(db, "games"), (snap) => {
      const rows = filterLobbyGames(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Game)).sort(
        (a, b) => a.name.localeCompare(b.name)
      );
      setGames(rows);
    });
  }, []);

  useEffect(() => {
    const cfg = lobbyLayoutOrDefault(savedLayout);
    setFeaturedIds(cfg.featuredGameIds);
    setSortMode(cfg.sortMode);
    const activeIds = games.filter((g) => g.status === "active").map((g) => g.id);
    const fromSaved = cfg.manualOrder.filter((id) => activeIds.includes(id));
    const missing = activeIds.filter((id) => !fromSaved.includes(id));
    setManualIds(fromSaved.length ? [...fromSaved, ...missing] : activeIds);
  }, [savedLayout, games]);

  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const featuredGames = featuredIds.map((id) => gameById.get(id)).filter((g): g is Game => Boolean(g));
  const manualGames = manualIds.map((id) => gameById.get(id)).filter((g): g is Game => Boolean(g));
  const activeGames = games.filter((g) => g.status === "active");
  const pickableGames = useMemo(() => {
    const q = search.trim().toLowerCase();
    return games.filter((g) => {
      if (!q) return true;
      return (
        g.name.toLowerCase().includes(q) ||
        g.id.toLowerCase().includes(q) ||
        String(g.lobbyCategory ?? "").includes(q)
      );
    });
  }, [games, search]);

  function pinFeatured(gameId: string) {
    if (featuredIds.includes(gameId)) {
      return toast.error("That game is already in Top picks.");
    }
    setFeaturedIds((rows) => [...rows, gameId]);
    setManualIds((rows) => rows.filter((rowId) => rowId !== gameId));
    toast.success("Added to Top picks — click Save lobby order when done.");
  }

  async function save() {
    setBusy(true);
    try {
      await adminSaveLobbyLayout({
        featuredGameIds: featuredIds,
        manualOrder: manualIds.filter((id) => !featuredIds.includes(id)),
        sortMode,
      });
      toast.success("Lobby order saved — players see it on /play immediately.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="lobby-order" className="space-y-5 scroll-mt-24">
      {showPageHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Lobby order</h1>
            <p className="mt-1 text-sm text-slate-400">
              Pin your top games at the top of <strong className="text-white">/play</strong>, then sort the rest
              manually or by best-selling (total bets).
            </p>
          </div>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save lobby order"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div>
            <p className="text-sm font-bold text-amber-100">Choose top games for /play</p>
            <p className="text-xs text-amber-100/75">Pin games below, then save. Scroll down for QTech setup.</p>
          </div>
          <Button onClick={() => void save()} disabled={busy} className="shrink-0">
            {busy ? "Saving…" : "Save lobby order"}
          </Button>
        </div>
      )}

      <Card>
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <Star size={16} className="text-amber-300" />
          Top picks — shown first on /play
        </h2>
        <p className="mb-4 text-sm text-slate-400">
          Tap <strong className="text-white">Pin to top</strong> on any game tile below. Use ↑ ↓ on pinned games to
          set order (first = leftmost on the lobby).
        </p>

        {featuredGames.length === 0 ? (
          <p className="mb-3 text-sm text-slate-500">No top picks yet — pin games from the grid below.</p>
        ) : (
          <div className="mb-4 space-y-2">
            {featuredGames.map((game, index) => (
              <OrderRow
                key={game.id}
                game={game}
                index={index}
                total={featuredGames.length}
                badge="Top"
                onMove={(dir) => setFeaturedIds((rows) => moveListItem(rows, index, dir))}
                onRemove={() => {
                  setFeaturedIds((rows) => rows.filter((id) => id !== game.id));
                  setManualIds((rows) => (rows.includes(game.id) ? rows : [...rows, game.id]));
                }}
              />
            ))}
          </div>
        )}

        <div className="mb-3">
          <Input
            label="Search games"
            placeholder="e.g. Aviator, JetX, Mines…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {games.length === 0 ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
            <p className="font-semibold">No games loaded yet.</p>
            <p className="mt-1 text-amber-100/80">
              Click <strong>Restore lobby games</strong> on this page first, then pin your top games here.
            </p>
          </div>
        ) : pickableGames.length === 0 ? (
          <p className="text-sm text-slate-500">No games match your search.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {pickableGames.map((game) => (
              <GamePickTile
                key={game.id}
                game={game}
                pinned={featuredIds.includes(game.id)}
                onPin={() => pinFeatured(game.id)}
              />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <TrendingUp size={16} className="text-emerald-400" />
          Sort remaining games
        </h2>
        <p className="mb-4 text-sm text-slate-400">
          Games not in Top picks are ordered within each lobby tab using the mode you choose.
        </p>

        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setSortMode("best_selling")}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              sortMode === "best_selling"
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-white/10 bg-slate-950/40 hover:border-white/20"
            }`}
          >
            <p className="text-sm font-semibold text-white">Best selling (automatic)</p>
            <p className="mt-1 text-xs text-slate-400">
              Highest total bet volume appears first. Updates as players bet.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setSortMode("manual")}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              sortMode === "manual"
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-white/10 bg-slate-950/40 hover:border-white/20"
            }`}
          >
            <p className="text-sm font-semibold text-white">Manual order</p>
            <p className="mt-1 text-xs text-slate-400">
              You control the order with the up/down arrows below.
            </p>
          </button>
        </div>

        {sortMode === "manual" ? (
          manualGames.length === 0 ? (
            <p className="text-sm text-slate-500">No active lobby games — activate games below first.</p>
          ) : (
            <div className="space-y-2">
              {manualGames
                .filter((g) => !featuredIds.includes(g.id))
                .map((game, index, rows) => (
                  <OrderRow
                    key={game.id}
                    game={game}
                    index={index}
                    total={rows.length}
                    onMove={(dir) => {
                      const ids = manualIds.filter((id) => !featuredIds.includes(id));
                      const moved = moveListItem(ids, index, dir);
                      const featured = manualIds.filter((id) => featuredIds.includes(id));
                      setManualIds([...featured, ...moved]);
                    }}
                  />
                ))}
            </div>
          )
        ) : (
          <div className="space-y-2">
            {[...activeGames]
              .filter((g) => !featuredIds.includes(g.id))
              .sort((a, b) => (b.lobbyStats?.betVolume ?? 0) - (a.lobbyStats?.betVolume ?? 0))
              .map((game, index) => (
                <div
                  key={game.id}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2"
                >
                  <span className="w-6 shrink-0 text-center text-xs font-bold text-slate-500">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{game.name}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {formatVolume(game.lobbyStats?.betVolume)} wagered · {game.lobbyStats?.betCount ?? 0} bets
                    </p>
                  </div>
                  <Badge value={game.status} />
                </div>
              ))}
            <p className="text-xs text-slate-500">
              Preview of automatic order (read-only). Save to apply on /play.
            </p>
          </div>
        )}
      </Card>

      {showPageHeader ? (
        <Card>
          <h2 className="mb-2 font-semibold">Add or hide games</h2>
          <p className="text-sm text-slate-400">
            To activate new QTech games or upload thumbnails, use{" "}
            <Link href="/admin/qtech" className="text-emerald-400 underline">
              QTech &amp; Games
            </Link>
            . Only <strong className="text-white">active</strong> games appear on the player lobby.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
