"use client";

import { Gift, Sparkles, Calendar, Moon } from "lucide-react";
import {
  BONUS_LABELS,
  bonusRuleSummary,
  isWeekendBonusWindow,
  mergeBonusSettings,
} from "@/lib/bonuses";
import { formatXof } from "@/lib/format";
import type { BonusSettings, Wallet } from "@/lib/types";
import { Card } from "@/components/ui";

const ICONS = {
  firstDeposit: Gift,
  weeklyCrash: Sparkles,
  weekend: Moon,
} as const;

type Props = {
  wallet: Wallet | null;
  bonuses?: BonusSettings | null;
};

export function WalletBalanceCards({ wallet }: Pick<Props, "wallet">) {
  const cash = wallet?.balance ?? 0;
  const bonus = wallet?.bonusBalance ?? 0;

  return (
    <div className="grid grid-cols-2 gap-3">
      <Card className="bg-gradient-to-br from-emerald-500/15 to-transparent text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Cash</p>
        <p className="mt-1 text-2xl font-black text-emerald-300 sm:text-3xl">{formatXof(cash)}</p>
        <p className="mt-1 text-[10px] text-slate-500">Withdrawable</p>
      </Card>
      <Card className="bg-gradient-to-br from-violet-500/15 to-transparent text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Bonus</p>
        <p className="mt-1 text-2xl font-black text-violet-300 sm:text-3xl">{formatXof(bonus)}</p>
        <p className="mt-1 text-[10px] text-slate-500">For Aviator bets</p>
      </Card>
    </div>
  );
}

export function BonusOffersPanel({ bonuses }: Pick<Props, "bonuses">) {
  const rules = mergeBonusSettings(bonuses);
  const weekendLive = isWeekendBonusWindow(new Date(), rules.weekend);

  return (
    <Card className="h-fit border-violet-500/20 bg-violet-500/5">
      <div className="mb-3 flex items-center gap-2">
        <Gift size={18} className="text-violet-300" />
        <h2 className="font-semibold text-violet-100">Deposit bonuses</h2>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-slate-400">
        Bonuses are added to your bonus balance when a deposit is confirmed. Use them on Aviator
        &amp; Crash — wins go to your cash balance.
      </p>
      <ul className="space-y-3">
        {(Object.keys(BONUS_LABELS) as (keyof BonusSettings)[]).map((key) => {
          const rule = rules[key];
          const Icon = ICONS[key];
          const active = rule.enabled && (key !== "weekend" || weekendLive);
          return (
            <li
              key={key}
              className={`rounded-lg border px-3 py-2.5 ${
                active
                  ? "border-violet-500/40 bg-violet-500/10"
                  : "border-white/5 bg-black/20 opacity-70"
              }`}
            >
              <div className="flex items-start gap-2">
                <Icon size={16} className="mt-0.5 shrink-0 text-violet-300" />
                <div>
                  <p className="text-sm font-semibold text-white">{BONUS_LABELS[key]}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                    {bonusRuleSummary(key, rule)}
                  </p>
                  {key === "weekend" && rule.enabled && weekendLive && (
                    <span className="mt-1.5 inline-block rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-200">
                      Live now — deposit tonight!
                    </span>
                  )}
                  {key === "weekend" && rule.enabled && !weekendLive && (
                    <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-slate-500">
                      <Calendar size={10} /> Fri {rules.weekend.fridayStartHour}:00 GMT onwards
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
