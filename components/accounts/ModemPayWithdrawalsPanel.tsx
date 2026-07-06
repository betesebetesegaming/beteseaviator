"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeWithdrawals } from "@/lib/payments/rtdbClient";
import type { RtdbWithdrawalRecord } from "@/lib/payments/rtdbRecords";
import { filterModemPayWithdrawals, sumModemPayAmount } from "@/lib/modemPayAccounting";
import { formatDate, formatXof } from "@/lib/format";
import { Badge, EmptyState, Input, Spinner, StatCard, TableShell, Td, Th } from "@/components/ui";

export function ModemPayWithdrawalsPanel({
  customerIds,
  customerNames,
  scopeLabel,
}: {
  customerIds?: Set<string> | null;
  customerNames?: Map<string, string>;
  scopeLabel: string;
}) {
  const [rows, setRows] = useState<RtdbWithdrawalRecord[] | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "pending">("all");

  useEffect(() => {
    return subscribeWithdrawals(undefined, setRows);
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const status =
      statusFilter === "completed" ? "completed" : statusFilter === "pending" ? "pending" : "all";
    let list = filterModemPayWithdrawals(rows, { customerIds, status: status === "all" ? undefined : status });
    const q = search.trim().toLowerCase();
    if (!q) return list.slice(0, 200);
    return list
      .filter(
        (r) =>
          (r.user_name ?? "").toLowerCase().includes(q) ||
          (r.user_id ?? "").toLowerCase().includes(q) ||
          (r.id ?? "").toLowerCase().includes(q) ||
          (r.recipient_phone ?? "").includes(q)
      )
      .slice(0, 200);
  }, [rows, customerIds, search, statusFilter]);

  const completedTotal = useMemo(() => {
    if (!rows) return 0;
    return sumModemPayAmount(
      filterModemPayWithdrawals(rows, { customerIds, status: "completed" })
    );
  }, [rows, customerIds]);

  const pendingCount = useMemo(() => {
    if (!rows) return 0;
    return filterModemPayWithdrawals(rows, { customerIds, status: "pending" }).length;
  }, [rows, customerIds]);

  if (!rows) return <Spinner label="Loading ModemPay withdrawals…" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        {scopeLabel} — payouts sent to customer mobile money via ModemPay.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Completed payouts" value={formatXof(completedTotal)} />
        <StatCard label="Pending / processing" value={pendingCount} />
      </div>
      <div className="flex flex-wrap gap-3">
        <Input
          label="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Customer, phone, ID…"
          className="min-w-[14rem] flex-1"
        />
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            <option value="all">All</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending / Processing</option>
          </select>
        </label>
      </div>
      {!filtered?.length ? (
        <EmptyState message="No ModemPay withdrawals in this scope." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Customer</Th>
              <Th>Amount</Th>
              <Th>Payout phone</Th>
              <Th>Method</Th>
              <Th>Status</Th>
              <Th>Note</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-xs text-slate-400">
                  {r.requested_at ? formatDate(new Date(r.requested_at)) : "—"}
                </Td>
                <Td>
                  <span className="block font-medium text-white">
                    {r.user_name || customerNames?.get(r.user_id) || "—"}
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">{r.id}</span>
                </Td>
                <Td className="font-semibold tabular-nums text-rose-300">{formatXof(r.amount)}</Td>
                <Td className="tabular-nums">{r.recipient_phone || "—"}</Td>
                <Td>{r.payout_method || "—"}</Td>
                <Td>
                  <Badge value={String(r.status || "pending").toLowerCase()} />
                </Td>
                <Td className="max-w-xs truncate text-xs text-slate-500">{r.failure_reason || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
