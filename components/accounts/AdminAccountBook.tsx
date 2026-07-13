"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { getOperationsHub, type OperationsHubResponse, errorMessage } from "@/lib/api";
import { formatDate, formatXof } from "@/lib/format";
import { Badge, Button, EmptyState, Select, StatCard, TableShell, Td, Th } from "@/components/ui";

type MoneyRow = OperationsHubResponse["transactions"][number];

function channelLabel(t: MoneyRow): string {
  const meta = (t.meta ?? {}) as Record<string, unknown>;
  if (meta.otcCash === true) return "Cash desk";
  const desc = String(t.description || "").toLowerCase();
  if (desc.includes("modempay") || desc.includes("wave") || desc.includes("afrimoney")) {
    return "ModemPay";
  }
  if (t.type === "deposit" || t.type === "withdrawal") return "Wallet";
  return t.type;
}

/** Admin comprehensive money book: time, Player ID, deposit/withdraw, agent link. */
export function AdminAccountBook() {
  const [data, setData] = useState<OperationsHubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | "cashdesk" | "modempay" | "other">("all");
  const [typeFilter, setTypeFilter] = useState<"money" | "deposit" | "withdrawal" | "all">("money");

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const type =
        typeFilter === "deposit" || typeFilter === "withdrawal" ? typeFilter : undefined;
      const res = await getOperationsHub({ type, limit: 300 });
      setData(res);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    let list = data.transactions;
    if (typeFilter === "money") {
      list = list.filter((t) => t.type === "deposit" || t.type === "withdrawal");
    }
    if (agentFilter) {
      list = list.filter((t) => t.agentId === agentFilter);
    }
    if (channelFilter !== "all") {
      list = list.filter((t) => {
        const ch = channelLabel(t).toLowerCase();
        if (channelFilter === "cashdesk") return ch === "cash desk";
        if (channelFilter === "modempay") return ch === "modempay";
        return ch !== "cash desk" && ch !== "modempay";
      });
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.id.toLowerCase().includes(q) ||
          (t.userName ?? "").toLowerCase().includes(q) ||
          (t.playerId ?? "").toLowerCase().includes(q) ||
          (t.agentName ?? "").toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.reference.toLowerCase().includes(q),
      );
    }
    return list;
  }, [data, typeFilter, agentFilter, channelFilter, search]);

  const totals = useMemo(() => {
    const deposits = rows
      .filter((t) => t.type === "deposit")
      .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
    const withdrawals = rows
      .filter((t) => t.type === "withdrawal")
      .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
    return { deposits, withdrawals, net: deposits - withdrawals, count: rows.length };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Full account book</h2>
          <p className="text-sm text-slate-400">
            Every deposit and withdrawal with time, Player ID, amount, and agent. Filter by agent or
            cash desk vs ModemPay.
          </p>
        </div>
        <Button variant="secondary" className="gap-2" onClick={() => void load()} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Deposits in view" value={formatXof(totals.deposits)} />
        <StatCard label="Withdrawals in view" value={formatXof(totals.withdrawals)} />
        <StatCard label="Net (dep − wd)" value={formatXof(totals.net)} />
        <StatCard label="Rows" value={totals.count} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          label="Show"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="min-w-[10rem]"
        >
          <option value="money">Deposits + withdrawals</option>
          <option value="deposit">Deposits only</option>
          <option value="withdrawal">Withdrawals only</option>
          <option value="all">All ledger types</option>
        </Select>
        <Select
          label="Channel"
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value as typeof channelFilter)}
          className="min-w-[10rem]"
        >
          <option value="all">All channels</option>
          <option value="cashdesk">Cash desk</option>
          <option value="modempay">ModemPay</option>
          <option value="other">Other</option>
        </Select>
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
              {a.agentSlug ? ` (${a.agentSlug})` : ""}
            </option>
          ))}
        </Select>
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm">
          <span className="text-slate-400">Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Player ID, name, agent, tx…"
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
          />
        </label>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {loading ? (
        <EmptyState message="Loading account book…" />
      ) : rows.length === 0 ? (
        <EmptyState message="No rows match these filters." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Time</Th>
              <Th>Player ID</Th>
              <Th>Customer</Th>
              <Th>Agent</Th>
              <Th className="text-right">Deposit</Th>
              <Th className="text-right">Withdraw</Th>
              <Th>Channel</Th>
              <Th>Details</Th>
              <Th>Tx ID</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const deposit =
                t.type === "deposit" ? Math.abs(Number(t.amount) || 0) : t.amount > 0 && t.type !== "withdrawal" ? Number(t.amount) : 0;
              const withdraw = t.type === "withdrawal" ? Math.abs(Number(t.amount) || 0) : 0;
              const agentHref = t.agentId
                ? `/admin/operations?tab=network&agent=${encodeURIComponent(t.agentId)}`
                : null;
              return (
                <tr key={t.id}>
                  <Td className="whitespace-nowrap text-xs text-slate-400">
                    {t.createdAt ? formatDate(new Date(t.createdAt)) : "—"}
                  </Td>
                  <Td className="font-mono text-sm font-semibold text-emerald-300">
                    {t.playerId ?? "—"}
                  </Td>
                  <Td className="font-medium text-white">{t.userName ?? "—"}</Td>
                  <Td>
                    {t.agentName && agentHref ? (
                      <Link
                        href={agentHref}
                        className="font-medium text-violet-300 hover:underline"
                        title="View this agent's customers"
                      >
                        {t.agentName}
                      </Link>
                    ) : (
                      <span className="text-slate-500">{t.agentName ?? "Direct / none"}</span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums font-semibold text-emerald-300">
                    {deposit > 0 ? formatXof(deposit) : "—"}
                  </Td>
                  <Td className="text-right tabular-nums font-semibold text-amber-200">
                    {withdraw > 0 ? formatXof(withdraw) : "—"}
                  </Td>
                  <Td>
                    <Badge value={channelLabel(t)} />
                  </Td>
                  <Td className="max-w-[14rem] truncate text-xs text-slate-400" title={t.description}>
                    {t.description || "—"}
                  </Td>
                  <Td className="max-w-[6rem] truncate font-mono text-[10px] text-sky-300" title={t.id}>
                    {t.id.slice(0, 10)}…
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}

      <p className="text-xs text-slate-500">
        Also available under{" "}
        <Link href="/admin/operations?tab=transactions" className="text-emerald-400 hover:underline">
          Operations → Transactions
        </Link>{" "}
        and per-agent totals under{" "}
        <Link href="/admin/operations?tab=agents" className="text-emerald-400 hover:underline">
          Operations → Agents / vendors
        </Link>
        .
      </p>
    </div>
  );
}
