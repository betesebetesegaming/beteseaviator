"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firestore";
import { formatXof } from "@/lib/format";
import { monthRangeIso, sumAgentCommissions, sumAgentGgr, weekRangeIso } from "@/lib/ggrAccounting";
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

/** Week / month GGR and commission for the signed-in agent. */
export function AgentPeriodStats() {
  const { profile } = useAuth();
  const agentId = profile?.uid;
  const week = useMemo(() => weekRangeIso(), []);
  const month = useMemo(() => monthRangeIso(), []);

  const weekRows = useAgentCommissions(agentId, week.from, week.to);
  const monthRows = useAgentCommissions(agentId, month.from, month.to);

  if (!agentId || weekRows === null || monthRows === null) return null;

  const weekGgr = sumAgentGgr(weekRows);
  const weekCommission = sumAgentCommissions(weekRows);
  const monthGgr = sumAgentGgr(monthRows);
  const monthCommission = sumAgentCommissions(monthRows);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-sky-400">This week</p>
        <p className="mt-1 text-xs text-slate-500">{week.label}</p>
        <div className="mt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Your customers&apos; GGR</span>
            <span className="font-semibold tabular-nums text-white">{formatXof(weekGgr)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Commission earned</span>
            <span className="font-semibold tabular-nums text-emerald-300">{formatXof(weekCommission)}</span>
          </div>
        </div>
      </Card>
      <Card className="p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-sky-400">This month</p>
        <p className="mt-1 text-xs text-slate-500">{month.label}</p>
        <div className="mt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Your customers&apos; GGR</span>
            <span className="font-semibold tabular-nums text-white">{formatXof(monthGgr)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Commission earned</span>
            <span className="font-semibold tabular-nums text-emerald-300">{formatXof(monthCommission)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
