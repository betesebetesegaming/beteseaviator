"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firestore";
import { formatXof, formatDate } from "@/lib/format";
import { Badge, EmptyState, Select, Spinner, TableShell, Td, Th } from "@/components/ui";

type WithdrawalStatus = "Pending" | "Processing" | "Completed" | "Failed" | "Canceled" | "all";

interface ModemPayWithdrawal {
  id: string;
  user_name?: string;
  user_id?: string;
  amount?: number;
  status?: string;
  requested_at?: string;
  payout_method?: string;
  recipient_phone?: string;
  failure_reason?: string;
}

const STATUS_FILTERS: WithdrawalStatus[] = ["Pending", "Processing", "Completed", "Failed", "all"];

export default function AdminWithdrawalsPage() {
  const [requests, setRequests] = useState<ModemPayWithdrawal[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<WithdrawalStatus>("Pending");

  useEffect(() => {
    const q = query(collection(db, "withdrawal_requests"), orderBy("requested_at", "desc"), limit(300));
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ModemPayWithdrawal));
    });
  }, []);

  const filtered = useMemo(() => {
    if (!requests) return null;
    return requests.filter((r) => statusFilter === "all" || r.status === statusFilter);
  }, [requests, statusFilter]);

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold">Withdrawal queue</h1>
        <p className="text-sm text-slate-400">
          ModemPay mobile-money payouts — Pending and Processing requests are in flight. Completed
          and Failed show the final outcome. For day / week / month totals and fee reconciliation, open{" "}
          <a href="/admin/accounts?tab=modempay" className="text-emerald-400 hover:underline">
            Accounts → ModemPay ledger
          </a>
          .
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
              statusFilter === s
                ? "bg-emerald-500 text-slate-950"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {s === "all" ? "All" : s}
          </button>
        ))}
      </div>

      {!filtered ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState message="No withdrawals in this status." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th>Amount</Th>
              <Th>Provider</Th>
              <Th>Payout phone</Th>
              <Th>Requested</Th>
              <Th>Status</Th>
              <Th>Note</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <Td>
                  <div className="font-medium">{r.user_name ?? r.user_id?.slice(0, 8) ?? "—"}</div>
                  <div className="text-xs text-slate-500">{r.id}</div>
                </Td>
                <Td className="font-semibold tabular-nums">{formatXof(r.amount ?? 0)}</Td>
                <Td>{r.payout_method ?? "—"}</Td>
                <Td className="tabular-nums">{r.recipient_phone ?? "—"}</Td>
                <Td className="text-slate-500">
                  {r.requested_at ? formatDate(new Date(r.requested_at)) : "—"}
                </Td>
                <Td>
                  <Badge value={(r.status ?? "pending").toLowerCase()} />
                </Td>
                <Td className="max-w-xs truncate text-xs text-slate-500">
                  {r.failure_reason ?? "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
