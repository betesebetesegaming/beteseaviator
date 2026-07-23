"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeDeposits, subscribeWithdrawals } from "@/lib/payments/rtdbClient";
import type { RtdbDepositRecord, RtdbWithdrawalRecord } from "@/lib/payments/rtdbRecords";
import {
  filterModemPayDeposits,
  filterModemPayWithdrawals,
  groupModemPayCashByDay,
  summarizeModemPayPeriod,
} from "@/lib/modemPayAccounting";
import { monthRangeIso, weekRangeIso } from "@/lib/ggrAccounting";
import { formatDate, formatXof, todayIso } from "@/lib/format";
import {
  Badge,
  Card,
  EmptyState,
  Input,
  Spinner,
  StatCard,
  TableShell,
  Td,
  Th,
} from "@/components/ui";

type PeriodKey = "today" | "week" | "month";
type TxView = "deposits" | "payouts" | "daily";

function periodRange(key: PeriodKey): { from: string; to: string; label: string } {
  const today = todayIso();
  if (key === "today") return { from: today, to: today, label: `Today (${today})` };
  if (key === "week") {
    const w = weekRangeIso();
    return { from: w.from, to: w.to, label: `This week (${w.from} → ${w.to})` };
  }
  const m = monthRangeIso();
  return { from: m.from, to: m.to, label: `This month (${m.label})` };
}

