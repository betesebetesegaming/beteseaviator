"use client";

import { useEffect, useMemo, useState } from "react";
import { Award, TrendingUp, WalletCards } from "lucide-react";
import { collection, doc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firestore";
import { formatXof } from "@/lib/format";
import { agentPeriodGgr } from "@/lib/agentPeriodGgr";
import {
  allLinkDeposits,
  agentOfficeFigures,
  firstDepositQualify,
  ggrBookDeposits,
} from "@/lib/agentDepositSales";
import { useAgentDepositSales } from "@/lib/hooks/useAgentDepositSales";
import { monthRangeIso, weekRangeIso } from "@/lib/ggrAccounting";
import { agentCommissionDue, commissionableGgr } from "@/lib/platformFinancials";
import { mergePlatformSettings } from "@/lib/platformSettingsMerge";
import { useAgentCommissionBook } from "@/lib/hooks/useAgentCommissionBook";
import { DEFAULT_SETTINGS, type AgentStats, type Commission, type PlatformSettings } from "@/lib/types";
import { Card, Spinner, StatCard } from "@/components/ui";

/** Same deposit / play / GGR book the backoffice shows for this marketer. */
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
  const { linkDeposits, first } = useAgentDepositSales(agentId);
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
  if (!book) {
    return (
      <Card className="flex items-center justify-center p-8">
        <Spinner label="Loading your account book..." />
      </Card>
    );
  }

  const deposits = allLinkDeposits({
    ledgerLifetime: linkDeposits,
    bookDeposits: book.deposits,
    storedDeposits: storedDeposits ?? 0,
  });
  const bookDeposits = ggrBookDeposits(book.deposits, storedDeposits ?? 0);
  const office = agentOfficeFigures({
    bookDeposits: deposits,
    storedDeposits: deposits,
    bookStakes: book.stakes,
    storedBets: anchors?.totalBets ?? 0,
    bookWins: book.wins,
    storedWins: anchors?.totalWins ?? 0,
  });
  const withdrawals = book.withdrawals;
  const cashHeld = book.cashHeld;
  const lifetimeGgr = commissionableGgr(bookDeposits, withdrawals, cashHeld);
  const dayGgr = agentPeriodGgr("day", lifetimeGgr, anchors, credited.day);
  const weekGgr = agentPeriodGgr("week", lifetimeGgr, anchors, credited.week);
  const monthGgr = agentPeriodGgr("month", lifetimeGgr, anchors, credited.month);
  const monthShare = agentCommissionDue(monthGgr, rate);
  const pct = Math.round(rate * 100);
  const firstHave = Math.max(first.lifetime, Number(anchors?.firstDeposits ?? 0));
  const q = firstDepositQualify(firstHave, settings.firstDepositQualifyGmd ?? 40_000);

  return (
    <div className="space-y-4">
      <Card className="border-amber-500/30 bg-amber-500/10 p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-200">
          Deposits (same as BETESE backoffice)
        </p>
        <p className="mt-2 text-3xl font-bold tabular-nums text-white">{formatXof(office.deposits)}</p>
        <p className="mt-1 text-sm text-slate-300">
          Money customers put in on your link — Wave and wallet, the same total staff see.
          First-deposit pay uses each customer&apos;s first payment only. Qualify at{" "}
          {formatXof(q.threshold)}.
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-950/50">
          <div
            className={`h-full ${q.qualified ? "bg-emerald-400" : "bg-amber-400"}`}
            style={{ width: `${Math.round(q.progress * 100)}%` }}
          />
        </div>
        <p className={`mt-2 text-sm font-semibold ${q.qualified ? "text-emerald-300" : "text-amber-200"}`}>
          {q.qualified
            ? `Qualified for BETESE first-deposit pay (${formatXof(q.have)} / ${formatXof(q.threshold)} · ${first.lifetimeCount || anchors?.firstDepositCount || 0} first payments)`
            : (
                <>
                  Not qualified yet —{" "}
                  <span className="font-bold text-white">{formatXof(q.remaining)}</span> more first
                  deposits to reach {formatXof(q.threshold)}
                </>
              )}
        </p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-6">
          <div className="rounded-lg border border-white/15 bg-slate-950/50 px-3 py-3">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-amber-200/80">Deposits</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums text-white">{formatXof(office.deposits)}</dd>
          </div>
          <div className="rounded-lg border border-amber-400/30 bg-slate-950/50 px-3 py-3">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-amber-200/80">
              First deposits
            </dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums text-white">{formatXof(firstHave)}</dd>
          </div>
          <div className="rounded-lg bg-slate-950/40 px-3 py-3">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Played</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums text-white">{formatXof(office.played)}</dd>
          </div>
          <div className="rounded-lg bg-slate-950/40 px-3 py-3">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Wins</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums text-white">{formatXof(office.wins)}</dd>
          </div>
          <div className="rounded-lg bg-slate-950/40 px-3 py-3">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-violet-300/90">
              Profit / GGR
            </dt>
            <dd className="mt-1 text-xl font-bold tabular-nums text-white">{formatXof(office.playGgr)}</dd>
          </div>
          <div className="rounded-lg bg-slate-950/40 px-3 py-3">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-emerald-300/90">Wallet</dt>
            <dd className="mt-1 text-xl font-bold tabular-nums text-white">
              {formatXof(commissionWallet ?? 0)}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="border-emerald-500/30 bg-emerald-500/10 p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">
          This month — {pct}% of GGR profit
        </p>
        <p className="mt-2 text-3xl font-bold tabular-nums text-white">{formatXof(monthGgr)}</p>
        <p className="mt-1 text-sm text-slate-300">
          This month only (resets next month). Separate from lifetime Profit / GGR above. Your {pct}%
          is of this month&apos;s profit.
        </p>
        <p className="mt-4 text-lg font-bold text-emerald-300">
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
          hint="this month only"
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
