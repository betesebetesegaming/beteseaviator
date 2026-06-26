"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { launchQTechGame, launchQTechGameDemo, errorMessage } from "@/lib/api";
import {
  prefetchQTechLaunch,
  qtechPlayDevice,
  readCachedQTechLaunchUrl,
  writeCachedQTechLaunchUrl,
} from "@/lib/games/qtechLaunchCache";
import type { Game } from "@/lib/types";
import { Button, Spinner } from "@/components/ui";
import { WalletFrozenNotice } from "@/components/wallet/WalletFrozenNotice";

type Props = {
  game: Game;
  immersive?: boolean;
  demo?: boolean;
};

function isMobilePlayDevice(): boolean {
  return qtechPlayDevice() === "mobile";
}

export function QTechGameView({ game, immersive = false, demo = false }: Props) {
  const { fbUser, profile, wallet, loading } = useAuth();
  const { openAuth } = useAuthModal();
  const device = qtechPlayDevice();
  const [launchUrl, setLaunchUrl] = useState<string | null>(() =>
    readCachedQTechLaunchUrl(game.id, demo, device),
  );
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsProfile = !!fbUser && !profile && !loading;
  const isPlayer = !!profile && profile.role === "player" && profile.status === "active";
  const frozen = Boolean(wallet?.frozen);

  const loadGame = useCallback(async () => {
    setLaunching(true);
    setError(null);
    try {
      const playDevice = isMobilePlayDevice() ? "mobile" : "desktop";
      if (demo) {
        const res = await launchQTechGameDemo({ gameId: game.id, device: playDevice });
        writeCachedQTechLaunchUrl(game.id, true, res.launchUrl, playDevice);
        setLaunchUrl(res.launchUrl);
        return;
      }
      if (!isPlayer || frozen) return;
      const res = await launchQTechGame({ gameId: game.id, device: playDevice });
      writeCachedQTechLaunchUrl(game.id, false, res.launchUrl, playDevice);
      setLaunchUrl(res.launchUrl);
    } catch (e) {
      const msg = errorMessage(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setLaunching(false);
    }
  }, [demo, frozen, game.id, isPlayer]);

  useEffect(() => {
    if (demo) {
      if (launchUrl) {
        void prefetchQTechLaunch({ gameId: game.id, demo: true, device }).then((url) => {
          if (url) setLaunchUrl(url);
        });
        return;
      }
      void loadGame();
      return;
    }
    if (isPlayer && !frozen) {
      if (launchUrl) {
        void prefetchQTechLaunch({ gameId: game.id, demo: false, device }).then((url) => {
          if (url) setLaunchUrl(url);
        });
        return;
      }
      void loadGame();
    }
  }, [demo, device, frozen, game.id, isPlayer, launchUrl, loadGame]);

  useEffect(() => {
    if (!immersive) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyBg = body.style.backgroundColor;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.backgroundColor = "#000";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.backgroundColor = prevBodyBg;
    };
  }, [immersive]);

  if (!demo && (!fbUser || !isPlayer)) {
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

  if (!demo && frozen) {
    return <WalletFrozenNotice />;
  }

  if (launching && !launchUrl) {
    return <Spinner label={demo ? "Opening demo…" : `Opening ${game.name}…`} />;
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
    return <Spinner label={demo ? "Preparing demo…" : `Preparing ${game.name}…`} />;
  }

  if (immersive) {
    return (
      <>
        {demo ? (
          <div className="fixed left-1/2 top-[max(2.5rem,calc(env(safe-area-inset-top)+2rem))] z-[65] -translate-x-1/2 rounded-full bg-amber-500/90 px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-black">
            Fun mode — demo
          </div>
        ) : null}
        <iframe
          title={game.name}
          src={launchUrl}
          className="game-iframe-full fixed inset-0 z-[10] h-[100dvh] w-full border-0 bg-black"
          allow="fullscreen; autoplay; payment"
          referrerPolicy="no-referrer-when-downgrade"
          loading="eager"
        />
        <button
          type="button"
          onClick={() => void loadGame()}
          disabled={launching}
          className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-[65] flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/70 backdrop-blur-sm active:bg-black/60 disabled:opacity-40"
          title="Reload game"
        >
          <RefreshCw size={14} className={launching ? "animate-spin" : ""} />
        </button>
      </>
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
