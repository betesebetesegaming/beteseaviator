"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { db } from "@/lib/firebase";
import { formatXof, todayIso, daysAgoIso } from "@/lib/format";
import type { Commission, DailyStats } from "@/lib/types";
import { Card, EmptyState, Input, Spinner, StatCard, TableShell, Td, Th } from "@/components/ui";

export default function AdminReportsPage() {
  const [from, setFrom] = useState(daysAgoIso(13));
  const [to, setTo] = useState(todayIso());
  const [days, setDays] = useState<DailyStats[] | null>(null);
  const [commissions, setCommissions] = useState<Commission[] | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, "dailyStats"),
      where("date", ">=", from),
      where("date", "<=", to),
      orderBy("date", "asc")
    );
    return onSnapshot(q, (snap) => {
      setDays(snap.docs.map((d) => d.data() as DailyStats));
    });
  }, [from, to]);

  useEffect(() => {
    const q = query(
      collection(db, "commissions"),
      where("periodDate", ">=", from),
      where("periodDate", "<=", to),
      orderBy("periodDate", "desc")
    );
    return onSnapshot(q, (snap) => {
      setCommissions(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Commission));
    });
  }, [from, to]);

  const totals = useMemo(() => {
    const t = { bets: 0, wins: 0, deposits: 0, withdrawals: 0, sessions: 0 };
    (days ?? []).forEach((d) => {
      t.bets += d.bets ?? 0;
      t.wins += d.wins ?? 0;
      t.deposits += d.deposits ?? 0;
      t.withdrawals += d.withdrawals ?? 0;
      t.sessions += d.sessions ?? 0;
    });
    return t;
  }, [days]);

  const chartData = useMemo(
    () =>
      (days ?? []).map((d) => ({
        date: d.date.slice(5),
        GGR: Math.round(((d.bets ?? 0) - (d.wins ?? 0)) * 100) / 100,
      })),
    [days]
  );

  const commissionTotal = useMemo(
    () => (commissions ?? []).reduce((sum, c) => sum + c.commissionAmount, 0),
    [commissions]
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Reports</h1>
          <p className="text-sm text-slate-400">GGR, activity and commissions by date range.</p>
        </div>
        <div className="flex gap-3">
          <div className="w-40">
            <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="w-40">
            <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="GGR" value={formatXof(totals.bets - totals.wins)} />
        <StatCard label="Bets" value={formatXof(totals.bets)} />
        <StatCard label="Wins" value={formatXof(totals.wins)} />
        <StatCard label="Deposits" value={formatXof(totals.deposits)} />
        <StatCard label="Rounds Played" value={totals.sessions} />
      </div>

      <Card className="mb-8">
        <h2 className="mb-4 font-semibold">GGR per day</h2>
        {!days ? (
          <Spinner />
        ) : chartData.length === 0 ? (
          <EmptyState message="No activity in this range." />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    color: "#f1f5f9",
                  }}
                  formatter={(value) => [formatXof(Number(value)), "GGR"]}
                />
                <Bar dataKey="GGR" fill="#34d399" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Commissions in range</h2>
        <span className="text-sm text-slate-400">
          Total: <strong className="text-emerald-300">{formatXof(commissionTotal)}</strong>
        </span>
      </div>
      {!commissions ? (
        <Spinner />
      ) : commissions.length === 0 ? (
        <EmptyState message="No commissions in this range." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Agent</Th>
              <Th>Customer</Th>
              <Th>GGR</Th>
              <Th>Rate</Th>
              <Th>Commission</Th>
            </tr>
          </thead>
          <tbody>
            {commissions.slice(0, 100).map((c) => (
              <tr key={c.id}>
                <Td className="tabular-nums">{c.periodDate}</Td>
                <Td>{(c as Commission & { agentName?: string }).agentName ?? c.agentId.slice(0, 8)}</Td>
                <Td>{c.playerName ?? c.playerId.slice(0, 8)}</Td>
                <Td className="tabular-nums">{formatXof(c.ggrAmount)}</Td>
                <Td className="tabular-nums">{(c.commissionRate * 100).toFixed(1)}%</Td>
                <Td className="font-semibold tabular-nums text-emerald-400">
                  {formatXof(c.commissionAmount)}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
