"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import {
  fetchModemPayBalances,
  fetchModemPayLiveTransactions,
  formatModemPayDashDate,
  liveMethodLabel,
  maskModemPayAccount,
  minutesSince,
  txDirection,
  type ModemPayBalanceGmd,
  type ModemPayLiveTx,
} from "@/lib/modemPayLive";
import { errorMessage } from "@/lib/api";
import { formatGmd, todayIso } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  Spinner,
  StatCard,
  TableShell,
  Td,
  Th,
} from "@/components/ui";

const PLATFORM_START = "2026-08-01";
const REFRESH_MS = 45_000;

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function txTime(iso: string): number {
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : 0;
}

function statusBadge(status: string): string {
  const s = status.toLowerCase();
  if (s === "completed" || s === "succeeded" || s === "success" || s === "paid") return "completed";
  if (s === "pending" || s === "processing" || s === "pending_review") return "pending";
  if (s === "failed" || s === "cancelled" || s === "canceled" || s === "refunded" || s === "flagged") {
    return "failed";
  }
  return s || "pending";
}

function isCompleted(status: string): boolean {
  return ["completed", "succeeded", "success", "paid"].includes(status.toLowerCase());
}

export function ModemPayLiveMirror({ dedicated = false }: { dedicated?: boolean }) {
  const today = useMemo(() => todayIso(), []);
  const [from, setFrom] = useState(PLATFORM_START);
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("all");
  const [status, setStatus] = useState("completed");
  const [movement, setMovement] = useState("all");
  const [rows, setRows] = useState<ModemPayLiveTx[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [transfersAvailable, setTransfersAvailable] = useState<boolean | null>(null);
  const [balance, setBalance] = useState<ModemPayBalanceGmd | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [autoOn, setAutoOn] = useState(true);

  const searchRef = useRef(search);
  searchRef.current = search;

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const [res, bal] = await Promise.all([
        fetchModemPayLiveTransactions({
          all: true,
          search: searchRef.current.trim() || undefined,
          timeframe: minutesSince(from),
        }),
        fetchModemPayBalances().catch(() => null),
      ]);
      setRows(res.transactions);
      setTotal(res.total);
      setTruncated(!!res.truncated);
      setTransfersAvailable(res.transfersAvailable ?? null);
      setFetchedAt(res.fetchedAt || new Date().toISOString());
      if (bal) setBalance(bal);
    } catch (e) {
      setRows((prev) => prev ?? []);
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [from]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoOn) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void load({ silent: true });
    };
    const id = window.setInterval(tick, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [autoOn, load]);

  const visible = useMemo(() => {
    const fromMs = Date.parse(`${from}T00:00:00.000Z`);
    const toMs = Date.parse(`${to}T23:59:59.999Z`);
    return (rows ?? [])
      .filter((r) => {
        const t = txTime(r.createdAt);
        if (Number.isFinite(fromMs) && t && t < fromMs) return false;
        if (Number.isFinite(toMs) && t && t > toMs) return false;
        const dir = txDirection(r);
        if (movement === "deposits" && dir !== "in") return false;
        if (movement === "withdrawals" && dir !== "out") return false;
        if (status !== "all") {
          const s = r.status.toLowerCase();
          if (status === "completed") {
            if (!isCompleted(s)) return false;
          } else if (s !== status) return false;
        }
        if (method !== "all" && r.paymentMethod.toLowerCase() !== method) return false;
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
          r.customerName.toLowerCase().includes(q) ||
          r.customerPhone.includes(q) ||
          r.reference.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          r.paymentAccount.includes(q)
        );
      })
      .sort((a, b) => txTime(b.createdAt) - txTime(a.createdAt));
  }, [rows, from, to, movement, status, method, search]);

  const totals = useMemo(() => {
    let deposits = 0;
    let withdrawals = 0;
    let depositCount = 0;
    let withdrawCount = 0;
    for (const r of visible) {
      const amt = Math.abs(Number(r.amount) || 0);
      if (txDirection(r) === "out") {
        withdrawals += amt;
        withdrawCount += 1;
      } else {
        deposits += amt;
        depositCount += 1;
      }
    }
    return { deposits, withdrawals, net: deposits - withdrawals, depositCount, withdrawCount };
  }, [visible]);

  function exportCsv() {
    const header = [
      "Amount",
      "Direction",
      "Currency",
      "Status",
      "Payment method",
      "Account",
      "Customer",
      "Phone",
      "Type",
      "Source",
      "Date (Gambia)",
      "Date ISO",
      "Reference",
    ];
    const lines = [
      header.join(","),
      ...visible.map((r) =>
        [
          Math.abs(Number(r.amount) || 0),
          txDirection(r) === "out" ? "withdraw" : "deposit",
          r.currency,
          r.status,
          r.paymentMethod,
          r.paymentAccount,
          `"${r.customerName.replace(/"/g, '""')}"`,
          r.customerPhone,
          r.type,
          r.source,
          formatModemPayDashDate(r.createdAt),
          r.createdAt,
          r.reference || r.id,
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `modempay-live-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {dedicated ? (
            <>
              <p className="text-xs font-bold uppercase tracking-widest text-sky-400">ModemPay merchant account</p>
              <h1 className="text-xl font-bold text-white">Live deposits and withdrawals</h1>
            </>
          ) : (
            <h2 className="text-lg font-semibold text-white">ModemPay live account</h2>
          )}
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Same feed as ModemPay&apos;s own dashboard — deposits in, withdrawals out, same MP-
            references and Gambia times (GMT). This is not shop cash and not BETESE&apos;s internal
            ledger.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span
            className={`inline-flex h-2 w-2 rounded-full ${autoOn ? "animate-pulse bg-emerald-400" : "bg-slate-600"}`}
          />
          {fetchedAt ? `Updated ${formatModemPayDashDate(fetchedAt)}` : "Waiting…"}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Deposits in"
          value={formatGmd(totals.deposits)}
          hint={`${totals.depositCount} payment${totals.depositCount === 1 ? "" : "s"} in this view`}
        />
        <StatCard
          label="Withdrawals out"
          value={formatGmd(totals.withdrawals)}
          hint={`${totals.withdrawCount} payout${totals.withdrawCount === 1 ? "" : "s"} in this view`}
        />
        <StatCard label="Net (in − out)" value={formatGmd(totals.net)} hint="Completed filter applies below" />
        <StatCard
          label="ModemPay balance"
          value={balance?.available != null ? formatGmd(balance.available) : "—"}
          hint={balance?.pending != null ? `Pending ${formatGmd(balance.pending)}` : "Live from ModemPay"}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="relative min-w-[14rem] flex-1 text-sm">
          <span className="mb-1 block text-slate-300">Search</span>
          <Search className="pointer-events-none absolute left-3 top-[2.15rem] h-4 w-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Customer, phone, MP- reference…"
            className="w-full rounded-lg border border-white/10 bg-slate-950/70 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
          />
        </label>
        <Input label="From" type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} max={today} min={from} onChange={(e) => setTo(e.target.value)} />
        <div className="flex gap-1 pb-0.5">
          <Button type="button" variant="ghost" className="px-2 py-2 text-xs" onClick={() => { setFrom(today); setTo(today); }}>
            Today
          </Button>
          <Button type="button" variant="ghost" className="px-2 py-2 text-xs" onClick={() => { setFrom(daysAgoIso(6)); setTo(today); }}>
            7 days
          </Button>
          <Button type="button" variant="ghost" className="px-2 py-2 text-xs" onClick={() => { setFrom(PLATFORM_START); setTo(today); }}>
            Since launch
          </Button>
        </div>
        <Select label="Payment method" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="all">All</option>
          <option value="wave">Wave</option>
          <option value="afrimoney">AfriMoney</option>
          <option value="aps">APS</option>
          <option value="qmoney">QMoney</option>
          <option value="card">Card</option>
        </Select>
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="all">All</option>
        </Select>
        <Select label="Movement" value={movement} onChange={(e) => setMovement(e.target.value)}>
          <option value="all">Deposits + withdrawals</option>
          <option value="deposits">Deposits in</option>
          <option value="withdrawals">Withdrawals out</option>
        </Select>
        <Button type="button" variant="secondary" className="inline-flex items-center gap-2" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} className={loading ? "animate-spin" : undefined} />
          Refresh
        </Button>
        <Button
          type="button"
          variant={autoOn ? "success" : "secondary"}
          className="text-xs"
          onClick={() => setAutoOn((v) => !v)}
        >
          {autoOn ? "Auto 45s on" : "Auto off"}
        </Button>
        <Button type="button" variant="secondary" className="inline-flex items-center gap-2" onClick={exportCsv} disabled={!visible.length}>
          <Download size={16} /> Export
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 text-sm text-slate-400">
        <span>
          Showing <strong className="text-white">{visible.length}</strong>
          {total != null ? ` of ${total} pulled from ModemPay` : ""}
        </span>
        {transfersAvailable === false ? (
          <span className="text-amber-200">Payouts come from the transactions feed (transfers list not available).</span>
        ) : transfersAvailable ? (
          <span className="text-sky-300">Payments and payouts merged from ModemPay.</span>
        ) : null}
        {truncated ? (
          <span className="text-amber-200">List was capped — widen the dates or refresh if a row is missing.</span>
        ) : null}
      </div>

      {error ? (
        <Card className="border-amber-500/30 bg-amber-500/5 text-sm text-amber-100">
          Could not load ModemPay live list: {error}. Deploy functions if this is a new route, then
          refresh.
        </Card>
      ) : null}

      {loading && !rows ? (
        <Spinner label="Loading ModemPay transactions…" />
      ) : !visible.length ? (
        <EmptyState message="No ModemPay transactions in this date range." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Amount</Th>
              <Th>Status</Th>
              <Th>Payment method</Th>
              <Th>Customer</Th>
              <Th>Type</Th>
              <Th>Source</Th>
              <Th>Date</Th>
              <Th>Reference</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const dir = txDirection(r);
              const out = dir === "out";
              return (
                <tr key={r.id || r.reference}>
                  <Td className={`font-semibold tabular-nums ${out ? "text-rose-300" : "text-emerald-300"}`}>
                    {out ? "−" : "+"}
                    {r.currency || "GMD"} {Math.abs(Number(r.amount) || 0).toFixed(2)}
                  </Td>
                  <Td>
                    <Badge value={statusBadge(r.status)} />
                  </Td>
                  <Td>
                    <span className="block text-sm text-slate-200">
                      {liveMethodLabel(r.paymentMethod)}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {maskModemPayAccount(r.paymentAccount || r.customerPhone)}
                    </span>
                  </Td>
                  <Td className="font-medium text-white">{r.customerName || "—"}</Td>
                  <Td>
                    <span className="capitalize text-slate-300">{r.type || (out ? "transfer" : "payment")}</span>
                    <span className={`ml-2 text-[11px] font-semibold uppercase ${out ? "text-rose-400" : "text-emerald-400"}`}>
                      {out ? "out" : "in"}
                    </span>
                  </Td>
                  <Td className="capitalize text-sky-300">{r.source || "online"}</Td>
                  <Td className="whitespace-nowrap text-xs text-slate-400">
                    {formatModemPayDashDate(r.createdAt)}
                  </Td>
                  <Td className="font-mono text-[11px] text-slate-400">{r.reference || r.id}</Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
