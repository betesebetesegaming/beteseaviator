"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { errorMessage } from "@/lib/api";
import { formatXof } from "@/lib/format";
import { playableBalance } from "@/lib/bonuses";
import { clampBetAmount, DEFAULT_BET_STEP, DEFAULT_BET_PRESETS } from "@/lib/games/betAmount";
import {
  cashoutGameBet,
  placeGameBet,
  subscribeCrashHistory,
  subscribeGameRound,
  subscribePlatformSettings,
  subscribePlayerSession,
  subscribeServerTimeOffset,
  subscribeSessionUpdates,
  type CrashHistoryItem,
} from "@/lib/games/api";
import type { Game, GameSession, LiveRound, PlatformSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { CrashGameBoard, useCrashLiveState } from "./CrashGameBoard";
import { GameBetPanel } from "./GameBetPanel";
import { WalletFrozenNotice } from "@/components/wallet/WalletFrozenNotice";

type Props = {
  game: Game;
};

export function CrashGameView({ game }: Props) {
  const { fbUser, profile, wallet, loading } = useAuth();
  const { openAuth } = useAuthModal();

  const needsProfile = !!fbUser && !profile && !loading;
  const isPlayer = !!profile && profile.role === "player" && profile.status === "active";

  const promptAuth = useCallback(() => {
    openAuth(needsProfile ? "complete" : "register");
  }, [needsProfile, openAuth]);

  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [round, setRound] = useState<LiveRound | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [history, setHistory] = useState<CrashHistoryItem[]>([]);

  const [betAmount, setBetAmount] = useState(500);
  const [autoCashout, setAutoCashout] = useState("");
  const [session, setSession] = useState<GameSession | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribePlatformSettings(setSettings), []);
  useEffect(() => subscribeGameRound(game.id, setRound), [game.id]);
  useEffect(() => subscribeServerTimeOffset(setOffset), []);
  useEffect(() => subscribeCrashHistory(game.id, setHistory), [game.id]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!fbUser || !isPlayer) return;
    return subscribePlayerSession(game.id, fbUser.uid, setSession);
  }, [fbUser, isPlayer, game.id]);

  useEffect(() => {
    if (!session?.id) return;
    return subscribeSessionUpdates(session.id, (s) => {
      if (s.status === "won" && session.status === "active") {
        toast.success(
          `Cashed out at x${s.cashoutMultiplier?.toFixed(2)} — Won ${formatXof(s.winAmount ?? 0)}!`
        );
        setSession(null);
      } else if (s.status === "lost" && session.status === "active") {
        toast.error("Crashed! Bet lost.");
        setSession(null);
      } else {
        setSession(s);
      }
    });
  }, [session?.id, session?.status]);

  const serverNow = now + offset;
  const { phase, liveMultiplier } = useCrashLiveState(round, serverNow);

  const displayBalance = isPlayer ? playableBalance(wallet) : 10_000;
  const amountNum = clampBetAmount(betAmount, settings, displayBalance);
  const autoNum = autoCashout ? Number(autoCashout) : null;

  const frozen = Boolean(wallet?.frozen);

  const canBet =
    isPlayer &&
    !frozen &&
    phase === "betting" &&
    !session &&
    !busy &&
    amountNum >= settings.minBet &&
    displayBalance >= amountNum;

  const doPlaceBet = useCallback(async () => {
    if (!isPlayer) {
      promptAuth();
      return;
    }
    if (frozen) {
      toast.error("Contact customer service — your wallet is restricted.");
      return;
    }
    if (!canBet) return;
    setBusy(true);
    try {
      await placeGameBet({
        gameId: game.id,
        betAmount: amountNum,
        autoCashoutAt: autoNum,
      });
      toast.success("Bet placed!");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [isPlayer, frozen, canBet, game.id, amountNum, autoNum, promptAuth]);

  const doCashout = useCallback(async () => {
    if (!isPlayer) {
      promptAuth();
      return;
    }
    if (!session || busy) return;
    setBusy(true);
    try {
      await cashoutGameBet(session.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [session, busy, isPlayer, promptAuth]);

  const betLabel = phase === "betting"
    ? isPlayer
      ? "Bet"
      : needsProfile
        ? "Complete account"
        : "Sign up"
    : "Next round…";

  return (
    <div className="space-y-4">
      <CrashGameBoard
        round={round}
        history={history}
        serverNow={serverNow}
        gameName={game.name}
        demoMode={!isPlayer}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        {frozen && isPlayer && !session ? (
          <WalletFrozenNotice />
        ) : (
          <GameBetPanel
            panelIndex={1}
            amount={amountNum}
            onAmountChange={setBetAmount}
            autoCashout={autoCashout}
            onAutoCashoutChange={setAutoCashout}
            settings={settings}
            balance={displayBalance}
            disabled={!!session || frozen}
            betLabel={frozen && isPlayer ? "Restricted" : betLabel}
            onBet={doPlaceBet}
            canBet={isPlayer ? canBet : phase === "betting" && !busy}
            showCashout={!!session && phase === "flying"}
            liveMultiplier={liveMultiplier}
            onCashout={doCashout}
            cashoutBusy={busy}
            waitingForTakeoff={!!session && phase !== "flying"}
            nextRoundLabel="Next round…"
          />
        )}

        {!frozen && (
          <GameBetPanel
            panelIndex={2}
            amount={amountNum}
            onAmountChange={setBetAmount}
            autoCashout={autoCashout}
            onAutoCashoutChange={setAutoCashout}
            settings={settings}
            balance={displayBalance}
            disabled
            betLabel="Bet 2"
            onBet={() => toast("Second bet panel coming soon", { icon: "🎮" })}
            canBet={false}
            nextRoundLabel="Soon"
          />
        )}
      </div>

      <p className="text-center text-xs text-slate-500">
        {isPlayer ? (
          <>
            Balance: {formatXof(playableBalance(wallet))}
            {(wallet?.bonusBalance ?? 0) > 0 && (
              <>
                {" "}
                ({formatXof(wallet?.balance ?? 0)} cash + {formatXof(wallet?.bonusBalance ?? 0)} bonus)
              </>
            )}
            {session && (
              <>
                {" "}
                · In play: <strong>{formatXof(session.betAmount)}</strong>
                {session.autoCashoutAt ? ` (auto x${session.autoCashoutAt})` : ""}
              </>
            )}
          </>
        ) : (
          <>Demo balance: {formatXof(displayBalance)} · Sign up to play for real GMD</>
        )}
      </p>
    </div>
  );
}
