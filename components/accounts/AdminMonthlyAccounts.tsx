"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import Link from "next/link";
import { db } from "@/lib/firestore";
import { formatXof } from "@/lib/format";
import { mergePlatformSettings } from "@/lib/platformSettingsMerge";
import {
  buildPeriodAccounting,
  groupAgentCashByMonth,
  groupCommissionsByMonth,
  groupDailyStatsByMonth,
  monthsBackRangeIso,
} from "@/lib/ggrAccounting";
import { groupModemPayCashByMonth } from "@/lib/modemPayAccounting";
import { subscribeDeposits, subscribeWithdrawals } from "@/lib/payments/rtdbClient";
import type { RtdbDepositRecord, RtdbWithdrawalRecord } from "@/lib/payments/rtdbRecords";
import type { AgentDailyStats, Commission, DailyStats, PlatformSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { Card, EmptyState, Spinner, StatCard, TableShell, Td, Th } from "@/components/ui";

const LOOKBACK_MONTHS = 24;

type MonthRow = {
  monthKey: string;
  label: string;
  bets: number;
  wins: number;
  ggr: number;
  deposits: number;
  withdrawals: number;
  netCash: number;
  modemPayDeposits: number;
  modemPayWithdrawals: number;
  modemPayNet: number;
  cashDeskDeposits: number;
  cashDeskWithdrawals: number;
  otherDeposits: number;
  otherWithdrawals: number;
  providerDue: number;
  agentCommission: number;
  profit: number;
};

function BreakdownRow({
  label,
  hint,
  value,
  strong,
  muted,
}: {
  label: string;
  hint?: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/5 py-2.5 last:border-0">
      <div>
        <p className={`text-sm ${strong ? "font-medium text-white" : "text-slate-300"}`}>{label}</p>
        {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      </div>
      <p
        className={`tabular-nums ${
          strong
            ? "text-base font-bold text-emerald-300"
            : muted
              ? "font-medium text-slate-400"
              : "font-semibold text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export function AdminMonthlyAccounts() {
  const range = useMemo(() => monthsBackRangeIso(LOOKBACK_MONTHS - 1), []);
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [days, setDays] = useState<DailyStats[] | null>(null);
  const [commissions, setCommissions] = useState<Commission[] | null>(null);
  const [modemPayDeposits, setModemPayDeposits] = useState<RtdbDepositRecord[]>([]);
  const [modemPayWithdrawals, setModemPayWithdrawals] = useState<RtdbWithdrawalRecord[]>([]);
  const [agentDaily, setAgentDaily] = useState<AgentDailyStats[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    return onSnapshot(doc(db, "settings", "platform"), (snap) => {
      if (snap.exists()) setSettings(mergePlatformSettings(snap.data() as Partial<PlatformSettings>));
    });
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "dailyStats"),
      where("date", ">=", range.from),
      where("date", "<=", range.to),
      orderBy("date", "asc")
    );
    return onSnapshot(q, (snap) => setDays(snap.docs.map((d) => d.data() as DailyStats)));
  }, [range.from, range.to]);

  useEffect(() => {
    const q = query(
      collection(db, "commissions"),
      where("periodDate", ">=", range.from),
      where("periodDate", "<=", range.to),
      orderBy("periodDate", "desc")
    );
    return onSnapshot(q, (snap) =>
      setCommissions(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Commission))
    );
  }, [range.from, range.to]);

  useEffect(() => {
    const unsubD = subscribeDeposits(undefined, setModemPayDeposits, { maxRows: 0 });
    const unsubW = subscribeWithdrawals(undefined, setModemPayWithdrawals, { maxRows: 0 });
    return () => {
      unsubD();
      unsubW();
    };
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "agentDailyStats"),
      where("date", ">=", range.from),
      where("date", "<=", range.to),
      orderBy("date", "asc"),
    );
    return onSnapshot(
      q,
      (snap) => setAgentDaily(snap.docs.map((d) => d.data() as AgentDailyStats)),
      () => setAgentDaily([]),
    );
  }, [range.from, range.to]);

  const providerName = settings.apiProviderName || "QTech";
  const providerRate = settings.apiProviderRate ?? 0;
  const providerPct = (providerRate * 100).toFixed(1);
  const agentPct = ((settings.agentRate ?? 0.05) * 100).toFixed(1);

  const modemPayByMonth = useMemo(
    () => groupModemPayCashByMonth(modemPayDeposits, modemPayWithdrawals, range.from, range.to),
    [modemPayDeposits, modemPayWithdrawals, range.from, range.to]
  );

  const cashDeskByMonth = useMemo(
    () => groupAgentCashByMonth(agentDaily ?? []),
    [agentDaily],
  );

  const rows: MonthRow[] | null = useMemo(() => {
    if (!days || !commissions || !agentDaily) return null;
    const commissionByMonth = groupCommissionsByMonth(commissions);
    return groupDailyStatsByMonth(days).map((month) => {
      const accounting = buildPeriodAccounting(
        month,
        providerRate,
        commissionByMonth.get(month.monthKey) ?? 0
      );
      const mp = modemPayByMonth.get(month.monthKey) ?? { deposits: 0, withdrawals: 0 };
      const cash = cashDeskByMonth.get(month.monthKey) ?? { deposits: 0, withdrawals: 0 };
      const modemPayNet = Math.round((mp.deposits - mp.withdrawals) * 100) / 100;
      const otherDeposits = Math.round((month.deposits - mp.deposits - cash.deposits) * 100) / 100;
      const otherWithdrawals = Math.round(
        (month.withdrawals - mp.withdrawals - cash.withdrawals) * 100,
      ) / 100;
      return {
        monthKey: month.monthKey,
        label: month.label,
        bets: month.bets,
        wins: month.wins,
        ggr: month.ggr,
        deposits: month.deposits,
        withdrawals: month.withdrawals,
        netCash: Math.round((month.deposits - month.withdrawals) * 100) / 100,
        modemPayDeposits: mp.deposits,
        modemPayWithdrawals: mp.withdrawals,
        modemPayNet,
        cashDeskDeposits: cash.deposits,
        cashDeskWithdrawals: cash.withdrawals,
        otherDeposits,
        otherWithdrawals,
        providerDue: accounting.providerDue,
        agentCommission: accounting.agentCommission,
        profit: accounting.beteseKeeps,
      };
    });
  }, [days, commissions, agentDaily, providerRate, modemPayByMonth, cashDeskByMonth]);

  useEffect(() => {
    if (!rows?.length) return;
    setSelectedKey((prev) =>
      prev && rows.some((r) => r.monthKey === prev) ? prev : rows[0].monthKey
    );
  }, [rows]);

  const selected = rows?.find((r) => r.monthKey === selectedKey) ?? null;

  const totals = useMemo(() => {
    if (!rows?.length) return null;
    return rows.reduce(
      (acc, r) => ({
        sales: acc.sales + r.ggr,
        profit: acc.profit + r.profit,
        deposits: acc.deposits + r.deposits,
        withdrawals: acc.withdrawals + r.withdrawals,
        modemPayDeposits: acc.modemPayDeposits + r.modemPayDeposits,
        modemPayWithdrawals: acc.modemPayWithdrawals + r.modemPayWithdrawals,
        cashDeskDeposits: acc.cashDeskDeposits + r.cashDeskDeposits,
        cashDeskWithdrawals: acc.cashDeskWithdrawals + r.cashDeskWithdrawals,
        otherDeposits: acc.otherDeposits + r.otherDeposits,
        providerDue: acc.providerDue + r.providerDue,
        agentCommission: acc.agentCommission + r.agentCommission,
      }),
      {
        sales: 0,
        profit: 0,
        deposits: 0,
        withdrawals: 0,
        modemPayDeposits: 0,
        modemPayWithdrawals: 0,
        cashDeskDeposits: 0,
        cashDeskWithdrawals: 0,
        otherDeposits: 0,
        providerDue: 0,
        agentCommission: 0,
      }
    );
  }, [rows]);

  if (!rows || !totals) return <Spinner label="Loading month-by-month accounts…" />;

  return (
    <>
      <Card className="mb-6 border-emerald-500/20 bg-emerald-500/5 p-5">
        <h2 className="mb-2 font-semibold text-white">How to read your accounts</h2>
        <ol className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2 lg:grid-cols-5">
          <li>
            <span className="font-medium text-white">1. Customer money</span>
            <p className="text-xs text-slate-500">All wallet top-ups — Wave, shop cash, and other</p>
          </li>
          <li>
            <span className="font-medium text-white">2. Wave (ModemPay)</span>
            <p className="text-xs text-slate-500">Mobile money on the phone — every Wave payment this month</p>
          </li>
          <li>
            <span className="font-medium text-white">3. Sales</span>
            <p className="text-xs text-slate-500">What players bet minus what they won (GGR)</p>
          </li>
          <li>
            <span className="font-medium text-white">4. Vendors</span>
            <p className="text-xs text-slate-500">
              {providerName} ({providerPct}% of sales) + agents ({agentPct}%)
            </p>
          </li>
          <li>
            <span className="font-medium text-white">5. Your profit</span>
            <p className="text-xs text-slate-500">Sales minus {providerName} minus agent commissions</p>
          </li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          Click any month for the full breakdown. Rates:{" "}
          <Link href="/admin/settings" className="text-emerald-400 hover:underline">
            Settings
          </Link>
          . Last {LOOKBACK_MONTHS} months kept automatically — nothing is deleted.
        </p>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Customer deposits" value={formatXof(totals.deposits)} />
        <StatCard label="Customer withdrawals" value={formatXof(totals.withdrawals)} />
        <StatCard label="Sales (GGR)" value={formatXof(totals.sales)} />
        <StatCard label={`${providerName} (vendor)`} value={formatXof(totals.providerDue)} />
        <StatCard label="Agent commissions" value={formatXof(totals.agentCommission)} />
        <StatCard label="Your profit" value={formatXof(totals.profit)} />
      </div>

      <div className="mb-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-white/5 px-4 py-3">
            <h2 className="font-semibold text-white">Month by month</h2>
            <p className="text-xs text-slate-500">Date · customer money · sales · vendors · profit</p>
          </div>
          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState message="No monthly activity yet. Deposits and play will appear here by month." />
            </div>
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Month / date</Th>
                  <Th>Customer deposits</Th>
                  <Th>Withdrawals</Th>
                  <Th>Sales</Th>
                  <Th>{providerName}</Th>
                  <Th>Your profit</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const active = r.monthKey === selectedKey;
                  return (
                    <tr
                      key={r.monthKey}
                      onClick={() => setSelectedKey(r.monthKey)}
                      className={`cursor-pointer transition ${
                        active ? "bg-emerald-500/10" : "hover:bg-white/5"
                      }`}
                    >
                      <Td className="font-medium text-white">{r.label}</Td>
                      <Td className="tabular-nums">{formatXof(r.deposits)}</Td>
                      <Td className="tabular-nums">{formatXof(r.withdrawals)}</Td>
                      <Td className="tabular-nums font-semibold text-emerald-300">
                        {formatXof(r.ggr)}
                      </Td>
                      <Td className="tabular-nums text-slate-400">{formatXof(r.providerDue)}</Td>
                      <Td className="tabular-nums font-semibold text-sky-300">
                        {formatXof(r.profit)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          )}
        </Card>

        <Card className="p-5">
          {selected ? (
            <>
              <h2 className="font-semibold text-white">{selected.label}</h2>
              <p className="mb-4 text-xs text-slate-500">Full account for this month</p>

              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                Customer money (all channels)
              </p>
              <BreakdownRow
                label="Deposits"
                hint="Wave + shop cash + other"
                value={formatXof(selected.deposits)}
              />
              <BreakdownRow
                label="Withdrawals"
                hint="Wave + shop cash + other"
                value={formatXof(selected.withdrawals)}
              />
              <BreakdownRow
                label="Net customer cash"
                hint="Deposits minus withdrawals"
                value={formatXof(selected.netCash)}
                strong
              />

              <p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-amber-500/80">
                Where the deposits came from
              </p>
              <BreakdownRow
                label="Wave deposits"
                hint="Mobile money through ModemPay — all payments, not a sample"
                value={formatXof(selected.modemPayDeposits)}
              />
              <BreakdownRow
                label="Wave withdrawals"
                hint="Paid out to the customer’s phone"
                value={formatXof(selected.modemPayWithdrawals)}
              />
              <BreakdownRow
                label="Shop cash desk deposits"
                hint="Physical cash an agent collected in person (only if cash desk is ON)"
                value={formatXof(selected.cashDeskDeposits)}
              />
              <BreakdownRow
                label="Shop cash desk withdrawals"
                hint="Physical cash an agent paid out in person"
                value={formatXof(selected.cashDeskWithdrawals)}
              />
              <BreakdownRow
                label="Other deposits"
                hint="Not Wave and not shop cash — e.g. agent wallet transfer or admin credit"
                value={formatXof(selected.otherDeposits)}
                muted
              />
              <BreakdownRow
                label="Other withdrawals"
                hint="Not Wave and not shop cash"
                value={formatXof(selected.otherWithdrawals)}
                muted
              />

              <p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                Games / sales
              </p>
              <BreakdownRow label="Player bets" value={formatXof(selected.bets)} muted />
              <BreakdownRow label="Player wins" value={formatXof(selected.wins)} muted />
              <BreakdownRow
                label="Sales (GGR)"
                hint="Bets minus wins — platform revenue"
                value={formatXof(selected.ggr)}
                strong
              />

              <p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                Vendors & partners
              </p>
              <BreakdownRow
                label={`${providerName} due`}
                hint={`${providerPct}% of sales — game provider`}
                value={formatXof(selected.providerDue)}
              />
              <BreakdownRow
                label="Agent commissions"
                hint="Paid to agents for their players"
                value={formatXof(selected.agentCommission)}
              />

              <p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                Result
              </p>
              <BreakdownRow
                label="Your profit (BETESE)"
                hint={`Sales − ${providerName} − agents`}
                value={formatXof(selected.profit)}
                strong
              />
            </>
          ) : (
            <EmptyState message="Select a month to see the full breakdown." />
          )}
        </Card>
      </div>

      <Card className="mb-6 overflow-hidden border-amber-500/25 bg-amber-500/[0.04] p-0">
        <div className="border-b border-amber-500/15 px-4 py-3">
          <h2 className="font-semibold text-white">Wave vs shop cash</h2>
          <p className="text-xs text-slate-500">
            Wave is every ModemPay payment. Shop cash is only physical money at the agent desk.
            These are not mixed. Other = wallet credits that are neither Wave nor shop cash.
          </p>
        </div>
        <div className="grid gap-4 border-b border-amber-500/10 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Wave deposits" value={formatXof(totals.modemPayDeposits)} />
          <StatCard label="Wave withdrawals" value={formatXof(totals.modemPayWithdrawals)} />
          <StatCard label="Shop cash deposits" value={formatXof(totals.cashDeskDeposits)} hint="OTC only" />
          <StatCard label="Other deposits" value={formatXof(totals.otherDeposits)} hint="not Wave, not cash desk" />
        </div>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState message="No ModemPay activity in this period yet." />
          </div>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Month / date</Th>
                <Th>Wave deposits</Th>
                <Th>Wave withdrawals</Th>
                <Th>Shop cash deposits</Th>
                <Th>Other deposits</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const active = r.monthKey === selectedKey;
                return (
                  <tr
                    key={`mp-${r.monthKey}`}
                    onClick={() => setSelectedKey(r.monthKey)}
                    className={`cursor-pointer transition ${
                      active ? "bg-amber-500/10" : "hover:bg-white/5"
                    }`}
                  >
                    <Td className="font-medium text-white">{r.label}</Td>
                    <Td className="tabular-nums text-amber-100">{formatXof(r.modemPayDeposits)}</Td>
                    <Td className="tabular-nums text-amber-100">
                      {formatXof(r.modemPayWithdrawals)}
                    </Td>
                    <Td className="tabular-nums text-amber-200">{formatXof(r.cashDeskDeposits)}</Td>
                    <Td className="tabular-nums text-slate-400">{formatXof(r.otherDeposits)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </Card>
    </>
  );
}
