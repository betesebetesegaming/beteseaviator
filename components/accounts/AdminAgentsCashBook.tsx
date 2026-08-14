"use client";

/**
 * Admin view: every agent's shop cash desk for today — remittance control board.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { getOperationsHub, type OperationsHubResponse, errorMessage } from "@/lib/api";
import { formatDate, formatXof, todayIso } from "@/lib/format";
import { isOtcCashMeta } from "@/lib/transactionChannel";
import { Button, Card, EmptyState, Select, StatCard, TableShell, Td, Th } from "@/components/ui";

type MoneyRow = OperationsHubResponse["transactions"][number];

export function AdminAgentsCashBook() {
  const today = useMemo(() => todayIso(), []);
  const [data, setData] = useState<OperationsHubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState("");
  const [search, setSearch] = useState("");

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

  const todayStart = useMemo(() => new Date(`${today}T00:00:00`).getTime(), [today]);

  // Per-agent performance board
  const agentRows = useMemo(() => {
    const agents = data?.agents ?? [];
    return [...agents]
      .map((a) => ({
        ...a,
        cashIn: Number(a.cashDepositsToday ?? 0),
        cashOut: Number(a.cashWithdrawalsToday ?? 0),
        net: Math.round((Number(a.cashDepositsToday ?? 0) - Number(a.cashWithdrawalsToday ?? 0)) * 100) / 100,
        count: Number(a.cashDepositCountToday ?? 0),
      }))
      .sort((a, b) => b.ggr - a.ggr);
  }, [data]);

  const platformCash = useMemo(() => {
    const cashIn = agentRows.reduce((s, a) => s + a.cashIn, 0);
    const cashOut = agentRows.reduce((s, a) => s + a.cashOut, 0);
    return {
      cashIn,
      cashOut,
      net: Math.round((cashIn - cashOut) * 100) / 100,
      agentsWithCash: agentRows.filter((a) => a.cashIn > 0 || a.cashOut > 0).length,
      totalAccounts: agentRows.reduce((s, a) => s + a.customerCount, 0),
      totalDeposits: agentRows.reduce((s, a) => s + a.customerDeposits, 0),
      totalFirstDeposits: agentRows.reduce((s, a) => s + Number(a.firstDeposits ?? 0), 0),
      totalGgr: agentRows.reduce((s, a) => s + a.ggr, 0),
    };
  }, [agentRows]);

  const journal = useMemo(() => {
    if (!data) return [];
    let list = data.transactions.filter((t) => {
      if (!isOtcCashMeta(t.meta)) return false;
      if ((t.createdAt ?? 0) < todayStart) return false;
      return true;
    });
    if (agentFilter) list = list.filter((t) => t.agentId === agentFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          (t.userName ?? "").toLowerCase().includes(q) ||
          (t.playerId ?? "").toLowerCase().includes(q) ||
          (t.agentName ?? "").toLowerCase().includes(q) ||
          t.reference.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }, [data, todayStart, agentFilter, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Agent books &amp; cash desk</h2>
          <p className="text-sm text-slate-400">
            Back-office agent statement: name, register number, customer deposits, play, balance,
            profit (GGR), cash today, and total accounts. Cash journal for remittance is below.
          </p>
        </div>
        <Button variant="secondary" className="gap-2" onClick={() => void load()} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Platform cash in" value={formatXof(platformCash.cashIn)} hint={today} />
        <StatCard label="Platform cash out" value={formatXof(platformCash.cashOut)} />
        <Card className="border-amber-500/35 bg-amber-500/10 p-4">
          <p className="text-xs text-slate-400">Net cash held (all agents)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-100">
            {formatXof(platformCash.net)}
          </p>
        </Card>
        <StatCard label="Agents with cash today" value={platformCash.agentsWithCash} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total accounts" value={platformCash.totalAccounts} hint="all agent customers" />
        <StatCard label="First deposits (via links)" value={formatXof(platformCash.totalFirstDeposits)} />
        <StatCard label="All customer deposits" value={formatXof(platformCash.totalDeposits)} />
        <StatCard label="Total play GGR" value={formatXof(platformCash.totalGgr)} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">
          Agent books — name · register · first deposits · play · balance · profit
        </h3>
        {loading ? (
          <EmptyState message="Loading agent books…" />
        ) : agentRows.length === 0 ? (
          <EmptyState message="No agents found." />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Agent name</Th>
                <Th>Register #</Th>
                <Th className="text-right">First deposits</Th>
                <Th className="text-right">Play</Th>
                <Th className="text-right">Balance</Th>
                <Th className="text-right">Profit / GGR</Th>
                <Th className="text-right">Cash today</Th>
                <Th className="text-right">Accounts</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {agentRows.map((a) => (
                <tr key={a.uid} className={a.net > 0 ? "bg-amber-500/5" : undefined}>
                  <Td className="font-medium text-white">{a.name}</Td>
                  <Td className="font-mono text-xs text-sky-300">{a.agentSlug ?? "—"}</Td>
                  <Td className="text-right tabular-nums font-semibold text-emerald-200">
                    {formatXof(a.firstDeposits ?? 0)}
                    <span className="block text-[10px] font-normal text-slate-500">
                      all {formatXof(a.customerDeposits)}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums text-slate-300">{formatXof(a.totalBets)}</Td>
                  <Td className="text-right tabular-nums text-emerald-300">
                    {formatXof(a.walletBalance ?? 0)}
                  </Td>
                  <Td className="text-right tabular-nums font-semibold text-violet-200">
                    {formatXof(a.ggr)}
                  </Td>
                  <Td className="text-right tabular-nums text-amber-200">
                    {formatXof(a.net)}
                    <span className="block text-[10px] font-normal text-slate-500">
                      in {formatXof(a.cashIn)} · out {formatXof(a.cashOut)}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums">{a.customerCount}</Td>
                  <Td>
                    <Link
                      href={`/admin/operations?tab=transactions&agent=${encodeURIComponent(a.uid)}`}
                      className="text-xs text-violet-300 hover:underline"
                    >
                      Ledger
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          label="Agent"
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="min-w-[12rem]"
        >
          <option value="">All agents</option>
          {(data?.agents ?? []).map((a) => (
            <option key={a.uid} value={a.uid}>
              {a.name}
            </option>
          ))}
        </Select>
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm">
          <span className="text-slate-400">Search journal</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Player, agent, reference…"
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
          />
        </label>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <h3 className="text-sm font-semibold text-slate-200">Today&apos;s cash desk journal</h3>
      {loading ? (
        <EmptyState message="Loading journal…" />
      ) : journal.length === 0 ? (
        <EmptyState message="No cash desk entries today." />
      ) : (
        <CashJournalTable rows={journal} />
      )}
    </div>
  );
}

function CashJournalTable({ rows }: { rows: MoneyRow[] }) {
  return (
    <TableShell>
      <thead>
        <tr>
          <Th>Time</Th>
          <Th>Agent</Th>
          <Th>Player ID</Th>
          <Th>Customer</Th>
          <Th className="text-right">Cash in</Th>
          <Th className="text-right">Cash out</Th>
          <Th>Details</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => {
          const amt = Math.abs(Number(t.amount) || 0);
          const cashIn = t.type === "deposit" ? amt : 0;
          const cashOut = t.type === "withdrawal" ? amt : 0;
          return (
            <tr key={t.id} className={cashIn > 0 ? "bg-amber-500/5" : "bg-rose-500/5"}>
              <Td className="whitespace-nowrap text-xs text-slate-400">
                {t.createdAt ? formatDate(new Date(t.createdAt)) : "—"}
              </Td>
              <Td className="font-medium text-violet-200">{t.agentName ?? "—"}</Td>
              <Td className="font-mono text-emerald-300">{t.playerId ?? "—"}</Td>
              <Td>{t.userName ?? "—"}</Td>
              <Td className="text-right tabular-nums font-semibold text-emerald-300">
                {cashIn > 0 ? formatXof(cashIn) : "—"}
              </Td>
              <Td className="text-right tabular-nums font-semibold text-rose-300">
                {cashOut > 0 ? formatXof(cashOut) : "—"}
              </Td>
              <Td className="max-w-[12rem] truncate text-xs text-slate-400">{t.description}</Td>
            </tr>
          );
        })}
      </tbody>
    </TableShell>
  );
}
