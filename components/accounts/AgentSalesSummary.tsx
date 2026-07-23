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

  const lifetimeGgr = Math.max(0, (stats.totalBets ?? 0) - (stats.totalWins ?? 0));

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

  const weekGgr = weekCommissions ? sumAgentGgr(weekCommissions) : null;
  const monthGgr = monthCommissions ? sumAgentGgr(monthCommissions) : null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-400">
        Your sales (GGR from customers), commissions, cash desk book for today, and ModemPay
        payments. Open{" "}
        <Link href="/admin/accounts?tab=modempay" className="text-emerald-400 hover:underline">
          ModemPay ledger
        </Link>{" "}
        for day-by-day deposits and payouts.
      </p>

      <AgentPeriodStats />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Lifetime sales (GGR)" value={formatXof(lifetimeGgr)} hint="all time from your customers" />
        <StatCard label="Commission in wallet" value={formatXof(wallet?.balance ?? 0)} hint="available now" />
        <StatCard
          label="Cash credits today"
          value={formatXof(Number(cashToday?.cashDeposits ?? 0))}
          hint={`${today} · cash desk`}
        />
        <StatCard
          label="Cash payouts today"
          value={formatXof(Number(cashToday?.cashWithdrawals ?? 0))}
          hint={`${today} · cash desk`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="ModemPay deposits today"
          value={formatXof(todayDeposits)}
          hint={today}
        />
        <StatCard
          label="ModemPay payouts today"
          value={formatXof(todayWithdrawals)}
          hint={today}
        />
        <StatCard
          label="ModemPay net today"
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
              <span className="text-slate-400">Sales (GGR)</span>
              <span className="font-semibold">{weekGgr != null ? formatXof(weekGgr) : "…"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Your commission</span>
              <span className="font-semibold text-emerald-300">
                {weekCommissions ? formatXof(sumAgentCommissions(weekCommissions)) : "…"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Customer deposits (ModemPay)</span>
              <span className="font-semibold">{formatXof(weekDeposits)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Customer withdrawals (ModemPay)</span>
              <span className="font-semibold">{formatXof(weekWithdrawals)}</span>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 font-semibold">This month — customer payments</h2>
          <p className="mb-4 text-xs text-slate-500">{month.label}</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Sales (GGR)</span>
              <span className="font-semibold">{monthGgr != null ? formatXof(monthGgr) : "…"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Your commission</span>
              <span className="font-semibold text-emerald-300">
                {monthCommissions ? formatXof(sumAgentCommissions(monthCommissions)) : "…"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Customer deposits (ModemPay)</span>
              <span className="font-semibold">{formatXof(monthDeposits)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Customer withdrawals (ModemPay)</span>
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