export function ModemPayLedger({
  customerIds,
  customerNames,
  scopeLabel,
}: {
  customerIds?: Set<string> | null;
  customerNames?: Map<string, string>;
  scopeLabel: string;
}) {
  const [deposits, setDeposits] = useState<RtdbDepositRecord[] | null>(null);
  const [withdrawals, setWithdrawals] = useState<RtdbWithdrawalRecord[] | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [txView, setTxView] = useState<TxView>("daily");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "pending">("completed");

  useEffect(() => {
    const unsubD = subscribeDeposits(undefined, setDeposits);
    const unsubW = subscribeWithdrawals(undefined, setWithdrawals);
    return () => {
      unsubD();
      unsubW();
    };
  }, []);

  const today = useMemo(() => todayIso(), []);
  const week = useMemo(() => weekRangeIso(), []);
  const month = useMemo(() => monthRangeIso(), []);
  const active = useMemo(() => periodRange(period), [period]);

  const snapToday = useMemo(() => {
    if (!deposits || !withdrawals) return null;
    return summarizeModemPayPeriod(deposits, withdrawals, today, today, customerIds);
  }, [deposits, withdrawals, today, customerIds]);

  const snapWeek = useMemo(() => {
    if (!deposits || !withdrawals) return null;
    return summarizeModemPayPeriod(deposits, withdrawals, week.from, week.to, customerIds);
  }, [deposits, withdrawals, week.from, week.to, customerIds]);

  const snapMonth = useMemo(() => {
    if (!deposits || !withdrawals) return null;
    return summarizeModemPayPeriod(deposits, withdrawals, month.from, month.to, customerIds);
  }, [deposits, withdrawals, month.from, month.to, customerIds]);

  const activeSnap = useMemo(() => {
    if (!deposits || !withdrawals) return null;
    return summarizeModemPayPeriod(deposits, withdrawals, active.from, active.to, customerIds);
  }, [deposits, withdrawals, active.from, active.to, customerIds]);

  const dailyRows = useMemo(() => {
    if (!deposits || !withdrawals) return null;
    const map = groupModemPayCashByDay(deposits, withdrawals, active.from, active.to, customerIds);
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, bucket]) => ({
        date,
        ...bucket,
        net: Math.round((bucket.deposits - bucket.withdrawals) * 100) / 100,
      }));
  }, [deposits, withdrawals, active.from, active.to, customerIds]);

  const depositRows = useMemo(() => {
    if (!deposits) return null;
    let list = filterModemPayDeposits(deposits, {
      from: active.from,
      to: active.to,
      customerIds,
      successfulOnly: statusFilter === "completed",
    });
    if (statusFilter === "pending") {
      list = filterModemPayDeposits(deposits, { from: active.from, to: active.to, customerIds }).filter(
        (r) => String(r.status || "").toLowerCase() === "pending"
      );
    } else if (statusFilter === "all") {
      list = filterModemPayDeposits(deposits, { from: active.from, to: active.to, customerIds });
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          (r.customer_name ?? "").toLowerCase().includes(q) ||
          (r.customer_id ?? "").toLowerCase().includes(q) ||
          (r.id ?? "").toLowerCase().includes(q) ||
          (r.transaction_id ?? "").toLowerCase().includes(q) ||
          (r.provider_reference ?? "").toLowerCase().includes(q)
      );
    }
    return list.slice(0, 300);
  }, [deposits, active.from, active.to, customerIds, search, statusFilter]);

  const payoutRows = useMemo(() => {
    if (!withdrawals) return null;
    const status =
      statusFilter === "completed" ? "completed" : statusFilter === "pending" ? "pending" : "all";
    let list = filterModemPayWithdrawals(withdrawals, {
      from: active.from,
      to: active.to,
      customerIds,
      status: status === "all" ? undefined : status,
    });
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          (r.user_name ?? "").toLowerCase().includes(q) ||
          (r.user_id ?? "").toLowerCase().includes(q) ||
          (r.id ?? "").toLowerCase().includes(q) ||
          (r.recipient_phone ?? "").includes(q) ||
          (r.external_ref ?? "").toLowerCase().includes(q)
      );
    }
    return list
      .slice()
      .sort((a, b) => String(b.requested_at || "").localeCompare(String(a.requested_at || "")))
      .slice(0, 300);
  }, [withdrawals, active.from, active.to, customerIds, search, statusFilter]);

  if (!deposits || !withdrawals || !snapToday || !snapWeek || !snapMonth || !activeSnap) {
    return <Spinner label="Loading ModemPay ledger…" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">ModemPay cash ledger</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          {scopeLabel}. Use this to match Wave / AfriMoney money against ModemPay service fees —
          every successful deposit and payout is listed with day / week / month totals.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <PeriodSnapCard
          title="Today"
          hint={today}
          active={period === "today"}
          onClick={() => setPeriod("today")}
          snap={snapToday}
        />
        <PeriodSnapCard
          title="This week"
          hint={`${week.from} → ${week.to}`}
          active={period === "week"}
          onClick={() => setPeriod("week")}
          snap={snapWeek}
        />
        <PeriodSnapCard
          title="This month"
          hint={month.label}
          active={period === "month"}
          onClick={() => setPeriod("month")}
          snap={snapMonth}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={`Deposits · ${periodLabelShort(period)}`}
          value={formatXof(activeSnap.deposits)}
          hint={`${activeSnap.depositCount} successful`}
        />
        <StatCard
          label={`Payouts · ${periodLabelShort(period)}`}
          value={formatXof(activeSnap.withdrawals)}
          hint={`${activeSnap.withdrawalCount} completed`}
        />
        <StatCard
          label={`Net (deposits − payouts)`}
          value={formatXof(activeSnap.net)}
          hint="Cash through ModemPay for fee checks"
        />
        <StatCard
          label="Pending payouts"
          value={formatXof(activeSnap.pendingPayouts)}
          hint={`${activeSnap.pendingPayoutCount} in flight`}
        />
      </div>

      <Card className="!p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-950/60 p-1">
            {(
              [
                { id: "daily" as const, label: "Daily breakdown" },
                { id: "deposits" as const, label: "Deposit transactions" },
                { id: "payouts" as const, label: "Payout transactions" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTxView(t.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  txView === t.id
                    ? "bg-emerald-500 text-slate-950"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">{active.label}</p>
        </div>
      </Card>

      {txView !== "daily" ? (
        <div className="flex flex-wrap gap-3">
          <Input
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Customer, phone, reference…"
            className="min-w-[14rem] flex-1"
          />
          <label className="text-sm">
            <span className="mb-1 block text-slate-400">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              <option value="completed">Successful only</option>
              <option value="pending">Pending / processing</option>
              <option value="all">All statuses</option>
            </select>
          </label>
        </div>
      ) : null}

      {txView === "daily" ? (
        !dailyRows?.length ? (
          <EmptyState message={`No successful ModemPay activity for ${active.label}.`} />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Deposits</Th>
                <Th>#</Th>
                <Th>Payouts</Th>
                <Th>#</Th>
                <Th>Net</Th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.map((row) => (
                <tr key={row.date}>
                  <Td className="font-medium text-white">{row.date}</Td>
                  <Td className="tabular-nums text-emerald-300">{formatXof(row.deposits)}</Td>
                  <Td className="tabular-nums text-slate-400">{row.depositCount}</Td>
                  <Td className="tabular-nums text-rose-300">{formatXof(row.withdrawals)}</Td>
                  <Td className="tabular-nums text-slate-400">{row.withdrawalCount}</Td>
                  <Td className="font-semibold tabular-nums text-amber-100">{formatXof(row.net)}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )
      ) : null}

      {txView === "deposits" ? (
        !depositRows?.length ? (
          <EmptyState message="No ModemPay deposits in this period." />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Customer</Th>
                <Th>Amount</Th>
                <Th>Method</Th>
                <Th>Status</Th>
                <Th>ModemPay reference</Th>
              </tr>
            </thead>
            <tbody>
              {depositRows.map((r, i) => (
                <tr key={r.id || `deposit-${i}`}>
                  <Td className="whitespace-nowrap text-xs text-slate-400">
                    {r.timestamp ? formatDate(new Date(r.timestamp)) : "—"}
                  </Td>
                  <Td>
                    <span className="block font-medium text-white">
                      {r.customer_name || customerNames?.get(r.customer_id) || "—"}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      {r.customer_id ? `${r.customer_id.slice(0, 10)}…` : "—"}
                    </span>
                  </Td>
                  <Td className="font-semibold tabular-nums text-emerald-300">
                    {formatXof(Number(r.amount) || 0)}
                  </Td>
                  <Td>{r.method || "—"}</Td>
                  <Td>
                    <Badge value={String(r.status || "pending").toLowerCase()} />
                  </Td>
                  <Td className="max-w-[10rem] truncate font-mono text-[10px] text-slate-500">
                    {r.transaction_id || r.provider_reference || r.id}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )
      ) : null}

      {txView === "payouts" ? (
        !payoutRows?.length ? (
          <EmptyState message="No ModemPay payouts in this period." />
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
                <Th>Reference / note</Th>
              </tr>
            </thead>
            <tbody>
              {payoutRows.map((r) => (
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
                  <Td className="max-w-xs truncate text-xs text-slate-500">
                    {r.external_ref || r.failure_reason || "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )
      ) : null}
    </div>
  );
}

function periodLabelShort(period: PeriodKey): string {
  if (period === "today") return "today";
  if (period === "week") return "this week";
  return "this month";
}

function PeriodSnapCard({
  title,
  hint,
  snap,
  active,
  onClick,
}: {
  title: string;
  hint: string;
  snap: ReturnType<typeof summarizeModemPayPeriod>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition ${
        active
          ? "border-emerald-400/50 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(52,211,153,0.25)]"
          : "border-white/10 bg-slate-900/70 hover:border-white/20"
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
      <div className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-slate-400">In</span>
          <span className="font-semibold tabular-nums text-emerald-300">{formatXof(snap.deposits)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-slate-400">Out</span>
          <span className="font-semibold tabular-nums text-rose-300">{formatXof(snap.withdrawals)}</span>
        </div>
        <div className="flex justify-between gap-3 border-t border-white/10 pt-1.5">
          <span className="text-slate-300">Net</span>
          <span className="font-bold tabular-nums text-white">{formatXof(snap.net)}</span>
        </div>
      </div>
    </button>
  );
}
