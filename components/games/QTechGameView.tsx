"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { errorMessage } from "@/lib/api";
import {
  clearCachedQTechLaunchUrl,
  prefetchQTechLaunch,
  preconnectQTechGameHosts,
  qtechPlayDevice,
  readCachedQTechLaunchUrl,
} from "@/lib/games/qtechLaunchCache";
import type { Game } from "@/lib/types";
import { Button, Spinner } from "@/components/ui";
import { WalletFrozenNotice } from "@/components/wallet/WalletFrozenNotice";

const IFRAME_ALLOW =
  "fullscreen *; autoplay *; payment *; encrypted-media *; clipboard-write *";

type Props = {
  game: Game;
  immersive?: boolean;
  demo?: boolean;
};

export function QTechGameView({ game, immersive = false, demo = false }: Props) {
  const { fbUser, profile, wallet, loading } = useAuth();
  const { openAuth } = useAuthModal();
  // Always start null on server+client to avoid React hydration error #418
  // (sessionStorage differs between SSR and browser).
  const [launchUrl, setLaunchUrl] = useState<string | null>(null);
  const [launching, setLaunching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const redirectedRef = useRef(false);

  const needsProfile = !!fbUser && !profile && !loading;
  const isPlayer = !!profile && profile.role === "player" && profile.status === "active";
  const frozen = Boolean(wallet?.frozen);

  const loadGame = useCallback(async (force = false) => {
    setLaunching(true);
    setError(null);
    try {
      const playDevice = qtechPlayDevice();
      if (force) {
        clearCachedQTechLaunchUrl(game.id, demo, playDevice);
        setLaunchUrl(null);
        redirectedRef.current = false;
      }
      const url = await prefetchQTechLaunch({
        gameId: game.id,
        demo,
        device: playDevice,
        force,
      });
      if (!url) throw new Error("Could not start this game. Try again.");
      setLaunchUrl(url);
    } catch (e) {
      const msg = errorMessage(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setLaunching(false);
    }
  }, [demo, game.id]);

  useEffect(() => {
    preconnectQTechGameHosts();
  }, []);

  // Restore handoff / cached demo URL only after mount (client-only).
  useEffect(() => {
    if (startedRef.current) return;
    const device = qtechPlayDevice();
    const cached = readCachedQTechLaunchUrl(game.id, demo, device);

    if (demo) {
      startedRef.current = true;
      if (cached) {
        setLaunchUrl(cached);
        setLaunching(false);
        return;
      }
      void loadGame(false);
      return;
    }

    if (loading) return;
    if (!isPlayer || frozen) {
      setLaunching(false);
      return;
    }
    startedRef.current = true;
    if (cached) {
      setLaunchUrl(cached);
      setLaunching(false);
      return;
    }
    void loadGame(false);
  }, [demo, frozen, game.id, isPlayer, loadGame, loading]);

  // Real money: full-page QTech (HOME returns to lobby). Avoids iframe disconnect.
  useEffect(() => {
    if (demo || !launchUrl || redirectedRef.current) return;
    redirectedRef.current = true;
    clearCachedQTechLaunchUrl(game.id, false, qtechPlayDevice());
    window.location.assign(launchUrl);
  }, [demo, game.id, launchUrl]);

  useEffect(() => {
    if (!immersive || !demo) return;
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
  }, [demo, immersive]);

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

  if (!demo && (launchUrl || launching)) {
    return <Spinner label={`Opening ${game.name}…`} />;
  }

  if (launchUrl && demo) {
    if (immersive) {
      return (
        <>
          {launching ? (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80">
              <Spinner label="Starting demo…" />
            </div>
          ) : null}
          <iframe
            title={game.name}
            src={launchUrl}
            className="game-iframe-full fixed inset-0 z-[10] h-[100dvh] w-full border-0 bg-black"
            allow={IFRAME_ALLOW}
            referrerPolicy="no-referrer-when-downgrade"
            loading="eager"
          />
          <button
            type="button"
            onClick={() => void loadGame(true)}
            disabled={launching}
            className="fixed bottom-[max(5.75rem,calc(env(safe-area-inset-bottom)+5.25rem))] left-3 z-[65] flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/70 backdrop-blur-sm active:bg-black/60 disabled:opacity-40"
            title="Reload demo"
          >
            <RefreshCw size={14} className={launching ? "animate-spin" : ""} />
          </button>
        </>
      );
    }

    return (
      <div className="space-y-3">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
          <iframe
            title={game.name}
            src={launchUrl}
            className="aspect-[9/16] w-full min-h-[520px] bg-black sm:aspect-[16/10] sm:min-h-[480px]"
            allow={IFRAME_ALLOW}
            referrerPolicy="no-referrer-when-downgrade"
            loading="eager"
          />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-8 text-center">
        <p className="text-red-100">{error}</p>
        <Button className="mt-4" onClick={() => void loadGame(true)} disabled={launching}>
          <RefreshCw size={16} className="mr-2 inline" />
          Try again
        </Button>
      </div>
    );
  }

  return <Spinner label={demo ? "Opening demo…" : `Opening ${game.name}…`} />;
}
