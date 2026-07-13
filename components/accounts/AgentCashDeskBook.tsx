"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getOperationsHub, type OperationsHubResponse, errorMessage } from "@/lib/api";
import { formatDate, formatXof, todayIso } from "@/lib/format";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firestore";
import type { AgentDailyStats } from "@/lib/types";
import { Button, EmptyState, StatCard, TableShell, Td, Th } from "@/components/ui";

/** Agent account book for OTC cash credit / withdraw (not ModemPay). */
export function AgentCashDeskBook() {
  const { profile } = useAuth();
  const agentId = profile?.uid;
  const today = useMemo(() => todayIso(), []);
  const [daily, setDaily] = useState<AgentDailyStats | null>(null);
  const [data, setData] = useState<OperationsHubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    return onSnapshot(doc(db, "agentDailyStats", `${agentId}_${today}`), (snap) => {
      setDaily(snap.exists() ? (snap.data() as AgentDailyStats) : null);
    });
  }, [agentId, today]);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await getOperationsHub({ limit: 250 });
      setData(res);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cashRows = useMemo(() => {
    if (!data || !agentId) return [];
    return data.transactions.filter((t) => {
      const meta = (t.meta ?? {}) as Record<string, unknown>;
      return meta.otcCash === true && meta.agentId === agentId;
    });
  }, [data, agentId]);

  const todayStart = useMemo(() => {
    const d = new Date(`${today}T00:00:00`);
    return d.getTime();
  }, [today]);

  const todayRows = useMemo(
    () => cashRows.filter((t) => (t.createdAt ?? 0) >= todayStart),
    [cashRows, todayStart],
  );

  const todayDeposits = useMemo(
    () =>
      todayRows
        .filter((t) => t.type === "deposit")
        .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0),
    [todayRows],
  );
  const todayWithdrawals = useMemo(
    () =>
      todayRows
        .filter((t) => t.type === "withdrawal")
        .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0),
    [todayRows],
  );

  const depositTotal = Number(daily?.cashDeposits ?? todayDeposits);
  const withdrawTotal = Number(daily?.cashWithdrawals ?? todayWithdrawals);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-slate-400">
          Your cash desk book — credits and payouts you handled by Player ID / phone (OTP). This is
          separate from ModemPay (Wave / Afrimoney).
        </p>
        <Button variant="secondary" className="gap-2" onClick={() => void load()} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Cash credits today" value={formatXof(depositTotal)} hint={today} />
        <StatCard label="Cash payouts today" value={formatXof(withdrawTotal)} hint={today} />
        <StatCard
          label="Credits today (count)"
          value={daily?.cashDepositCount ?? todayRows.filter((t) => t.type === "deposit").length}
        />
        <StatCard
          label="Payouts today (count)"
          value={
            daily?.cashWithdrawalCount ?? todayRows.filter((t) => t.type === "withdrawal").length
          }
        />
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {loading ? (
        <EmptyState message="Loading cash desk book…" />
      ) : cashRows.length === 0 ? (
        <EmptyState message="No cash desk transactions yet. Use Credit (cash) / Withdraw above." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Customer</Th>
              <Th>Player ID</Th>
              <Th>Type</Th>
              <Th>Amount</Th>
              <Th>Details</Th>
            </tr>
          </thead>
          <tbody>
            {cashRows.map((t) => (
              <tr key={t.id}>
                <Td className="whitespace-nowrap text-xs text-slate-400">
                  {t.createdAt ? formatDate(new Date(t.createdAt)) : "—"}
                </Td>
                <Td className="font-medium">{t.userName ?? t.userId.slice(0, 8)}</Td>
                <Td className="font-mono text-emerald-300">{t.playerId ?? "—"}</Td>
                <Td className="capitalize">{t.type}</Td>
                <Td className="font-semibold tabular-nums">{formatXof(Math.abs(Number(t.amount) || 0))}</Td>
                <Td className="max-w-[16rem] truncate text-xs text-slate-400">{t.description}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
