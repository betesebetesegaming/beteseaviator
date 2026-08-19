"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firestore";
import { formatXof } from "@/lib/format";
import { agentPeriodGgr } from "@/lib/agentPeriodGgr";
import { monthRangeIso, sumAgentCommissions, sumAgentGgr, weekRangeIso } from "@/lib/ggrAccounting";
import { agentCommissionDue, commissionableGgr } from "@/lib/platformFinancials";
import { useAgentCommissionBook } from "@/lib/hooks/useAgentCommissionBook";
import type { Commission } from "@/lib/types";
import { Card } from "@/components/ui";

function useAgentCommissions(agentId: string | undefined, from: string, to: string) {
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

/** Week / month live GGR and 5% for the signed-in agent. */
export function AgentPeriodStats() {
  const { profile } = useAuth();
  const agentId = profile?.uid;
  const week = useMemo(() => weekRangeIso(), []);
  const month = useMemo(() => monthRangeIso(), []);
  const { book } = useAgentCommissionBook(agentId);

  const weekRows = useAgentCommissions(agentId, week.from, week.to);
  const monthRows = useAgentCommissions(agentId, month.from, month.to);

  if (!agentId || weekRows === null || monthRows === null) return null;

  const deposits = Math.max(book?.deposits ?? 0, profile?.stats?.customerDeposits ?? 0);
  const currentGgr = commissionableGgr(
    deposits,
    book?.withdrawals ?? 0,
    book?.cashHeld ?? 0
  );
  const weekGgr = agentPeriodGgr("week", currentGgr, profile?.stats, sumAgentGgr(weekRows));
  const monthGgr = agentPeriodGgr("month", currentGgr, profile?.stats, sumAgentGgr(monthRows));
  const weekCommission = agentCommissionDue(weekGgr, 0.05);
  const monthCommission = agentCommissionDue(monthGgr, 0.05);

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Today, week, and month each have their own GGR. Your 5% is of that period&apos;s profit —
        not three extra payments on the same money. Live figures move as customers play. The
        month&apos;s 5% is final at month end; next month starts at zero. Already in your wallet:{" "}
        {formatXof(sumAgentCommissions(weekRows))} this week, {formatXof(sumAgentCommissions(monthRows))}{" "}
        this month.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
      <Card className="p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-sky-400">This week</p>
        <p className="mt-1 text-xs text-slate-500">{week.label}</p>
        <div className="mt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Live GGR profit</span>
            <span className="font-semibold tabular-nums text-white">{formatXof(weekGgr)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Your 5% (this week)</span>
            <span className="font-semibold tabular-nums text-emerald-300">{formatXof(weekCommission)}</span>
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-sky-400">This month</p>
        <p className="mt-1 text-xs text-slate-500">{month.label}</p>
        <div className="mt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Live GGR profit</span>
            <span className="font-semibold tabular-nums text-white">{formatXof(monthGgr)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Your 5% (this month)</span>
            <span className="font-semibold tabular-nums text-emerald-300">{formatXof(monthCommission)}</span>
          </div>
        </div>
      </Card>
      </div>
    </div>
  );
}
