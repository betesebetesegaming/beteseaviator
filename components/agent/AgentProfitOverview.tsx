"use client";

import { useEffect, useMemo, useState } from "react";
import { Award, Banknote, TrendingUp, WalletCards } from "lucide-react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firestore";
import { formatXof } from "@/lib/format";
import { agentPeriodGgr, agentPeriodSales } from "@/lib/agentPeriodGgr";
import { monthRangeIso, weekRangeIso } from "@/lib/ggrAccounting";
import { agentCommissionDue, commissionableGgr } from "@/lib/platformFinancials";
import { useAgentCommissionBook } from "@/lib/hooks/useAgentCommissionBook";
import type { AgentStats, Commission } from "@/lib/types";
import { Card, Spinner, StatCard } from "@/components/ui";

/** What a marketer should see: house profit from their link this day / week / month. */
export function AgentProfitOverview({
  agentId,
  commissionEarned,
  commissionWallet,
  storedDeposits,
  anchors,
  rate = 0.05,
}: {
  agentId: string | undefined;
  commissionEarned?: number;
  commissionWallet?: number;
  storedDeposits?: number;
  anchors?: AgentStats | null;
  rate?: number;
}) {
  const { book, customerCount } = useAgentCommissionBook(agentId);
  const month = useMemo(() => monthRangeIso(), []);
  const week = useMemo(() => weekRangeIso(), []);
  const [credited, setCredited] = useState<{ day: number; week: number; month: number }>({
    day: 0,
    week: 0,
    month: 0,
  });

  useEffect(() => {
    if (!agentId) return;
    const q = query(
      collection(db, "commissions"),
      where("agentId", "==", agentId),
      where("periodDate", ">=", month.from),
      orderBy("periodDate", "desc")
    );
    return onSnapshot(q, (snap) => {
      const next = { day: 0, week: 0, month: 0 };
      const today = new Date().toISOString().slice(0, 10);
      for (const doc of snap.docs) {
        const c = doc.data() as Commission;
        const g = Number(c.ggrAmount) || 0;
        next.month += g;
        if (c.periodDate >= week.from) next.week += g;
        if (c.periodDate === today) next.day += g;
      }
      setCredited(next);
    });
  }, [agentId, month.from, week.from]);

  if (!agentId) return null;
  if (!book) {
    return (
      <Card className="flex items-center justify-center p-8">
        <Spinner label="Loading your profit…" />
      </Card>
    );
  }

  const deposits = Math.max(book.deposits, storedDeposits ?? 0);
  const withdrawals = book.withdrawals;
  const cashHeld = book.cashHeld;
  const lifetimeGgr = commissionableGgr(deposits, withdrawals, cashHeld);
  const dayGgr = agentPeriodGgr("day", lifetimeGgr, anchors, credited.day);
  const weekGgr = agentPeriodGgr("week", lifetimeGgr, anchors, credited.week);
  const monthGgr = agentPeriodGgr("month", lifetimeGgr, anchors, credited.month);
  const monthSales = agentPeriodSales("month", deposits, anchors);
  const monthShare = agentCommissionDue(monthGgr, rate);
  const pct = Math.round(rate * 100);

  return (
    <div className="space-y-4">
      <Card className="border-emerald-500/30 bg-emerald-500/10 p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">
          This month&apos;s GGR profit
        </p>
        <p className="mt-2 text-3xl font-bold tabular-nums text-white">{formatXof(monthGgr)}</p>
        <p className="mt-1 text-sm text-slate-300">
          Money BETESE kept this month from players on your link. First deposit and later top-ups
          both count. Profit changes as they play — the month&apos;s 5% is final at month end. Next
          month starts at zero.
        </p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-slate-950/40 px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">Month sales</dt>
            <dd className="font-semibold tabular-nums text-white">{formatXof(monthSales)}</dd>
          </div>
          <div className="rounded-lg bg-slate-950/40 px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">− Withdrawals (all)</dt>
            <dd className="font-semibold tabular-nums text-amber-200">{formatXof(withdrawals)}</dd>
          </div>
          <div className="rounded-lg bg-slate-950/40 px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">− Still in wallets</dt>
            <dd className="font-semibold tabular-nums text-sky-200">{formatXof(cashHeld)}</dd>
          </div>
        </dl>
        <p className="mt-4 text-lg font-semibold text-emerald-300">
          Your {pct}% of this month = {formatXof(monthShare)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {customerCount} customer{customerCount === 1 ? "" : "s"} on your link
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Today GGR"
          value={formatXof(dayGgr)}
          hint={`${pct}% = ${formatXof(agentCommissionDue(dayGgr, rate))}`}
          icon={<TrendingUp size={20} />}
        />
        <StatCard
          label="This week GGR"
          value={formatXof(weekGgr)}
          hint={`${pct}% = ${formatXof(agentCommissionDue(weekGgr, rate))}`}
          icon={<TrendingUp size={20} />}
        />
        <StatCard
          label={`Your ${pct}% (month)`}
          value={formatXof(monthShare)}
          hint="share of this month's profit"
          icon={<Award size={20} />}
        />
        <StatCard
          label="In your wallet"
          value={formatXof(commissionWallet ?? 0)}
          hint={`credited so far ${formatXof(commissionEarned ?? 0)}`}
          icon={<WalletCards size={20} />}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Month sales (deposits)"
          value={formatXof(monthSales)}
          hint="this month only — resets next month"
          icon={<Banknote size={20} />}
        />
        <StatCard
          label="Lifetime GGR (reference)"
          value={formatXof(lifetimeGgr)}
          hint="all months combined — not used for this month's 5%"
          icon={<TrendingUp size={20} />}
        />
      </div>
    </div>
  );
}
