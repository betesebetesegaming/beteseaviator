"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeDeposits } from "@/lib/payments/rtdbClient";
import type { RtdbDepositRecord } from "@/lib/payments/rtdbRecords";
import { filterModemPayDeposits, sumModemPayAmount } from "@/lib/modemPayAccounting";
import { formatDate, formatXof } from "@/lib/format";
import { Badge, EmptyState, Input, Spinner, StatCard, TableShell, Td, Th } from "@/components/ui";

export function ModemPayDepositsPanel({
  customerIds,
  customerNames,
  scopeLabel,
}: {
  customerIds?: Set<string> | null;
  customerNames?: Map<string, string>;
  scopeLabel: string;
}) {
  const [rows, setRows] = useState<RtdbDepositRecord[] | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "pending">("all");

  useEffect(() => {
    return subscribeDeposits(undefined, setRows);
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return null;
    let list = filterModemPayDeposits(rows, { customerIds });
    if (statusFilter === "completed") {
      list = list.filter((r) => String(r.status || "").toLowerCase() === "completed" || r.verification_status === "Verified");
    } else if (statusFilter === "pending") {
      list = list.filter((r) => String(r.status || "").toLowerCase() === "pending");
    }
    const q = search.trim().toLowerCase();
    if (!q) return list.slice(0, 200);
    return list
      .filter(
        (r) =>
          (r.customer_name ?? "").toLowerCase().includes(q) ||
          r.customer_id.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          (r.transaction_id ?? "").toLowerCase().includes(q)
      )
      .slice(0, 200);
  }, [rows, customerIds, search, statusFilter]);

  const completedTotal = useMemo(() => {
    if (!rows) return 0;
    return sumModemPayAmount(
      filterModemPayDeposits(rows, { customerIds, successfulOnly: true })
    );
  }, [rows, customerIds]);

  if (!rows) return <Spinner label="Loading ModemPay deposits…" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        {scopeLabel} — deposits paid in via ModemPay (Wave, Afrimoney, etc.).
      </p>
      <StatCard label="Successful deposits (all time in view)" value={formatXof(completedTotal)} />
      <div className="flex flex-wrap gap-3">
        <Input
          label="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Customer, ID, transaction…"
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
            <option value="pending">Pending</option>
          </select>
        </label>
      </div>
      {!filtered?.length ? (
        <EmptyState message="No ModemPay deposits in this scope." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Customer</Th>
              <Th>Amount</Th>
              <Th>Method</Th>
              <Th>Status</Th>
              <Th>Reference</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-xs text-slate-400">
                  {r.timestamp ? formatDate(new Date(r.timestamp)) : "—"}
                </Td>
                <Td>
                  <span className="block font-medium text-white">
                    {r.customer_name || customerNames?.get(r.customer_id) || "—"}
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">{r.customer_id.slice(0, 10)}…</span>
                </Td>
                <Td className="font-semibold tabular-nums text-emerald-300">{formatXof(r.amount)}</Td>
                <Td>{r.method || "—"}</Td>
                <Td>
                  <Badge value={String(r.status || "pending").toLowerCase()} />
                </Td>
                <Td className="max-w-[8rem] truncate font-mono text-[10px] text-slate-500">
                  {r.transaction_id || r.provider_reference || r.id}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
