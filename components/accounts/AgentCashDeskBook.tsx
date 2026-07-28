"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getOperationsHub, type OperationsHubResponse, errorMessage } from "@/lib/api";
import { formatDate, formatXof, todayIso } from "@/lib/format";
import { monthRangeIso, weekRangeIso } from "@/lib/ggrAccounting";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firestore";
import type { AgentDailyStats } from "@/lib/types";
import { isOtcCashMeta } from "@/lib/transactionChannel";
import { Button, EmptyState, Select, StatCard, TableShell, Td, Th } from "@/components/ui";

type PeriodKey = "today" | "week" | "month" | "all";
type MoneyRow = OperationsHubResponse["transactions"][number];

type JournalLine = MoneyRow & {
  cashIn: number;
  cashOut: number;
  runningBalance: number;
};

function periodFromMs(key: PeriodKey): number | null {
  const today = todayIso();
  if (key === "all") return null;
  if (key === "today") return new Date(`${today}T00:00:00`).getTime();
  if (key === "week") return new Date(`${weekRangeIso().from}T00:00:00`).getTime();
  return new Date(`${monthRangeIso().from}T00:00:00`).getTime();
}

/** Agent OTC cash desk daybook — debit / credit / running balance. */
export function AgentCashDeskBook() {
  const { profile } = useAuth();
  const agentId = profile?.uid;
  const today = useMemo(() => todayIso(), []);
  const [period, setPeriod] = useState<PeriodKey>("today");
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
      const res = await getOperationsHub({ limit: 400 });
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

  const fromMs = useMemo(() => periodFromMs(period), [period]);

  const journal: JournalLine[] = useMemo(() => {
    if (!data || !agentId) return [];
    const sorted = data.transactions
      .filter((t) => {
        const meta = (t.meta ?? {}) as Record<string, unknown>;
        if (!isOtcCashMeta(meta) || meta.agentId !== agentId) return false;
        if (fromMs != null && (t.createdAt ?? 0) < fromMs) return false;
        return true;
      })
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

    let running = 0;
    return sorted.map((t) => {
      const amt = Math.abs(Number(t.amount) || 0);
      const cashIn = t.type === "deposit" ? amt : 0;
      const cashOut = t.type === "withdrawal" ? amt : 0;
      running += cashIn - cashOut;
      return { ...t, cashIn, cashOut, runningBalance: Math.round(running * 100) / 100 };
    });
  }, [data, agentId, fromMs]);

  const newestFirst = useMemo(() => [...journal].reverse(), [journal]);

  const cashIn = journal.reduce((s, t) => s + t.cashIn, 0);
  const cashOut = journal.reduce((s, t) => s + t.cashOut, 0);
  const closing = journal.length ? journal[journal.length - 1]!.runningBalance : 0;

  const displayIn =
    period === "today" && daily?.cashDeposits != null ? Number(daily.cashDeposits) : cashIn;
  const displayOut =
    period === "today" && daily?.cashWithdrawals != null ? Number(daily.cashWithdrawals) : cashOut;
  const displayNet = Math.round((displayIn - displayOut) * 100) / 100;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Cash desk daybook</h2>
          <p className="text-sm text-slate-400">
            Physical cash only — separate from Wave.{" "}
            <span className="text-amber-200">Credit</span> = customer paid you cash.{" "}
            <span className="text-rose-300">Debit</span> = you paid customer cash. Balance = cash to
            hold / remit.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            label="Period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodKey)}
            className="min-w-[9rem]"
          >
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="all">All loaded</option>
          </Select>
          <Button variant="secondary" className="gap-2" onClick={() => void load()} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Cash in (credit)" value={formatXof(displayIn)} hint={period === "today" ? today : period} />
        <StatCard label="Cash out (debit)" value={formatXof(displayOut)} hint={`${journal.filter((t) => t.cashOut > 0).length} payout(s)`} />
        <StatCard label="Closing balance" value={formatXof(period === "today" ? displayNet : closing)} hint="In − out" />
        <StatCard
          label="Entries"
          value={journal.length}
          hint={
            period === "today"
              ? `${daily?.cashDepositCount ?? journal.filter((t) => t.cashIn > 0).length} in · ${daily?.cashWithdrawalCount ?? journal.filter((t) => t.cashOut > 0).length} out`
              : undefined
          }
        />
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {loading ? (
        <EmptyState message="Loading cash desk daybook…" />
      ) : newestFirst.length === 0 ? (
        <EmptyState message="No cash desk transactions in this period. Use Credit (cash) / Withdraw above." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Date / time</Th>
              <Th>Customer</Th>
              <Th>Player ID</Th>
              <Th className="text-right">Debit (out)</Th>
              <Th className="text-right">Credit (in)</Th>
              <Th className="text-right">Balance</Th>
              <Th>Notes</Th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((t) => (
              <tr
                key={t.id}
                className={t.cashIn > 0 ? "bg-amber-500/5" : t.cashOut > 0 ? "bg-rose-500/5" : undefined}
              >
                <Td className="whitespace-nowrap text-xs text-slate-400">
                  {t.createdAt ? formatDate(new Date(t.createdAt)) : "—"}
                </Td>
                <Td className="font-medium">{t.userName ?? t.userId.slice(0, 8)}</Td>
                <Td className="font-mono text-emerald-300">{t.playerId ?? "—"}</Td>
                <Td className="text-right tabular-nums font-semibold text-rose-300">
                  {t.cashOut > 0 ? formatXof(t.cashOut) : "—"}
                </Td>
                <Td className="text-right tabular-nums font-semibold text-emerald-300">
                  {t.cashIn > 0 ? formatXof(t.cashIn) : "—"}
                </Td>
                <Td className="text-right tabular-nums font-bold text-amber-100">
                  {formatXof(t.runningBalance)}
                </Td>
                <Td className="max-w-[14rem] truncate text-xs text-slate-400">{t.description}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
