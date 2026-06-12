"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatDate, formatSigned } from "@/lib/format";
import type { TransactionType, WalletTransaction } from "@/lib/types";
import { Badge, Card, EmptyState, Select, TableShell, Td, Th } from "@/components/ui";

const TYPES: TransactionType[] = [
  "deposit",
  "withdrawal",
  "bet",
  "win",
  "commission",
  "transfer",
  "refund",
  "bonus",
];

export default function AdminTransactionsPage() {
  const [rows, setRows] = useState<WalletTransaction[] | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState("");

  useEffect(() => {
    const constraints: QueryConstraint[] = [orderBy("createdAt", "desc"), limit(200)];
    if (typeFilter !== "all") {
      constraints.unshift(where("type", "==", typeFilter));
    }
    const q = query(collection(db, "transactions"), ...constraints);
    return onSnapshot(q, (snap) => {
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WalletTransaction));
    });
  }, [typeFilter]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = userFilter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.userId.toLowerCase().includes(q) ||
        r.reference.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
    );
  }, [rows, userFilter]);

  const totals = useMemo(() => {
    let credits = 0;
    let debits = 0;
    for (const r of filtered) {
      if (r.amount >= 0) credits += r.amount;
      else debits += Math.abs(r.amount);
    }
    return { credits, debits, net: credits - debits };
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Transaction ledger</h1>
        <p className="mt-1 text-sm text-slate-400">
          Full audit trail — every wallet movement with before/after balances and references.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase text-slate-500">Credits (filtered)</p>
          <p className="mt-1 text-lg font-bold text-emerald-300">{formatSigned(totals.credits)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-slate-500">Debits (filtered)</p>
          <p className="mt-1 text-lg font-bold text-rose-300">{formatSigned(-totals.debits)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-slate-500">Net</p>
          <p className="mt-1 text-lg font-bold">{formatSigned(totals.net)}</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          label="Type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="min-w-[10rem]"
        >
          <option value="all">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm">
          <span className="text-slate-400">Search user / reference / note</span>
          <input
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            placeholder="User ID, TXN-…, description"
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
          />
        </label>
      </div>

      {!rows ? (
        <EmptyState message="Loading transactions…" />
      ) : filtered.length === 0 ? (
        <EmptyState message="No transactions match your filters." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Type</Th>
              <Th>User</Th>
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
                  {t.createdAt ? formatDate(t.createdAt) : "—"}
                </Td>
                <Td>
                  <Badge value={t.type} />
                </Td>
                <Td>
                  <Link
                    href={`/admin/wallets?uid=${t.userId}`}
                    className="font-mono text-xs text-sky-400 hover:underline"
                  >
                    {t.userId.slice(0, 8)}…
                  </Link>
                </Td>
                <Td
                  className={`font-semibold ${t.amount >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                >
                  {formatSigned(t.amount)}
                </Td>
                <Td className="text-xs text-slate-400">
                  {t.balanceBefore.toLocaleString()} → {t.balanceAfter.toLocaleString()}
                </Td>
                <Td className="font-mono text-[10px] text-slate-500">{t.reference}</Td>
                <Td className="max-w-xs truncate text-xs">
                  <span title={t.description}>{t.description}</span>
                  {t.meta?.adjustedBy ? (
                    <span className="block text-[10px] text-amber-400/80">
                      by admin {String(t.meta.adjustedBy).slice(0, 8)}…
                    </span>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
