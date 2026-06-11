"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { onValue, ref } from "firebase/database";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { ArrowLeft, Eye, Plane } from "lucide-react";
import { db, rtdb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { placeBet, cashout, errorMessage } from "@/lib/api";
import { formatXof, multiplierAt } from "@/lib/format";
import type { Game, GameSession, LiveRound } from "@/lib/types";
import { AuthModal } from "@/components/auth-modal";
import { Button, Card, Input, Spinner } from "@/components/ui";

const QUICK_AMOUNTS = [100, 500, 1000, 5000];

export default function GamePage() {
  const params = useParams<{ id: string }>();
  const gameId = params.id;
  const { fbUser, profile, wallet } = useAuth();

  const isPlayer =
    !!profile && profile.role === "player" && profile.status === "active";
  const [authOpen, setAuthOpen] = useState(false);

  const [game, setGame] = useState<Game | null>(null);
  const [round, setRound] = useState<LiveRound | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [history, setHistory] = useState<{ roundId: string; crashPoint: number }[]>([]);

  const [betAmount, setBetAmount] = useState("500");
  const [autoCashout, setAutoCashout] = useState("");
  const [session, setSession] = useState<GameSession | null>(null);
  const [busy, setBusy] = useState(false);
  const prevStatus = useRef<string | null>(null);

  // ---- load game meta ----
  useEffect(() => {
    getDoc(doc(db, "games", gameId)).then((snap) => {
      if (snap.exists()) setGame({ id: snap.id, ...snap.data() } as Game);
    });
  }, [gameId]);

  // ---- live round state + server clock offset ----
  useEffect(() => {
    const unsubRound = onValue(ref(rtdb, `rounds/${gameId}/current`), (snap) => {
      setRound(snap.val());
    });
    const unsubOffset = onValue(ref(rtdb, ".info/serverTimeOffset"), (snap) => {
      setOffset(snap.val() ?? 0);
    });
    const unsubHistory = onValue(ref(rtdb, `rounds/${gameId}/history`), (snap) => {
      const val = (snap.val() ?? {}) as Record<string, { crashPoint: number; at: number }>;
      const items = Object.entries(val)
        .map(([roundId, v]) => ({ roundId, crashPoint: v.crashPoint, at: v.at }))
        .sort((a, b) => b.at - a.at)
        .slice(0, 12);
      setHistory(items);
    });
    return () => {
      unsubRound();
      unsubOffset();
      unsubHistory();
    };
  }, [gameId]);

  // ---- animation clock ----
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- my active session (also recovers after refresh) ----
  useEffect(() => {
    if (!fbUser || !isPlayer) return;
    const q = query(
      collection(db, "gameSessions"),
      where("playerId", "==", fbUser.uid),
      where("gameId", "==", gameId),
      where("status", "==", "active"),
      limit(1)
    );
    return onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0];
        setSession({ id: d.id, ...d.data() } as GameSession);
      }
    });
  }, [fbUser, isPlayer, gameId]);

  // ---- watch my session doc for settlement (win/lose toasts) ----
  useEffect(() => {
    if (!session?.id) return;
    return onSnapshot(doc(db, "gameSessions", session.id), (snap) => {
      if (!snap.exists()) return;
      const s = { id: snap.id, ...snap.data() } as GameSession;
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

  const phase = round?.status ?? null;
  const flyingSeconds =
    round && phase === "flying" ? Math.max(0, (serverNow - round.phaseStart) / 1000) : 0;
  const liveMultiplier = round
    ? phase === "flying"
      ? multiplierAt(flyingSeconds, round.growthRate)
      : phase === "crashed"
        ? (round.crashPoint ?? 1)
        : 1
    : 1;

  const bettingSecondsLeft =
    round && phase === "betting" ? Math.max(0, (round.bettingEndsAt - serverNow) / 1000) : 0;

  // notify on phase change
  useEffect(() => {
    if (!round) return;
    prevStatus.current = round.status;
  }, [round]);

  const multiplierColor = useMemo(() => {
    if (phase === "crashed") return "text-red-500";
    if (liveMultiplier >= 3) return "text-emerald-400";
    if (liveMultiplier >= 2) return "text-yellow-400";
    return "text-white";
  }, [phase, liveMultiplier]);

  const amountNum = Number(betAmount);
  const autoNum = autoCashout ? Number(autoCashout) : null;
  const displayBalance = isPlayer ? (wallet?.balance ?? 0) : 10_000;
  const canBet =
    isPlayer &&
    phase === "betting" &&
    !session &&
    !busy &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    displayBalance >= amountNum;

  const doPlaceBet = useCallback(async () => {
    if (!isPlayer) {
      setAuthOpen(true);
      return;
    }
    if (!canBet) return;
    setBusy(true);
    try {
      await placeBet({
        gameId,
        betAmount: amountNum,
        autoCashoutAt: autoNum,
      });
      toast.success("Bet placed!");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [isPlayer, canBet, gameId, amountNum, autoNum]);

  const doCashout = useCallback(async () => {
    if (!isPlayer) {
      setAuthOpen(true);
      return;
    }
    if (!session || busy) return;
    setBusy(true);
    try {
      await cashout({ sessionId: session.id });
      // success toast comes from the session snapshot listener
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [session, busy]);

  if (!game) return <Spinner label="Loading game…" />;

  return (
    <div>
      {!isPlayer && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <Eye size={16} className="shrink-0" />
          <span>
            You&apos;re watching in <strong>demo mode</strong> — rounds are live. Sign up when
            you&apos;re ready to bet with real XOF.
          </span>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/play"
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft size={16} /> Lobby
        </Link>
        <h1 className="font-semibold">{game.name}</h1>
        <span className="text-xs text-slate-500">RTP {Number(game.rtp).toFixed(0)}%</span>
      </div>

      {/* recent crash points */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {history.map((h) => (
          <span
            key={h.roundId}
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              h.crashPoint >= 3
                ? "bg-emerald-500/15 text-emerald-300"
                : h.crashPoint >= 2
                  ? "bg-yellow-500/15 text-yellow-300"
                  : "bg-sky-500/15 text-sky-300"
            }`}
          >
            x{h.crashPoint.toFixed(2)}
          </span>
        ))}
      </div>

      {/* game display */}
      <div className="relative flex h-72 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 sm:h-96">
        {!round ? (
          <p className="text-slate-400">Waiting for the next round…</p>
        ) : phase === "betting" ? (
          <div className="text-center">
            <p className="text-sm uppercase tracking-widest text-slate-400">Place your bets</p>
            <p className="mt-2 text-6xl font-black text-white tabular-nums">
              {bettingSecondsLeft.toFixed(1)}s
            </p>
            <p className="mt-2 text-xs text-slate-500">Round #{round.roundId.slice(-6)}</p>
          </div>
        ) : (
          <div className="text-center">
            {phase === "flying" && (
              <Plane
                className="mx-auto mb-3 animate-float text-emerald-400"
                size={48}
                style={{ transform: `translateY(-${Math.min(flyingSeconds * 6, 80)}px)` }}
              />
            )}
            <p className={`text-7xl font-black tabular-nums ${multiplierColor}`}>
              x{liveMultiplier.toFixed(2)}
            </p>
            {phase === "crashed" && (
              <p className="mt-3 text-lg font-bold uppercase tracking-widest text-red-500">
                Crashed!
              </p>
            )}
          </div>
        )}
        <p className="absolute bottom-3 right-4 text-[10px] text-slate-600">
          Provably fair · {round?.hash ? `${round.hash.slice(0, 16)}…` : ""}
        </p>
      </div>

      {/* bet panel */}
      <Card className="mt-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-36">
                <Input
                  label="Bet amount (XOF)"
                  type="number"
                  min={1}
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  disabled={!!session}
                />
              </div>
              <div className="flex gap-1.5">
                {QUICK_AMOUNTS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setBetAmount(String(a))}
                    disabled={!!session}
                    className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700 disabled:opacity-40"
                  >
                    {a.toLocaleString()}
                  </button>
                ))}
              </div>
              <div className="w-40">
                <Input
                  label="Auto cashout (optional)"
                  type="number"
                  step="0.01"
                  min={1.01}
                  placeholder="e.g. 2.00"
                  value={autoCashout}
                  onChange={(e) => setAutoCashout(e.target.value)}
                  disabled={!!session}
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">
              {isPlayer ? (
                <>
                  Balance: {formatXof(wallet?.balance ?? 0)}
                  {session && (
                    <>
                      {" "}
                      · In play: <strong>{formatXof(session.betAmount)}</strong>
                      {session.autoCashoutAt ? ` (auto x${session.autoCashoutAt})` : ""}
                    </>
                  )}
                </>
              ) : (
                <>Demo balance: {formatXof(displayBalance)} · Sign up to play for real</>
              )}
            </p>
          </div>

          <div className="flex items-center">
            {session && phase === "flying" ? (
              <Button
                variant="success"
                className="h-16 w-full px-8 text-lg sm:w-56"
                onClick={doCashout}
                disabled={busy}
              >
                CASHOUT x{liveMultiplier.toFixed(2)}
              </Button>
            ) : session ? (
              <Button className="h-16 w-full px-8 text-lg sm:w-56" disabled>
                Waiting for takeoff…
              </Button>
            ) : (
              <Button
                className="h-16 w-full px-8 text-lg sm:w-56"
                onClick={doPlaceBet}
                disabled={isPlayer ? !canBet && phase !== "betting" : busy}
              >
                {phase === "betting"
                  ? isPlayer
                    ? "PLACE BET"
                    : "SIGN UP TO BET"
                  : "Next round…"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => setAuthOpen(false)}
        initialMode="register"
      />
    </div>
  );
}
