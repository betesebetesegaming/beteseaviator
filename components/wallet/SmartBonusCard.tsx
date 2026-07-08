"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Clock, Rocket, CheckCircle2 } from "lucide-react";
import { formatXof } from "@/lib/format";
import { formatCountdown, msUntil } from "@/lib/smartBonus";
import type { SmartBonusOffer, Wallet } from "@/lib/types";
import { Button, Card } from "@/components/ui";

/**
 * BETESE Smart Bonus screen — deposit match, expiry countdown, wager progress.
 * Handles the two live states: waiting-for-deposit and activated (wagering).
 */
export function SmartBonusCard({ offer, wallet }: { offer: SmartBonusOffer; wallet: Wallet | null }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(() => msUntil(offer.expiresAt));

  useEffect(() => {
    const tick = () => setRemaining(msUntil(offer.expiresAt));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [offer.expiresAt]);

  const totalPlay = offer.matchDeposit + offer.bonusAmount;

  if (offer.status === "activated") {
    const required = wallet?.bonusWagerRequired ?? offer.wagerRequired;
    const progress = wallet?.bonusWagerProgress ?? 0;
    const pct = required > 0 ? Math.min(100, Math.round((progress / required) * 100)) : 100;
    const left = Math.max(0, required - progress);
    return (
      <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-violet-500/10">
        <div className="mb-1 flex items-center gap-2">
          <CheckCircle2 size={18} className="text-emerald-300" />
          <h2 className="font-bold">Smart Bonus active</h2>
        </div>
        <p className="mb-4 text-sm text-slate-300">
          Your <strong className="text-emerald-300">{formatXof(offer.bonusCredited ?? offer.bonusAmount)}</strong> bonus
          is live. Wager it {offer.wagerMultiplier}× to unlock it as withdrawable cash.
        </p>
        <div className="mb-1 flex justify-between text-xs text-slate-400">
          <span>Wager progress</span>
          <span className="tabular-nums">
            {formatXof(progress)} / {formatXof(required)}
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-violet-400 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {left > 0 ? `Play ${formatXof(left)} more to convert your bonus to cash.` : "Wagering complete — bonus converted to cash!"}
        </p>
      </Card>
    );
  }

  // Live offer awaiting deposit (approved / sent).
  const expired = remaining <= 0;
  return (
    <Card className="border-violet-500/30 bg-gradient-to-br from-violet-500/15 to-fuchsia-500/10">
      <div className="mb-1 flex items-center gap-2">
        <Sparkles size={18} className="text-violet-200" />
        <h2 className="font-bold">BETESE Smart Bonus</h2>
      </div>
      <p className="mb-4 text-sm text-slate-300">
        You&apos;ve been hand-picked for an exclusive bonus based on your loyalty. Match the deposit below to claim it.
      </p>

      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <Metric label="Deposit" value={formatXof(offer.matchDeposit)} />
        <Metric label="Bonus" value={formatXof(offer.bonusAmount)} accent />
        <Metric label="You play with" value={formatXof(totalPlay)} strong />
      </div>

      <div className="mb-4 flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-sm">
        <span className="flex items-center gap-1.5 text-slate-300">
          <Clock size={15} /> {expired ? "Offer expired" : "Expires in"}
        </span>
        <span className={`font-bold tabular-nums ${expired ? "text-rose-300" : "text-amber-200"}`}>
          {formatCountdown(remaining)}
        </span>
      </div>

      <p className="mb-3 text-xs text-slate-400">
        Wager requirement: bonus must be played {offer.wagerMultiplier}× before winnings can be withdrawn.
      </p>

      <Button
        className="w-full"
        disabled={expired}
        onClick={() => router.push(`/play/wallet?deposit=${offer.matchDeposit}`)}
      >
        <span className="flex items-center justify-center gap-1.5">
          <Rocket size={16} /> Activate — deposit {formatXof(offer.matchDeposit)}
        </span>
      </Button>
      <p className="mt-2 text-center text-[11px] text-slate-500">Status: Waiting for your deposit</p>
    </Card>
  );
}

function Metric({ label, value, accent, strong }: { label: string; value: string; accent?: boolean; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/40 py-2">
      <div className={`text-sm font-bold ${accent ? "text-violet-200" : strong ? "text-emerald-300" : "text-white"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
