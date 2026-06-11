"use client";

import { Minus, Plus } from "lucide-react";
import { clampBetAmount, DEFAULT_BET_PRESETS } from "@/lib/games/betAmount";
import type { PlatformSettings } from "@/lib/types";

type Props = {
  amount: number;
  onChange: (amount: number) => void;
  step?: number;
  presets?: number[];
  settings: Pick<PlatformSettings, "minBet" | "maxBet">;
  balance?: number;
  disabled?: boolean;
  currency?: string;
};

export function BetAmountStepper({
  amount,
  onChange,
  step = 10,
  presets = DEFAULT_BET_PRESETS,
  settings,
  balance,
  disabled,
  currency = "GMD",
}: Props) {
  const clamp = (v: number) => clampBetAmount(v, settings, balance);

  return (
    <div className="space-y-2">
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          aria-label="Decrease bet"
          disabled={disabled || amount <= settings.minBet}
          onClick={() => onChange(clamp(amount - step))}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-800 text-lg font-bold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Minus size={18} />
        </button>

        <div className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl border border-white/10 bg-slate-950/80 px-2">
          <span className="text-[10px] uppercase tracking-widest text-slate-500">Bet amount</span>
          <span className="text-xl font-black tabular-nums text-white">
            {amount.toFixed(2)}
            <span className="ml-1 text-xs font-semibold text-slate-400">{currency}</span>
          </span>
        </div>

        <button
          type="button"
          aria-label="Increase bet"
          disabled={disabled || (balance !== undefined ? amount >= balance : amount >= settings.maxBet)}
          onClick={() => onChange(clamp(amount + step))}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-800 text-lg font-bold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={disabled || preset > (balance ?? settings.maxBet) || preset < settings.minBet}
            onClick={() => onChange(clamp(preset))}
            className={`min-w-[3rem] flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              Math.abs(amount - preset) < 0.01
                ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
                : "border-white/10 bg-slate-800 text-slate-200 hover:bg-slate-700"
            }`}
          >
            {preset >= 1000 ? `${preset / 1000}K` : preset}
          </button>
        ))}
      </div>
    </div>
  );
}
