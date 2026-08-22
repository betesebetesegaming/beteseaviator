"use client";

import { useEffect, useMemo, useState } from "react";
import { Award, TrendingUp, WalletCards } from "lucide-react";
import { collection, doc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firestore";
import { formatXof } from "@/lib/format";
import { agentPeriodGgr } from "@/lib/agentPeriodGgr";
import { firstDepositQualify } from "@/lib/agentDepositSales";
import { monthRangeIso, weekRangeIso } from "@/lib/ggrAccounting";
import { agentCommissionDue, commissionableGgr } from "@/lib/platformFinancials";
import { mergePlatformSettings } from "@/lib/platformSettingsMerge";
import { useAgentCommissionBook } from "@/lib/hooks/useAgentCommissionBook";
import { useAgentDepositSales } from "@/lib/hooks/useAgentDepositSales";
import { DEFAULT_SETTINGS, type AgentStats, type Commission, type PlatformSettings } from "@/lib/types";
import { Card, Spinner, StatCard } from "@/components/ui";

/** First-deposit target (what we pay for bringing customers in) plus 5% of GGR on play. */
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
  const { first, continueSales, ready: salesReady } = useAgentDepositSales(agentId);
  const month = useMemo(() => monthRangeIso(), []);
  const week = useMemo(() => weekRangeIso(), []);
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [credited, setCredited] = useState<{ day: number; week: number; month: number }>({
    day: 0,
    week: 0,
    month: 0,
  });

  useEffect(() => {
    return onSnapshot(doc(db, "settings", "platform"), (snap) => {
      if (snap.exists()) setSettings(mergePlatformSettings(snap.data() as Partial<PlatformSettings>));
    });
  }, []);

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
  if (!book || !salesReady) {
    return (
      <Card className="flex items-center justify-center p-8">
        <Spinner label="Loading your first deposits..." />
      </Card>
    );
  }

  const deposits = Math.max(book.deposits, storedDeposits ?? 0, first.lifetime + continueSales.lifetime);
  const withdrawals = book.withdrawals;
  const cashHeld = book.cashHeld;
  const lifetimeGgr = commissionableGgr(deposits, withdrawals, cashHeld);
  const dayGgr = agentPeriodGgr("day", lifetimeGgr, anchors, credited.day);
  const weekGgr = agentPeriodGgr("week", lifetimeGgr, anchors, credited.week);
  const monthGgr = agentPeriodGgr("month", lifetimeGgr, anchors, credited.month);
  const monthShare = agentCommissionDue(monthGgr, rate);
  const pct = Math.round(rate * 100);
  const q = firstDepositQualify(first.lifetime, settings.firstDepositQualifyGmd ?? 40_000);

  return (
    <div className="space-y-4">
      <Card className="border-amber-500/30 bg-amber-500/10 p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-200">
          First deposits (signup money we watch)
        </p>
        <p className="mt-2 text-3xl font-bold tabular-nums text-white">{formatXof(first.lifetime)}</p>
        <p className="mt-1 text-sm text-slate-300">
          {first.lifetimeCount} {first.lifetimeCount === 1 ? "person" : "people"} made a first
          deposit on your link. BETESE first-deposit pay only if this total reaches{" "}
          {formatXof(q.threshold)}. This month: {formatXof(first.month)} ({first.monthCount}).
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-950/50">
          <div
            className={`h-full ${q.qualified ? "bg-emerald-400" : "bg-amber-400"}`}
            style={{ width: `${Math.round(q.progress * 100)}%` }}
          />
        </div>
        <p className={`mt-2 text-sm font-semibold ${q.qualified ? "text-emerald-300" : "text-amber-200"}`}>
          {q.qualified
            ? `Qualified for BETESE first-deposit pay (${formatXof(q.have)} / ${formatXof(q.threshold)})`
            : `Not qualified yet — ${formatXof(q.remaining)} more first deposits to reach ${formatXof(q.threshold)}`}
        </p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-slate-950/40 px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">Today</dt>
            <dd className="font-semibold tabular-nums text-white">
              {formatXof(first.day)}
              <span className="ml-1 text-[11px] font-normal text-slate-500">({first.dayCount})</span>
            </dd>
          </div>
          <div className="rounded-lg bg-slate-950/40 px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">This week</dt>
            <dd className="font-semibold tabular-nums text-white">
              {formatXof(first.week)}
              <span className="ml-1 text-[11px] font-normal text-slate-500">({first.weekCount})</span>
            </dd>
          </div>
          <div className="rounded-lg bg-slate-950/40 px-3 py-2">
            <dt className="text-[11px] uppercase tracking-wide text-slate-500">This month</dt>
            <dd className="font-semibold tabular-nums text-white">
              {formatXof(first.month)}
              <span className="ml-1 text-[11px] font-normal text-slate-500">
                ({first.monthCount})
              </span>
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-slate-500">
          Continue deposits this month (after first): {formatXof(continueSales.month)}. Those only
          pay {pct}% of GGR if there is profit.
        </p>
      </Card>

      <Card className="border-emerald-500/30 bg-emerald-500/10 p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">
          Continue play — {pct}% of GGR profit
        </p>
        <p className="mt-2 text-3xl font-bold tabular-nums text-white">{formatXof(monthGgr)}</p>
        <p className="mt-1 text-sm text-slate-300">
          House profit after customers on your link played (including money from first deposits and
          top-ups). Your {pct}% is of this profit only — not of continue deposits.
        </p>
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
          label={`${pct}% of GGR (month)`}
          value={formatXof(monthShare)}
          hint="profit share, not first-deposit pay"
          icon={<Award size={20} />}
        />
        <StatCard
          label="In your wallet"
          value={formatXof(commissionWallet ?? 0)}
          hint={`GGR share credited ${formatXof(commissionEarned ?? 0)}`}
          icon={<WalletCards size={20} />}
        />
      </div>
    </div>
  );
}
