"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useAgentCustomerIds } from "@/lib/hooks/useAgentCustomerIds";
import { subscribeDeposits, subscribeWithdrawals } from "@/lib/payments/rtdbClient";
import type { RtdbDepositRecord, RtdbWithdrawalRecord } from "@/lib/payments/rtdbRecords";
import {
  filterModemPayDeposits,
  filterModemPayWithdrawals,
  sumModemPayAmount,
} from "@/lib/modemPayAccounting";
import { formatXof, todayIso } from "@/lib/format";
import {
  monthRangeIso,
  sumAgentCommissions,
  sumAgentGgr,
  weekRangeIso,
} from "@/lib/ggrAccounting";
import { collection, doc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firestore";
import type { AgentDailyStats, Commission } from "@/lib/types";
import { AgentPeriodStats } from "@/components/staff/AgentPeriodStats";
import { AgentProfitOverview } from "@/components/agent/AgentProfitOverview";
import { useAgentCommissionBook } from "@/lib/hooks/useAgentCommissionBook";
import { agentPeriodGgr } from "@/lib/agentPeriodGgr";
import { Card, StatCard } from "@/components/ui";

function useAgentCommissionsRange(agentId: string | undefined, from: string, to: string) {
  const [rows, setRows] = useState<Commission[] | null>(null);
  useEffect(() => {
    if (!agentId) return;
    const q = query(
      collection(db, "commissions"),
      where("agentId", "==", agentId),
      where("periodDate", ">=", from),
      where("periodDate", "<=", to),
      orderBy("periodDate", "desc")
    );
    return onSnapshot(q, (snap) =>
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Commission))
    );
  }, [agentId, from, to]);
  return rows;
}

