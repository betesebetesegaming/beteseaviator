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
};

export function QTechGameView({ game }: Props) {
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
          className="aspect-[16/10] w-full min-h-[480px] bg-black"
          allow="fullscreen; autoplay"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </div>
  );
}
