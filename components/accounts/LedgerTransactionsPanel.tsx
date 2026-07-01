"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getOperationsHub, type OperationsHubResponse, errorMessage } from "@/lib/api";
import { formatDate, formatSigned } from "@/lib/format";
import type { TransactionType } from "@/lib/types";
import { Badge, Button, EmptyState, Select, TableShell, Td, Th } from "@/components/ui";

const TX_TYPES: TransactionType[] = [
  "deposit",
  "withdrawal",
  "bet",
  "win",
  "commission",
  "transfer",
  "refund",
  "bonus",
];

export function LedgerTransactionsPanel({ scopeLabel }: { scopeLabel: string }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<OperationsHubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await getOperationsHub({
        type: typeFilter === "all" ? undefined : typeFilter,
        limit: 250,
      });
      setData(res);
    } catch (e) {
      console.error(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.transactions;
    return data.transactions.filter(
      (t) =>
        t.userId.toLowerCase().includes(q) ||
        (t.userName ?? "").toLowerCase().includes(q) ||
        t.reference.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  }, [data, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-slate-400">{scopeLabel} — every wallet movement (bets, wins, deposits, commissions).</p>
        <Button variant="secondary" className="gap-2" onClick={() => void load()} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <Select label="Type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="min-w-[10rem]">
          <option value="all">All types</option>
          {TX_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <InputSearch value={search} onChange={setSearch} />
      </div>
      {loading ? (
        <EmptyState message="Loading transactions…" />
      ) : filtered.length === 0 ? (
        <EmptyState message="No transactions in this scope." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>User</Th>
              <Th>Type</Th>
              <Th>Amount</Th>
              <Th>Balance</Th>
              <Th>Reference</Th>
              <Th>Details</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id}>
                <Td className="whitespace-nowrap text-xs text-slate-400">
                  {t.createdAt ? formatDate(new Date(t.createdAt)) : "—"}
                </Td>
                <Td>
                  <span className="block font-medium text-white">{t.userName ?? "—"}</span>
                  <span className="font-mono text-[10px] text-slate-500">{t.userId.slice(0, 10)}…</span>
                </Td>
                <Td>
                  <Badge value={t.type} />
                </Td>
                <Td className={`font-semibold ${t.amount >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {formatSigned(t.amount)}
                </Td>
                <Td className="text-xs text-slate-400">
                  {t.balanceBefore.toLocaleString()} → {t.balanceAfter.toLocaleString()}
                </Td>
                <Td className="font-mono text-[10px] text-slate-500">{t.reference}</Td>
                <Td className="max-w-xs truncate text-xs">{t.description}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}

function InputSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm">
      <span className="text-slate-400">Search</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Name, user ID, reference…"
        className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
      />
    </label>
  );
}