export function AgentSalesSummary() {
  const { profile, wallet } = useAuth();
  const agentId = profile?.uid;
  const stats = profile?.stats ?? {};
  const week = useMemo(() => weekRangeIso(), []);
  const month = useMemo(() => monthRangeIso(), []);
  const { customerIds } = useAgentCustomerIds(agentId);

  const weekCommissions = useAgentCommissionsRange(agentId, week.from, week.to);
  const monthCommissions = useAgentCommissionsRange(agentId, month.from, month.to);

  const [deposits, setDeposits] = useState<RtdbDepositRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<RtdbWithdrawalRecord[]>([]);
  const today = useMemo(() => todayIso(), []);
  const [cashToday, setCashToday] = useState<AgentDailyStats | null>(null);

  useEffect(() => {
    const unsubD = subscribeDeposits(undefined, setDeposits);
    const unsubW = subscribeWithdrawals(undefined, setWithdrawals);
    return () => {
      unsubD();
      unsubW();
    };
  }, []);

  useEffect(() => {
    if (!agentId) return;
    return onSnapshot(doc(db, "agentDailyStats", `${agentId}_${today}`), (snap) => {
      setCashToday(snap.exists() ? (snap.data() as AgentDailyStats) : null);
    });
  }, [agentId, today]);

  const { book } = useAgentCommissionBook(agentId);
  const lifetimeGgr = book?.commissionableGgr ?? 0;
  const weekCredited = weekCommissions ? sumAgentGgr(weekCommissions) : 0;
  const monthCredited = monthCommissions ? sumAgentGgr(monthCommissions) : 0;
  const weekGgr = agentPeriodGgr("week", lifetimeGgr, stats, weekCredited);
  const monthGgr = agentPeriodGgr("month", lifetimeGgr, stats, monthCredited);

  const weekDeposits = useMemo(
    () =>
      sumModemPayAmount(
        filterModemPayDeposits(deposits, {
          customerIds,
          from: week.from,
          to: week.to,
          successfulOnly: true,
        })
      ),
    [deposits, customerIds, week]
  );
  const todayDeposits = useMemo(
    () =>
      sumModemPayAmount(
        filterModemPayDeposits(deposits, {
          customerIds,
          from: today,
          to: today,
          successfulOnly: true,
        })
      ),
    [deposits, customerIds, today]
  );
  const todayWithdrawals = useMemo(
    () =>
      sumModemPayAmount(
        filterModemPayWithdrawals(withdrawals, {
          customerIds,
          from: today,
          to: today,
          status: "completed",
        })
      ),
    [withdrawals, customerIds, today]
  );
  const monthDeposits = useMemo(
    () =>
      sumModemPayAmount(
        filterModemPayDeposits(deposits, {
          customerIds,
          from: month.from,
          to: month.to,
          successfulOnly: true,
        })
      ),
    [deposits, customerIds, month]
  );
  const weekWithdrawals = useMemo(
    () =>
      sumModemPayAmount(
        filterModemPayWithdrawals(withdrawals, {
          customerIds,
          from: week.from,
          to: week.to,
          status: "completed",
        })
      ),
    [withdrawals, customerIds, week]
  );
  const monthWithdrawals = useMemo(
    () =>
      sumModemPayAmount(
        filterModemPayWithdrawals(withdrawals, {
          customerIds,
          from: month.from,
          to: month.to,
          status: "completed",
        })
      ),
    [withdrawals, customerIds, month]
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-400">
        Profit from your customers, Wave day stats, and week/month credits. For the full statement —
        cash desk, Wave, profit, and commission wallet — open{" "}
        <Link href="/admin/accounts?tab=book" className="font-medium text-amber-300 hover:underline">
          Account book
        </Link>
        .
      </p>

      <AgentProfitOverview
        agentId={agentId}
        commissionEarned={stats.commissionEarned ?? 0}
        commissionWallet={wallet?.balance ?? 0}
        storedDeposits={stats.customerDeposits ?? 0}
        anchors={stats}
      />

      {(Number(cashToday?.cashDeposits ?? 0) > 0 || Number(cashToday?.cashDepositCount ?? 0) > 0) ? (
        <Card className="border-amber-500/40 bg-amber-500/10 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-amber-100">Cash deposits today</h2>
              <p className="mt-1 text-sm text-amber-200/80">
                {cashToday?.cashDepositCount ?? 0} cash deposit
                {(cashToday?.cashDepositCount ?? 0) === 1 ? "" : "s"} recorded for {today}.
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold tabular-nums text-amber-100">
                {formatXof(Number(cashToday?.cashDeposits ?? 0))}
              </p>
              <Link
                href="/admin/accounts?tab=cashdesk"
                className="text-sm font-medium text-amber-300 hover:underline"
              >
                View cash desk book →
              </Link>
            </div>
          </div>
        </Card>
      ) : null}

      <AgentPeriodStats />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="This month GGR profit" value={formatXof(monthGgr)} hint="resets next month · deposits − withdrawals − wallet cash" />
        <StatCard label="Commission in wallet" value={formatXof(wallet?.balance ?? 0)} hint="available now" />
        <StatCard
          label="Cash deposits today"
          value={formatXof(Number(cashToday?.cashDeposits ?? 0))}
          hint={`${today} · ${cashToday?.cashDepositCount ?? 0} deposit(s)`}
        />
        <StatCard
          label="Cash payouts today"
          value={formatXof(Number(cashToday?.cashWithdrawals ?? 0))}
          hint={`${today} · cash desk`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Wave deposits today"
          value={formatXof(todayDeposits)}
          hint={today}
        />
        <StatCard
          label="Wave payouts today"
          value={formatXof(todayWithdrawals)}
          hint={today}
        />
        <StatCard
          label="Wave net today"
          value={formatXof(Math.round((todayDeposits - todayWithdrawals) * 100) / 100)}
          hint="deposits − payouts"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-1 font-semibold">This week — customer payments</h2>
          <p className="mb-4 text-xs text-slate-500">{week.label}</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Live GGR profit</span>
              <span className="font-semibold">{formatXof(weekGgr)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Your commission</span>
              <span className="font-semibold text-emerald-300">
                {weekCommissions ? formatXof(sumAgentCommissions(weekCommissions)) : "…"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Customer deposits (Wave)</span>
              <span className="font-semibold">{formatXof(weekDeposits)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Customer withdrawals (Wave)</span>
              <span className="font-semibold">{formatXof(weekWithdrawals)}</span>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 font-semibold">This month — customer payments</h2>
          <p className="mb-4 text-xs text-slate-500">{month.label}</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Live GGR profit</span>
              <span className="font-semibold">{formatXof(monthGgr)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Your commission</span>
              <span className="font-semibold text-emerald-300">
                {monthCommissions ? formatXof(sumAgentCommissions(monthCommissions)) : "…"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Customer deposits (Wave)</span>
              <span className="font-semibold">{formatXof(monthDeposits)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Customer withdrawals (Wave)</span>
              <span className="font-semibold">{formatXof(monthWithdrawals)}</span>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4 text-sm text-slate-400">
        Commission wallet:{" "}
        <Link href="/admin/agent-wallet" className="text-emerald-400 hover:underline">
          My Wallet
        </Link>
        {" · "}
        Full commission rows:{" "}
        <Link href="/admin/commissions" className="text-emerald-400 hover:underline">
          Commissions
        </Link>
      </Card>
    </div>
  );
}
