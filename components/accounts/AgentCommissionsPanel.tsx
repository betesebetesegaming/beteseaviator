"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firestore";
import { useAuth } from "@/lib/auth-context";
import { formatXof } from "@/lib/format";
import type { Commission } from "@/lib/types";
import { EmptyState, Spinner, StatCard, TableShell, Td, Th } from "@/components/ui";

export function AgentCommissionsPanel({ adminView }: { adminView: boolean }) {
  const { fbUser } = useAuth();
  const [rows, setRows] = useState<Commission[] | null>(null);

  useEffect(() => {
    if (!fbUser && !adminView) return;
    const q = adminView
      ? query(collection(db, "commissions"), orderBy("periodDate", "desc"), limit(300))
      : query(
          collection(db, "commissions"),
          where("agentId", "==", fbUser!.uid),
          orderBy("periodDate", "desc"),
          limit(150)
        );
    return onSnapshot(q, (snap) => {
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Commission));
    });
  }, [fbUser, adminView]);

  const byAgent = useMemo(() => {
    if (!adminView || !rows) return [];
    const map = new Map<string, { ggr: number; commission: number; rows: number }>();
    for (const c of rows) {
      const cur = map.get(c.agentId) ?? { ggr: 0, commission: 0, rows: 0 };
      cur.ggr += c.ggrAmount ?? 0;
      cur.commission += c.commissionAmount ?? 0;
      cur.rows += 1;
      map.set(c.agentId, cur);
    }
    return [...map.entries()]
      .map(([agentId, v]) => ({ agentId, ...v }))
      .sort((a, b) => b.commission - a.commission);
  }, [rows, adminView]);

  const totals = useMemo(() => {
    if (!rows) return { ggr: 0, commission: 0 };
    return rows.reduce(
      (acc, c) => ({
        ggr: acc.ggr + (c.ggrAmount ?? 0),
        commission: acc.commission + (c.commissionAmount ?? 0),
      }),
      { ggr: 0, commission: 0 }
    );
  }, [rows]);

  if (!rows) return <Spinner label="Loading agent commissions…" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        {adminView
          ? "All agent commission credits — GGR share from their customers' play."
          : "Your commission history from customer GGR."}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="GGR in list" value={formatXof(totals.ggr)} />
        <StatCard label="Commission in list" value={formatXof(totals.commission)} />
      </div>

      {adminView && byAgent.length > 0 ? (
        <>
          <h3 className="font-semibold text-slate-200">By agent (recent rows)</h3>
          <TableShell>
            <thead>
              <tr>
                <Th>Agent ID</Th>
                <Th>Rows</Th>
                <Th>Customer GGR</Th>
                <Th>Commission</Th>
              </tr>
            </thead>
            <tbody>
              {byAgent.slice(0, 50).map((a) => (
                <tr key={a.agentId}>
                  <Td className="font-mono text-xs">{a.agentId.slice(0, 12)}…</Td>
                  <Td>{a.rows}</Td>
                  <Td className="tabular-nums">{formatXof(a.ggr)}</Td>
                  <Td className="font-semibold tabular-nums text-emerald-300">{formatXof(a.commission)}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </>
      ) : null}

      {!rows.length ? (
        <EmptyState message="No commission rows yet." />
      ) : (
        <>
          <h3 className="font-semibold text-slate-200">{adminView ? "All commission rows" : "My commissions"}</h3>
          <TableShell>
            <thead>
              <tr>
                <Th>Date</Th>
                {adminView ? <Th>Agent</Th> : null}
                <Th>Customer</Th>
                <Th>GGR</Th>
                <Th>Rate</Th>
                <Th>Commission</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((c) => (
                <tr key={c.id}>
                  <Td className="tabular-nums">{c.periodDate}</Td>
                  {adminView ? (
                    <Td className="font-mono text-xs">{c.agentId.slice(0, 10)}…</Td>
                  ) : null}
                  <Td>{c.playerName ?? c.playerId.slice(0, 8)}</Td>
                  <Td className="tabular-nums">{formatXof(c.ggrAmount)}</Td>
                  <Td className="tabular-nums">{(c.commissionRate * 100).toFixed(1)}%</Td>
                  <Td className="font-semibold tabular-nums text-emerald-300">
                    {formatXof(c.commissionAmount)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </>
      )}
    </div>
  );
}
