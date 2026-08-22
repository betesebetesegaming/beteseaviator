"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where, type Timestamp } from "firebase/firestore";
import { db } from "@/lib/firestore";
import type { RtdbDepositRecord } from "@/lib/payments/rtdbRecords";

const IN_CHUNK = 30;

function toIso(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "toDate" in value) {
    try {
      return (value as Timestamp).toDate().toISOString();
    } catch {
      return "";
    }
  }
  if (typeof value === "object" && value && "seconds" in value) {
    const seconds = Number((value as { seconds: number }).seconds);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  }
  return "";
}

function isRealCustomerDeposit(data: Record<string, unknown>): boolean {
  const source = String((data.meta as { source?: string } | undefined)?.source || "").toLowerCase();
  if (source === "wallet_repair" || source === "qtech_repair") return false;
  const desc = String(data.description || "").toLowerCase();
  if (desc.includes("wallet repair")) return false;
  return true;
}

export function transactionToDepositRecord(
  id: string,
  data: Record<string, unknown>
): RtdbDepositRecord | null {
  const customerId = String(data.userId || "");
  const amount = Math.abs(Number(data.amount) || 0);
  if (!customerId || amount <= 0 || !isRealCustomerDeposit(data)) return null;
  const status = String(data.status || "completed");
  return {
    id,
    customer_id: customerId,
    customer_name: (data.userName as string | undefined) ?? null,
    amount,
    method: String((data.meta as { source?: string } | undefined)?.source || "ledger"),
    status,
    timestamp: toIso(data.createdAt) || toIso(data.timestamp),
    verification_status: status.toLowerCase() === "completed" ? "verified" : status,
  };
}

function docsToRows(docs: { id: string; data: () => Record<string, unknown> }[]): RtdbDepositRecord[] {
  const rows: RtdbDepositRecord[] = [];
  for (const doc of docs) {
    const row = transactionToDepositRecord(doc.id, doc.data());
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * Customer deposits from the Firestore ledger (Wave + cash + any completed
 * payment). Use this for first vs continue — Wave RTDB alone can miss an
 * earlier first payment and treat a later top-up as first.
 */
export function useLedgerDeposits(opts: {
  customerIds?: Set<string> | null;
  all?: boolean;
}): { deposits: RtdbDepositRecord[] | null } {
  const [deposits, setDeposits] = useState<RtdbDepositRecord[] | null>(null);
  const customerKey = useMemo(() => {
    if (opts.all) return "all";
    if (!opts.customerIds) return "";
    return [...opts.customerIds].sort().join(",");
  }, [opts.all, opts.customerIds]);

  useEffect(() => {
    if (opts.all) {
      const q = query(collection(db, "transactions"), where("type", "==", "deposit"));
      return onSnapshot(q, (snap) => setDeposits(docsToRows(snap.docs)));
    }
    if (!opts.customerIds) {
      setDeposits(null);
      return;
    }
    const ids = [...opts.customerIds];
    if (ids.length === 0) {
      setDeposits([]);
      return;
    }
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += IN_CHUNK) chunks.push(ids.slice(i, i + IN_CHUNK));
    const bucket = new Map<number, RtdbDepositRecord[]>();
    const unsubs = chunks.map((chunk, index) =>
      onSnapshot(
        query(
          collection(db, "transactions"),
          where("type", "==", "deposit"),
          where("userId", "in", chunk)
        ),
        (snap) => {
          bucket.set(index, docsToRows(snap.docs));
          setDeposits([...bucket.values()].flat());
        }
      )
    );
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [customerKey, opts.all, opts.customerIds]);

  return { deposits };
}
