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
import { Calculator } from "lucide-react";
import { db } from "@/lib/firestore";
import { formatXof } from "@/lib/format";
import { mergePlatformSettings } from "@/lib/platformSettingsMerge";
import {
  buildPeriodAccounting,
  ggrFromProviderDue,
  ggrMatchesPeriod,
  monthRangeIso,
  sumAgentCommissions,
  sumDailyStats,
  weekRangeIso,
} from "@/lib/ggrAccounting";
import {
  filterModemPayDeposits,
  filterModemPayWithdrawals,
  sumModemPayAmount,
} from "@/lib/modemPayAccounting";
import { subscribeDeposits, subscribeWithdrawals } from "@/lib/payments/rtdbClient";
import type { RtdbDepositRecord, RtdbWithdrawalRecord } from "@/lib/payments/rtdbRecords";
import type { Commission, DailyStats, PlatformSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { AccountingSummaryTable } from "@/components/admin/AccountingSummaryTable";
import { Card, Input, Spinner, StatCard } from "@/components/ui";

function useDailyStatsRange(from: string, to: string) {
  const [days, setDays] = useState<DailyStats[] | null>(null);
  useEffect(() => {
    const q = query(
      collection(db, "dailyStats"),
      where("date", ">=", from),
      where("date", "<=", to),
      orderBy("date", "asc")
    );
    return onSnapshot(q, (snap) => setDays(snap.docs.map((d) => d.data() as DailyStats)));
  }, [from, to]);
  return days;
}

function useCommissionsRange(from: string, to: string) {
  const [rows, setRows] = useState<Commission[] | null>(null);
  useEffect(() => {
    const q = query(
      collection(db, "commissions"),
      where("periodDate", ">=", from),
      where("periodDate", "<=", to),
      orderBy("periodDate", "desc")
    );
    return onSnapshot(q, (snap) =>
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Commission))
    );
  }, [from, to]);
  return rows;
}

export function AdminPlatformSummary() {
  const week = useMemo(() => weekRangeIso(), []);
  const month = useMemo(() => monthRangeIso(), []);

  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const weekDays = useDailyStatsRange(week.from, week.to);
  const monthDays = useDailyStatsRange(month.from, month.to);
  const weekCommissions = useCommissionsRange(week.from, week.to);
  const monthCommissions = useCommissionsRange(month.from, month.to);
  const [deposits, setDeposits] = useState<RtdbDepositRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<RtdbWithdrawalRecord[]>([]);
  const [qtechInvoice, setQtechInvoice] = useState("");

  useEffect(() => {
    return onSnapshot(doc(db, "settings", "platform"), (snap) => {
      if (snap.exists()) setSettings(mergePlatformSettings(snap.data() as Partial<PlatformSettings>));
    });
  }, []);

  useEffect(() => {
    const unsubD = subscribeDeposits(undefined, setDeposits);
    const unsubW = subscribeWithdrawals(undefined, setWithdrawals);
    return () => {
      unsubD();
      unsubW();
    };
  }, []);

  const providerName = settings.apiProviderName || "QTech";
  const providerRate = settings.apiProviderRate ?? 0;
  const providerPct = (providerRate * 100).toFixed(1);
  const agentPct = ((settings.agentRate ?? 0.05) * 100).toFixed(1);

  const weekAccounting = useMemo(() => {
    if (!weekDays || !weekCommissions) return null;
    return buildPeriodAccounting(
      sumDailyStats(weekDays),
      providerRate,
      sumAgentCommissions(weekCommissions)
    );
  }, [weekDays, weekCommissions, providerRate]);

  const monthAccounting = useMemo(() => {
    if (!monthDays || !monthCommissions) return null;
    return buildPeriodAccounting(
      sumDailyStats(monthDays),
      providerRate,
      sumAgentCommissions(monthCommissions)
    );
  }, [monthDays, monthCommissions, providerRate]);

  const weekDeposits = sumModemPayAmount(
    filterModemPayDeposits(deposits, { from: week.from, to: week.to, successfulOnly: true })
  );
  const monthDeposits = sumModemPayAmount(
    filterModemPayDeposits(deposits, { from: month.from, to: month.to, successfulOnly: true })
  );
  const weekWithdrawals = sumModemPayAmount(
    filterModemPayWithdrawals(withdrawals, { from: week.from, to: week.to, status: "completed" })
  );
  const monthWithdrawals = sumModemPayAmount(
    filterModemPayWithdrawals(withdrawals, { from: month.from, to: month.to, status: "completed" })
  );

  const invoiceAmount = Number(qtechInvoice.replace(/,/g, ""));
  const impliedGgr = ggrFromProviderDue(invoiceAmount, providerRate);
  const loading = !weekAccounting || !monthAccounting;

  if (loading) return <Spinner label="Loading platform accounts…" />;

  return (
    <>
      <p className="mb-4 text-sm text-slate-400">
        Platform GGR, {providerName} share, agent commissions, and ModemPay customer money in/out.
        Rates:{" "}
        <Link href="/admin/settings" className="text-emerald-400 hover:underline">
          Settings
        </Link>{" "}
        ({providerName} {providerPct}%, agents {agentPct}%).
      </p>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="ModemPay deposits (week)" value={formatXof(weekDeposits)} />
        <StatCard label="ModemPay withdrawals (week)" value={formatXof(weekWithdrawals)} />
        <StatCard label="ModemPay deposits (month)" value={formatXof(monthDeposits)} />
        <StatCard label="ModemPay withdrawals (month)" value={formatXof(monthWithdrawals)} />
      </div>

      <div className="mb-8 grid gap-5 lg:grid-cols-2">
        <AccountingSummaryTable
          title="This week"
          subtitle={week.label}
          providerName={providerName}
          providerRatePct={providerPct}
          data={weekAccounting}
        />
        <AccountingSummaryTable
          title="This month"
          subtitle={month.label}
          providerName={providerName}
          providerRatePct={providerPct}
          data={monthAccounting}
        />
      </div>

      <Card className="mb-8 border-sky-500/20 bg-sky-500/5 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Calculator size={18} className="text-sky-300" />
          <h2 className="font-semibold">{providerName} invoice → GGR</h2>
        </div>
        <p className="mb-4 text-sm text-slate-400">
          Enter the amount {providerName} says you owe. At {providerPct}% of GGR, see the sales profit
          that invoice represents.
        </p>
        <div className="max-w-xs">
          <Input
            label={`${providerName} amount due (GMD)`}
            type="number"
            min={0}
            step="0.01"
            placeholder="e.g. 1500"
            value={qtechInvoice}
            onChange={(e) => setQtechInvoice(e.target.value)}
          />
        </div>
        {impliedGgr != null ? (
          <div className="mt-4 space-y-2 text-sm">
            <p>
              <span className="text-slate-400">GGR for this invoice: </span>
              <strong className="text-lg text-sky-200">{formatXof(impliedGgr)}</strong>
            </p>
            <p className="text-slate-400">
              {ggrMatchesPeriod(weekAccounting.ggr, impliedGgr) ? (
                <span className="text-emerald-300">✓ Matches this week ({formatXof(weekAccounting.ggr)})</span>
              ) : (
                <span>Week GGR: {formatXof(weekAccounting.ggr)}</span>
              )}
              {" · "}
              {ggrMatchesPeriod(monthAccounting.ggr, impliedGgr) ? (
                <span className="text-emerald-300">✓ Matches this month ({formatXof(monthAccounting.ggr)})</span>
              ) : (
                <span>Month GGR: {formatXof(monthAccounting.ggr)}</span>
              )}
            </p>
          </div>
        ) : null}
      </Card>
    </>
  );
}
