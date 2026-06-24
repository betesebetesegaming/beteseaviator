"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { collection, onSnapshot } from "firebase/firestore";
import { Upload } from "lucide-react";
import { db } from "@/lib/firestore";
import { adminDeleteGame, adminSetGameStatus, errorMessage } from "@/lib/api";
import { filterLobbyGames } from "@/lib/games/catalog";
import { gameLobbyImageUrl, uploadGameLobbyImage } from "@/lib/games/lobbyImages";
import type { Game } from "@/lib/types";
import { Badge, Button, Card, Input } from "@/components/ui";

type Props = {
  busyGameId: string | null;
  setBusyGameId: (id: string | null) => void;
  onRefresh: () => Promise<void>;
};

export function LobbyGamesSection({ busyGameId, setBusyGameId, onRefresh }: Props) {
  const [games, setGames] = useState<Game[]>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    return onSnapshot(collection(db, "games"), (snap) => {
      const rows = filterLobbyGames(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Game)
      ).sort((a, b) => a.name.localeCompare(b.name));
      setGames(rows);
      setNames((prev) => {
        const next = { ...prev };
        for (const g of rows) {
          if (next[g.id] === undefined) next[g.id] = g.name;
        }
        return next;
      });
    });
  }, []);

  async function saveName(game: Game) {
    const name = (names[game.id] ?? game.name).trim();
    if (!name || name === game.name) return;
    setBusyGameId(game.id);
    try {
      await adminSetGameStatus({ gameId: game.id, name });
      await onRefresh();
      toast.success("Game name updated.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyGameId(null);
    }
  }

  async function onUpload(gameId: string, file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB.");
      return;
    }
    setUploadingId(gameId);
    try {
      const url = await uploadGameLobbyImage(gameId, file);
      await adminSetGameStatus({ gameId, imageUrl: url });
      await onRefresh();
      toast.success("Lobby image uploaded.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploadingId(null);
    }
  }

  async function clearImage(gameId: string) {
    setBusyGameId(gameId);
    try {
      await adminSetGameStatus({ gameId, imageUrl: "" });
      toast.success("Custom image removed.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyGameId(null);
    }
  }

  async function toggle(game: Game) {
    setBusyGameId(game.id);
    try {
      await adminSetGameStatus({
        gameId: game.id,
        status: game.status === "active" ? "inactive" : "active",
      });
      await onRefresh();
      toast.success(`${game.name} ${game.status === "active" ? "hidden from" : "shown on"} lobby.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyGameId(null);
    }
  }

  async function remove(game: Game) {
    if (!window.confirm(`Remove "${game.name}" from the dashboard? This permanently deletes it.`)) return;
    setBusyGameId(game.id);
    try {
      await adminDeleteGame({ gameId: game.id });
      await onRefresh();
      toast.success(`${game.name} removed.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyGameId(null);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 font-semibold">6. Lobby games — names &amp; images</h2>
      <p className="mb-4 text-sm text-slate-400">
        Upload a product photo for each game tile on /play. Only the game name shows on the lobby
        (no provider label). JPG, PNG, or WebP — max 5 MB.
      </p>
      {games.length === 0 ? (
        <p className="text-sm text-slate-500">
          No games yet — click <strong>Restore lobby games</strong> above.
        </p>
      ) : (
        <div className="space-y-4">
          {games.map((game) => {
            const preview = gameLobbyImageUrl(game);
            return (
              <div
                key={game.id}
                className="rounded-xl border border-white/10 bg-slate-950/50 p-4"
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{game.name}</p>
                    <p className="text-xs text-slate-500">{game.id}</p>
                  </div>
                  <Badge value={game.status} />
                </div>

                <div className="mb-3 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview} alt="" className="aspect-[4/3] w-full max-w-xs object-cover" />
                  ) : (
                    <div className="flex aspect-[4/3] max-w-xs items-center justify-center text-xs text-slate-500">
                      No image — upload below
                    </div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Display name on lobby"
                    value={names[game.id] ?? game.name}
                    onChange={(e) => setNames((prev) => ({ ...prev, [game.id]: e.target.value }))}
                    onBlur={() => void saveName(game)}
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5">
                    <Upload size={14} />
                    {uploadingId === game.id ? "Uploading…" : "Upload image"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={uploadingId === game.id}
                      onChange={(e) => void onUpload(game.id, e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {game.imageUrl ? (
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      disabled={busyGameId === game.id}
                      onClick={() => void clearImage(game.id)}
                    >
                      Remove custom image
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    className="px-3 py-1.5 text-xs"
                    disabled={busyGameId === game.id}
                    onClick={() => void toggle(game)}
                  >
                    {game.status === "active" ? "Hide from lobby" : "Show on lobby"}
                  </Button>
                  <Button
                    variant="secondary"
                    className="px-3 py-1.5 text-xs text-rose-300 hover:text-rose-200"
                    disabled={busyGameId === game.id}
                    onClick={() => void remove(game)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
