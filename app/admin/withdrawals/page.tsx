"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firestore";
import { adminResolvePayment, errorMessage } from "@/lib/api";
import { formatXof, formatDate } from "@/lib/format";
import { PROVIDER_LABELS, type PaymentRequest, type PaymentStatus } from "@/lib/types";
import {
  Badge,
  Button,
  EmptyState,
  Select,
  Spinner,
  TableShell,
  Td,
  Th,
} from "@/components/ui";

const STATUS_FILTERS: (PaymentStatus | "all")[] = [
  "pending",
  "approved",
  "paid",
  "rejected",
  "failed",
  "all",
];

export default function AdminWithdrawalsPage() {
  const [requests, setRequests] = useState<PaymentRequest[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "all">("pending");
  const [typeFilter, setTypeFilter] = useState<"withdrawal" | "deposit" | "all">("withdrawal");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "paymentRequests"), orderBy("createdAt", "desc"), limit(300));
    return onSnapshot(q, (snap) => {
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PaymentRequest));
    });
  }, []);

  const filtered = useMemo(() => {
    if (!requests) return null;
    return requests.filter(
      (r) =>
        (statusFilter === "all" || r.status === statusFilter) &&
        (typeFilter === "all" || r.type === typeFilter)
    );
  }, [requests, statusFilter, typeFilter]);

  async function resolve(r: PaymentRequest, action: "approve" | "reject") {
    setBusyId(r.id);
    try {
      const res = await adminResolvePayment({ requestId: r.id, action });
      toast.success(
        action === "approve"
          ? `Approved — ${r.type} marked ${res.status}.`
          : "Rejected — funds returned to the requester."
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold">Payout Queue</h1>
        <p className="text-sm text-slate-400">
          Customer winnings and agent commission withdrawals. Approve to release the payout,
          reject to refund instantly. Deposits awaiting confirmation can also be settled here.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="w-40">
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          >
            <option value="withdrawal">Withdrawals</option>
            <option value="deposit">Deposits</option>
            <option value="all">All types</option>
          </Select>
        </div>
        <div className="flex flex-wrap gap-1.5">
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
              {s}
            </button>
          ))}
        </div>
      </div>

      {!filtered ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState message="Nothing here." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Requester</Th>
              <Th>Kind</Th>
              <Th>Amount</Th>
              <Th>Provider</Th>
              <Th>Payout Phone</Th>
              <Th>Date</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <Td>
                  <div className="font-medium">{r.userName ?? r.userId.slice(0, 8)}</div>
                  <div className="text-xs text-slate-500">
                    {r.userRole === "player"
                      ? "customer · winnings"
                      : r.userRole
                        ? "agent · commission"
                        : ""}
                  </div>
                </Td>
                <Td>
                  <Badge value={r.type} />
                </Td>
                <Td className="font-semibold tabular-nums">{formatXof(r.amount)}</Td>
                <Td>{PROVIDER_LABELS[r.provider] ?? r.provider}</Td>
                <Td className="tabular-nums">{r.meta?.phone ?? "—"}</Td>
                <Td className="text-slate-500">{formatDate(r.createdAt)}</Td>
                <Td>
                  <Badge value={r.status} />
                </Td>
                <Td>
                  {r.status === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        variant="success"
                        className="!px-2.5 !py-1 text-xs"
                        disabled={busyId === r.id}
                        onClick={() => resolve(r, "approve")}
                      >
                        Approve & Pay
                      </Button>
                      <Button
                        variant="danger"
                        className="!px-2.5 !py-1 text-xs"
                        disabled={busyId === r.id}
                        onClick={() => resolve(r, "reject")}
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
