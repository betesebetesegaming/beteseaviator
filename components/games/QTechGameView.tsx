"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { errorMessage, launchQTechGame } from "@/lib/api";
import type { Game } from "@/lib/types";
import { Button, Spinner } from "@/components/ui";
import { WalletFrozenNotice } from "@/components/wallet/WalletFrozenNotice";

type Props = {
  game: Game;
  immersive?: boolean;
};

export function QTechGameView({ game, immersive = false }: Props) {
  const { fbUser, profile, wallet, loading } = useAuth();
  const { openAuth } = useAuthModal();
  const [launchUrl, setLaunchUrl] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsProfile = !!fbUser && !profile && !loading;
  const isPlayer = !!profile && profile.role === "player" && profile.status === "active";
  const frozen = Boolean(wallet?.frozen);

  const loadGame = useCallback(async () => {
    if (!isPlayer || frozen) return;
    setLaunching(true);
    setError(null);
    try {
      const device = window.matchMedia("(min-width: 768px)").matches ? "desktop" : "mobile";
      const res = await launchQTechGame({ gameId: game.id, device });
      setLaunchUrl(res.launchUrl);
    } catch (e) {
      const msg = errorMessage(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setLaunching(false);
    }
  }, [frozen, game.id, isPlayer]);

  useEffect(() => {
    if (isPlayer && !frozen) void loadGame();
  }, [frozen, isPlayer, loadGame]);

  useEffect(() => {
    if (!immersive) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [immersive]);

  if (!fbUser || !isPlayer) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/70 p-8 text-center">
        <p className="text-slate-300">
          {needsProfile
            ? "Complete your profile to play with real GMD."
            : "Sign in to play this game with your BETESE wallet."}
        </p>
        <Button className="mt-4" onClick={() => openAuth(needsProfile ? "complete" : "register")}>
          {needsProfile ? "Complete account" : "Sign up / Sign in"}
        </Button>
      </div>
    );
  }

  if (frozen) {
    return <WalletFrozenNotice />;
  }

  if (launching && !launchUrl) {
    return <Spinner label={`Loading ${game.name}…`} />;
  }

  if (error && !launchUrl) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-8 text-center">
        <p className="text-red-100">{error}</p>
        <Button className="mt-4" onClick={() => void loadGame()} disabled={launching}>
          <RefreshCw size={16} className="mr-2 inline" />
          Try again
        </Button>
      </div>
    );
  }

  if (!launchUrl) {
    return <Spinner label={`Preparing ${game.name}…`} />;
  }

  if (immersive) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col bg-black">
        <iframe
          title={game.name}
          src={launchUrl}
          className="h-[calc(100dvh-2.75rem)] w-full border-0 bg-black sm:h-[calc(100dvh-3rem)]"
          allow="fullscreen; autoplay"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <button
          type="button"
          onClick={() => void loadGame()}
          disabled={launching}
          className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white/80 backdrop-blur-sm hover:bg-black/80 hover:text-white disabled:opacity-50"
          title="Reload game"
        >
          <RefreshCw size={15} className={launching ? "animate-spin" : ""} />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button className="mt-4 px-3 py-1.5 text-xs" variant="secondary" onClick={() => void loadGame()} disabled={launching}>
          <RefreshCw size={14} className="mr-1.5 inline" />
          Reload game
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
        <iframe
          title={game.name}
          src={launchUrl}
          className="aspect-[9/16] w-full min-h-[520px] bg-black sm:aspect-[16/10] sm:min-h-[480px]"
          allow="fullscreen; autoplay"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  );
}
