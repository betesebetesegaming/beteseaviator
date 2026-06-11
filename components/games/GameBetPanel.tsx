"use client";

import { useState } from "react";
import { BetAmountStepper } from "./BetAmountStepper";
import { clampBetAmount, DEFAULT_BET_STEP, DEFAULT_BET_PRESETS } from "@/lib/games/betAmount";
import { formatXof } from "@/lib/format";
import type { PlatformSettings } from "@/lib/types";

type BetPanelMode = "bet" | "auto";

export type GameBetPanelProps = {
  amount: number;
  onAmountChange: (amount: number) => void;
  autoCashout: string;
  onAutoCashoutChange: (value: string) => void;
  settings: Pick<PlatformSettings, "minBet" | "maxBet" | "minAutoCashout" | "maxAutoCashout">;
  balance: number;
  disabled?: boolean;
  /** Primary action label when betting is open */
  betLabel?: string;
  onBet: () => void;
  canBet: boolean;
  /** In-flight cashout */
  showCashout?: boolean;
  liveMultiplier?: number;
  onCashout?: () => void;
  cashoutBusy?: boolean;
  /** Waiting for round after bet placed */
  waitingForTakeoff?: boolean;
  /** Round not in betting phase */
  nextRoundLabel?: string;
  panelIndex?: number;
};

export function GameBetPanel({
  amount,
  onAmountChange,
  autoCashout,
  onAutoCashoutChange,
  settings,
  balance,
  disabled,
  betLabel = "Bet",
  onBet,
  canBet,
  showCashout,
  liveMultiplier = 1,
  onCashout,
  cashoutBusy,
  waitingForTakeoff,
  nextRoundLabel = "Next round…",
  panelIndex = 1,
}: GameBetPanelProps) {
  const [mode, setMode] = useState<BetPanelMode>("bet");
  const locked = disabled || !!showCashout || !!waitingForTakeoff;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/90 p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-1 rounded-lg bg-slate-950/80 p-1">
        {(["bet", "auto"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            disabled={locked}
            onClick={() => setMode(tab)}
            className={`flex-1 rounded-md py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
              mode === tab
                ? "bg-slate-700 text-white"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab === "bet" ? "Bet" : "Auto"}
          </button>
        ))}
        {panelIndex > 1 && (
          <span className="px-2 text-[10px] font-bold text-slate-600">#{panelIndex}</span>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="min-w-0 flex-1 space-y-3">
          <BetAmountStepper
            amount={amount}
            onChange={(v) => onAmountChange(clampBetAmount(v, settings, balance))}
            step={DEFAULT_BET_STEP}
            presets={DEFAULT_BET_PRESETS}
            settings={settings}
            balance={balance}
            disabled={locked}
          />

          {mode === "auto" && (
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-widest text-slate-500">
                Auto cashout at
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min={settings.minAutoCashout}
                  max={settings.maxAutoCashout}
                  placeholder={`e.g. ${settings.minAutoCashout.toFixed(2)}`}
                  value={autoCashout}
                  onChange={(e) => onAutoCashoutChange(e.target.value)}
                  disabled={locked}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm font-bold text-white placeholder:text-slate-600 focus:border-emerald-400 focus:outline-none disabled:opacity-40"
                />
                <span className="text-sm font-bold text-slate-400">x</span>
              </div>
            </label>
          )}
        </div>

        <div className="flex sm:w-40 sm:shrink-0">
          {showCashout ? (
            <button
              type="button"
              onClick={onCashout}
              disabled={cashoutBusy}
              className="flex min-h-[7rem] w-full flex-col items-center justify-center rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-4 py-3 text-center font-black text-slate-950 shadow-lg shadow-emerald-900/40 transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              <span className="text-sm uppercase tracking-widest">Cashout</span>
              <span className="text-2xl tabular-nums">x{liveMultiplier.toFixed(2)}</span>
              <span className="mt-1 text-xs opacity-80">{formatXof(amount * liveMultiplier)}</span>
            </button>
          ) : waitingForTakeoff ? (
            <button
              type="button"
              disabled
              className="flex min-h-[7rem] w-full flex-col items-center justify-center rounded-2xl bg-slate-700 px-4 py-3 text-center font-black text-slate-300"
            >
              <span className="text-sm uppercase tracking-widest">Bet placed</span>
              <span className="mt-1 text-lg tabular-nums">{formatXof(amount)}</span>
              <span className="mt-1 text-[10px] uppercase text-slate-500">Waiting…</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onBet}
              disabled={!canBet}
              className="flex min-h-[7rem] w-full flex-col items-center justify-center rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 px-4 py-3 text-center font-black text-slate-950 shadow-lg shadow-emerald-900/40 transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-400 disabled:shadow-none"
            >
              <span className="text-lg uppercase tracking-widest">{betLabel}</span>
              <span className="mt-1 text-sm tabular-nums opacity-90">
                {canBet ? formatXof(amount) : nextRoundLabel}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
