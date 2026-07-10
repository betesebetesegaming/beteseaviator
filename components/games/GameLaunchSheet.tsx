"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { errorMessage } from "@/lib/api";
import { gameDemoPath } from "@/lib/games/paths";
import { cacheGameDoc, prefetchQTechLaunch, qtechPlayDevice } from "@/lib/games/qtechLaunchCache";
import { gameLobbyImageUrl } from "@/lib/games/lobbyImages";
import { qtechCdnBannerImage } from "@/lib/games/qtechImages";
import type { Game } from "@/lib/types";

type Props = {
  game: Game;
  open: boolean;
  onClose: () => void;
};

export function GameLaunchSheet({ game, open, onClose }: Props) {
  const router = useRouter();
  const { openAuth } = useAuthModal();
  const { profile } = useAuth();
  const isPlayer = !!profile && profile.role === "player" && profile.status === "active";

  const primaryUrl = gameLobbyImageUrl(game);
  const fallbackUrl = useMemo(() => {
    const id = String(game.qtechGameId ?? "").trim();
    return id ? qtechCdnBannerImage(id) : undefined;
  }, [game.qtechGameId]);

  const [src, setSrc] = useState(primaryUrl);
  const [demoLoading, setDemoLoading] = useState(false);
  const [realLoading, setRealLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSrc(primaryUrl);
    cacheGameDoc(game);
    void prefetchQTechLaunch({ gameId: game.id, demo: true, device: qtechPlayDevice() });
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, primaryUrl, game]);

  if (!open) return null;

  const playReal = async () => {
    if (!isPlayer) {
      openAuth("register");
      return;
    }
    setRealLoading(true);
    try {
      // Exactly one real launch, then leave BETESE for QTech full-page.
      // Skipping /play/game avoids React hydration bugs and iframe disconnects.
      const url = await prefetchQTechLaunch({
        gameId: game.id,
        demo: false,
        device: qtechPlayDevice(),
        force: true,
      });
      if (!url) throw new Error("Could not start this game. Try again.");
      window.location.assign(url);
    } catch (e) {
      toast.error(errorMessage(e));
      setRealLoading(false);
    }
  };

  const playDemo = async () => {
    setDemoLoading(true);
    try {
      await prefetchQTechLaunch({ gameId: game.id, demo: true, device: qtechPlayDevice() });
      onClose();
      router.push(gameDemoPath(game));
    } finally {
      setDemoLoading(false);
    }
  };

  const busy = demoLoading || realLoading;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy ? undefined : onClose} aria-hidden />

      <div className="relative w-full max-w-md overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="truncate text-base font-black text-slate-900">{game.name}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative aspect-[4/3] bg-[#1a1a1a]">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={game.name}
              className="h-full w-full object-cover"
              onError={() => fallbackUrl && setSrc(fallbackUrl)}
            />
          ) : null}
        </div>

        <div className="space-y-3 p-4">
          <button
            type="button"
            onClick={() => void playReal()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#f5e042] py-4 text-center text-sm font-black uppercase tracking-widest text-black shadow-md active:scale-[0.99] disabled:opacity-70"
          >
            {realLoading ? <Loader2 size={16} className="animate-spin" /> : null}
            {realLoading ? "Starting…" : "Play now"}
          </button>
          <button
            type="button"
            onClick={() => void playDemo()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-black py-4 text-center text-sm font-black uppercase tracking-widest text-white active:scale-[0.99] disabled:opacity-70"
          >
            {demoLoading ? <Loader2 size={16} className="animate-spin" /> : null}
            {demoLoading ? "Opening demo…" : "Play demo"}
          </button>
          <p className="text-center text-[11px] text-slate-500">
            Demo is free — no wallet needed. Sign up to play with real GMD.
          </p>
        </div>
      </div>
    </div>
  );
}
