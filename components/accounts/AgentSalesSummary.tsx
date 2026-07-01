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
import { formatXof } from "@/lib/format";
import {
  monthRangeIso,
  sumAgentCommissions,
  sumAgentGgr,
  weekRangeIso,
} from "@/lib/ggrAccounting";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firestore";
import type { Commission } from "@/lib/types";
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

  useEffect(() => {
    const unsubD = subscribeDeposits(undefined, setDeposits);
    const unsubW = subscribeWithdrawals(undefined, setWithdrawals);
    return () => {
      unsubD();
      unsubW();
    };
  }, []);

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
        Your sales (GGR from customers), commissions, and their ModemPay deposits &amp; withdrawals.
        Use the tabs above for full payment and transaction lists.
      </p>

      <AgentPeriodStats />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Lifetime sales (GGR)" value={formatXof(lifetimeGgr)} hint="all time from your customers" />
        <StatCard label="Commission in wallet" value={formatXof(wallet?.balance ?? 0)} hint="available now" />
        <StatCard label="Commission earned (life)" value={formatXof(stats.commissionEarned ?? 0)} />
        <StatCard label="Your customers" value={customerIds?.size ?? 0} />
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
