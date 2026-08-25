"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAgentCustomerIds } from "@/lib/hooks/useAgentCustomerIds";
import { useAgentLinkedPlayers } from "@/lib/hooks/useAgentLinkedPlayers";
import { getOperationsHub, type OperationsHubResponse, errorMessage } from "@/lib/api";
import { subscribeDeposits, subscribeWithdrawals } from "@/lib/payments/rtdbClient";
import type { RtdbDepositRecord, RtdbWithdrawalRecord } from "@/lib/payments/rtdbRecords";
import {
  filterModemPayDeposits,
  filterModemPayWithdrawals,
  sumModemPayAmount,
} from "@/lib/modemPayAccounting";
import { agentOfficeFigures, allLinkDeposits, ggrBookDeposits, successfulDepositsByAgent } from "@/lib/agentDepositSales";
import { monthRangeIso, sumAgentCommissions, sumAgentGgr, weekRangeIso } from "@/lib/ggrAccounting";
import { formatDate, formatXof, todayIso } from "@/lib/format";
import { isOtcCashMeta } from "@/lib/transactionChannel";
import { collection, doc, documentId, getDocs, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firestore";
import type { AgentDailyStats, Commission, UserProfile, Wallet } from "@/lib/types";
import { accountTotalsFromStats } from "@/lib/playerAccount";
import { agentCommissionDue, commissionableGgr } from "@/lib/platformFinancials";
import { agentPeriodGgr, type GgrPeriodKind } from "@/lib/agentPeriodGgr";
import { playerDisplayId } from "@/lib/playerId";
import { AdminCustomerSupportModal } from "@/components/admin/AdminCustomerSupportModal";
import { AgentProfitOverview } from "@/components/agent/AgentProfitOverview";
import { useAgentCommissionBook } from "@/lib/hooks/useAgentCommissionBook";
import { Button, Card, EmptyState, Select, StatCard, TableShell, Td, Th } from "@/components/ui";

type PeriodKey = "today" | "week" | "month";
type MoneyRow = OperationsHubResponse["transactions"][number];

type JournalLine = MoneyRow & {
  cashIn: number;
  cashOut: number;
  runningBalance: number;
};

function periodBounds(key: PeriodKey): { from: string; to: string; label: string; fromMs: number } {
  const today = todayIso();
  if (key === "today") {
    return {
      from: today,
      to: today,
      label: `Today · ${today}`,
      fromMs: new Date(`${today}T00:00:00`).getTime(),
    };
  }
  if (key === "week") {
    const w = weekRangeIso();
    return {
      from: w.from,
      to: w.to,
      label: `This week · ${w.from} → ${w.to}`,
      fromMs: new Date(`${w.from}T00:00:00`).getTime(),
    };
  }
  const m = monthRangeIso();
  return {
    from: m.from,
    to: m.to,
    label: `This month · ${m.label}`,
    fromMs: new Date(`${m.from}T00:00:00`).getTime(),
  };
}

function useAgentCommissionsRange(agentId: string | undefined, from: string, to: string) {
  const [rows, setRows] = useState<Commission[] | null>(null);
  useEffect(() => {
    if (!agentId) return;
    const q = query(
      collection(db, "commissions"),
      where("agentId", "==", agentId),
      where("periodDate", ">=", from),
      where("periodDate", "<=", to),
      orderBy("periodDate", "desc"),
    );
    return onSnapshot(q, (snap) =>
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Commission)),
    );
  }, [agentId, from, to]);
  return rows;
}

/**
 * Professional agent account book: one statement for the period with
 * shop cash (OTC), Wave, sales/GGR, and commission — plus a cash journal
 * with running balance (cash you should hold / remit).
 */
export function AgentAccountBook() {
  const { profile, wallet } = useAuth();
  const agentId = profile?.uid;
  const { customerIds } = useAgentCustomerIds(agentId);
  const linkedPlayers = useAgentLinkedPlayers(agentId);
  const [period, setPeriod] = useState<PeriodKey>("today");
  const bounds = useMemo(() => periodBounds(period), [period]);
  const today = useMemo(() => todayIso(), []);

  const [daily, setDaily] = useState<AgentDailyStats | null>(null);
  const [data, setData] = useState<OperationsHubResponse | null>(null);
  const [deposits, setDeposits] = useState<RtdbDepositRecord[]>([]);
  const [withdrawals, setWithdrawals] = useState<RtdbWithdrawalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<UserProfile[] | null>(null);
  const [customerWallets, setCustomerWallets] = useState<Record<string, Wallet>>({});
  const [accountUser, setAccountUser] = useState<UserProfile | null>(null);

  const commissions = useAgentCommissionsRange(agentId, bounds.from, bounds.to);

  useEffect(() => {
    if (!agentId) return;
    return onSnapshot(doc(db, "agentDailyStats", `${agentId}_${today}`), (snap) => {
      setDaily(snap.exists() ? (snap.data() as AgentDailyStats) : null);
    });
  }, [agentId, today]);

  useEffect(() => {
    if (!agentId) {
      setCustomers(null);
      return;
    }
    if (!linkedPlayers) return;
    const rows = [...linkedPlayers].sort((a, b) => a.name.localeCompare(b.name));
    setCustomers(rows);
  }, [agentId, linkedPlayers]);

  useEffect(() => {
    if (!customers || customers.length === 0) {
      setCustomerWallets({});
      return;
    }
    let cancelled = false;
    const ids = customers.map((c) => c.uid);
    void (async () => {
      const map: Record<string, Wallet> = {};
      try {
        for (let i = 0; i < ids.length; i += 10) {
          const chunk = ids.slice(i, i + 10);
          const snap = await getDocs(
            query(collection(db, "wallets"), where(documentId(), "in", chunk)),
          );
          for (const d of snap.docs) map[d.id] = d.data() as Wallet;
        }
        if (!cancelled) setCustomerWallets(map);
      } catch {
        if (!cancelled) setCustomerWallets({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customers]);

  useEffect(() => {
    const unsubD = subscribeDeposits(undefined, setDeposits, { maxRows: 0 });
    const unsubW = subscribeWithdrawals(undefined, setWithdrawals);
    return () => {
      unsubD();
      unsubW();
    };
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await getOperationsHub({ limit: 400 });
      setData(res);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cashAll = useMemo(() => {
    if (!data || !agentId) return [];
    return data.transactions
      .filter((t) => {
        const meta = (t.meta ?? {}) as Record<string, unknown>;
        return isOtcCashMeta(meta) && meta.agentId === agentId;
      })
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  }, [data, agentId]);

  const cashInPeriod = useMemo(
    () => cashAll.filter((t) => (t.createdAt ?? 0) >= bounds.fromMs),
    [cashAll, bounds.fromMs],
  );

  const journal: JournalLine[] = useMemo(() => {
    let running = 0;
    return cashInPeriod.map((t) => {
      const amt = Math.abs(Number(t.amount) || 0);
      const cashIn = t.type === "deposit" ? amt : 0;
      const cashOut = t.type === "withdrawal" ? amt : 0;
      running += cashIn - cashOut;
      return { ...t, cashIn, cashOut, runningBalance: Math.round(running * 100) / 100 };
    });
  }, [cashInPeriod]);

  const journalNewestFirst = useMemo(() => [...journal].reverse(), [journal]);

  const cashSummary = useMemo(() => {
    const cashIn = journal.reduce((s, t) => s + t.cashIn, 0);
    const cashOut = journal.reduce((s, t) => s + t.cashOut, 0);
    const inCount = journal.filter((t) => t.cashIn > 0).length;
    const outCount = journal.filter((t) => t.cashOut > 0).length;
    const closing = journal.length ? journal[journal.length - 1]!.runningBalance : 0;
    // Prefer live daily stats for "today" when available
    if (period === "today" && daily) {
      const dIn = Number(daily.cashDeposits ?? cashIn);
      const dOut = Number(daily.cashWithdrawals ?? cashOut);
      return {
        cashIn: dIn,
        cashOut: dOut,
        net: Math.round((dIn - dOut) * 100) / 100,
        inCount: daily.cashDepositCount ?? inCount,
        outCount: daily.cashWithdrawalCount ?? outCount,
        closing: Math.round((dIn - dOut) * 100) / 100,
      };
    }
    return {
      cashIn,
      cashOut,
      net: Math.round((cashIn - cashOut) * 100) / 100,
      inCount,
      outCount,
      closing,
    };
  }, [journal, period, daily]);

  const waveIn = useMemo(
    () =>
      sumModemPayAmount(
        filterModemPayDeposits(deposits, {
          customerIds,
          from: bounds.from,
          to: bounds.to,
          successfulOnly: true,
        }),
      ),
    [deposits, customerIds, bounds],
  );
  const waveOut = useMemo(
    () =>
      sumModemPayAmount(
        filterModemPayWithdrawals(withdrawals, {
          customerIds,
          from: bounds.from,
          to: bounds.to,
          status: "completed",
        }),
      ),
    [withdrawals, customerIds, bounds],
  );
  const waveNet = Math.round((waveIn - waveOut) * 100) / 100;

  const periodGgrCredited = commissions ? sumAgentGgr(commissions) : 0;
  const periodCommissionCredited = commissions ? sumAgentCommissions(commissions) : null;
  const { book: liveBook } = useAgentCommissionBook(agentId);
  const playerAgents = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!agentId || !customerIds) return map;
    for (const id of customerIds) map.set(id, [agentId]);
    return map;
  }, [agentId, customerIds]);
  const waveLifetime =
    agentId ? successfulDepositsByAgent(deposits, playerAgents).get(agentId) ?? 0 : 0;
  const linkDeposits = allLinkDeposits({
    waveLifetime,
    bookDeposits: liveBook?.deposits,
    storedDeposits: profile?.stats?.customerDeposits,
  });
  const lifetimeDeposits = ggrBookDeposits(
    liveBook?.deposits ?? 0,
    profile?.stats?.customerDeposits ?? 0
  );
  const lifetimeGgr =
    liveBook?.commissionableGgr ??
    Math.max(
      0,
      lifetimeDeposits -
        (profile?.stats?.customerWithdrawals ?? 0) -
        (profile?.stats?.customerCashHeld ?? 0)
    );
  const liveKind: GgrPeriodKind = period === "today" ? "day" : period;
  const liveGgr = agentPeriodGgr(liveKind, lifetimeGgr, profile?.stats, periodGgrCredited);
  const office = agentOfficeFigures({
    bookDeposits: linkDeposits,
    storedDeposits: linkDeposits,
    bookStakes: liveBook?.stakes,
    storedBets: profile?.stats?.totalBets,
    bookWins: liveBook?.wins,
    storedWins: profile?.stats?.totalWins,
  });
  const liveShare = agentCommissionDue(liveGgr, 0.05);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Agent account book</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Clear books: <span className="text-amber-100">deposits</span> (same as backoffice),{" "}
            <span className="text-amber-200">cash desk</span>, <span className="text-sky-300">Wave</span>,
            GGR profit, and commission wallet.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            label="Period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodKey)}
            className="min-w-[10rem]"
          >
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
          </Select>
          <Button variant="secondary" className="gap-2" onClick={() => void load()} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      <AgentProfitOverview
        agentId={agentId}
        commissionEarned={profile?.stats?.commissionEarned ?? 0}
        commissionWallet={wallet?.balance ?? 0}
        storedDeposits={profile?.stats?.customerDeposits ?? 0}
        anchors={profile?.stats}
      />

      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{bounds.label}</p>

      {/* Statement header — four books */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card className="border-amber-500/35 bg-amber-500/10 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-200/90">
            1 · Shop cash desk
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-amber-100">
            {formatXof(cashSummary.closing)}
          </p>
          <p className="mt-1 text-xs text-amber-200/70">
            Net cash held this period (in − out)
          </p>
          <dl className="mt-3 space-y-1 border-t border-amber-500/20 pt-3 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Cash in</dt>
              <dd className="font-semibold tabular-nums text-emerald-300">
                {formatXof(cashSummary.cashIn)}
                <span className="ml-1 text-[10px] font-normal text-slate-500">
                  ({cashSummary.inCount})
                </span>
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Cash out</dt>
              <dd className="font-semibold tabular-nums text-rose-300">
                {formatXof(cashSummary.cashOut)}
                <span className="ml-1 text-[10px] font-normal text-slate-500">
                  ({cashSummary.outCount})
                </span>
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="border-sky-500/30 bg-sky-500/5 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-300/90">
            2 · Wave (mobile money)
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-sky-100">{formatXof(waveNet)}</p>
          <p className="mt-1 text-xs text-slate-500">Net Wave this period (dep − payouts)</p>
          <dl className="mt-3 space-y-1 border-t border-white/10 pt-3 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Deposits</dt>
              <dd className="font-semibold tabular-nums text-emerald-300">{formatXof(waveIn)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Payouts</dt>
              <dd className="font-semibold tabular-nums text-amber-200">{formatXof(waveOut)}</dd>
            </div>
          </dl>
          <Link
            href="/admin/accounts?tab=modempay"
            className="mt-3 inline-block text-xs font-medium text-sky-300 hover:underline"
          >
            Open Wave ledger →
          </Link>
        </Card>

        <Card className="p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-violet-300/90">
            3 · Profit / GGR
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-white">
            {formatXof(office.playGgr)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Same lifetime profit as the backoffice (played − wins). Your 5% below is this period only.
          </p>
          <dl className="mt-3 space-y-1 border-t border-white/10 pt-3 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Deposits (book)</dt>
              <dd className="font-bold tabular-nums text-white">{formatXof(office.deposits)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Your 5% this period</dt>
              <dd className="font-semibold tabular-nums text-emerald-300">{formatXof(liveShare)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Already credited</dt>
              <dd className="tabular-nums text-slate-300">
                {periodCommissionCredited != null ? formatXof(periodCommissionCredited) : "…"}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300/90">
            4 · Commission wallet
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-200">
            {formatXof(wallet?.balance ?? 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Available balance now</p>
          <dl className="mt-3 space-y-1 border-t border-white/10 pt-3 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Lifetime earned</dt>
              <dd className="tabular-nums text-slate-300">
                {formatXof(profile?.stats?.commissionEarned ?? 0)}
              </dd>
            </div>
          </dl>
          <Link
            href="/admin/agent-wallet"
            className="mt-3 inline-block text-xs font-medium text-emerald-400 hover:underline"
          >
            My wallet →
          </Link>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Cash in (period)"
          value={formatXof(cashSummary.cashIn)}
          hint={`${cashSummary.inCount} deposit(s)`}
        />
        <StatCard
          label="Cash out (period)"
          value={formatXof(cashSummary.cashOut)}
          hint={`${cashSummary.outCount} payout(s)`}
        />
        <StatCard
          label="Cash to remit / hold"
          value={formatXof(cashSummary.net)}
          hint="Shop cash net = in − out"
        />
      </div>

      <Card className="border-white/10 bg-slate-950/40 p-4 text-sm text-slate-400">
        <p className="font-medium text-slate-200">How to read this book</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-relaxed">
          <li>
            <span className="text-amber-200">Cash desk</span> — money you took or paid in person
            (OTP). Closing balance is what the shop should hold for BETESE.
          </li>
          <li>
            <span className="text-sky-300">Wave</span> — customer mobile-money deposits and payouts
            (not physical cash).
          </li>
          <li>
            <span className="text-violet-300">Profit / GGR</span> — played minus wins. Same figure as
            the BETESE backoffice. Your 5% is of this period&apos;s profit only.
          </li>
          <li>
            <span className="text-emerald-300">Commission wallet</span> — your digital earnings
            balance (separate from shop cash).
          </li>
        </ul>
      </Card>

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-semibold text-white">Cash desk journal</h3>
            <p className="text-xs text-slate-500">
              Debit = cash paid out · Credit = cash received · Balance = running shop cash
            </p>
          </div>
          <Link
            href="/admin/accounts?tab=cashdesk"
            className="text-xs font-medium text-amber-300 hover:underline"
          >
            Full cash desk list →
          </Link>
        </div>

        {error ? <p className="mb-2 text-sm text-red-300">{error}</p> : null}
        {loading ? (
          <EmptyState message="Loading account book…" />
        ) : journalNewestFirst.length === 0 ? (
          <EmptyState message="No cash desk entries in this period. Use Credit (cash) / Withdraw above." />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Date / time</Th>
                <Th>Customer</Th>
                <Th>Player ID</Th>
                <Th className="text-right">Debit (out)</Th>
                <Th className="text-right">Credit (in)</Th>
                <Th className="text-right">Balance</Th>
                <Th>Reference</Th>
              </tr>
            </thead>
            <tbody>
              {journalNewestFirst.map((t) => (
                <tr
                  key={t.id}
                  className={t.cashIn > 0 ? "bg-amber-500/5" : t.cashOut > 0 ? "bg-rose-500/5" : undefined}
                >
                  <Td className="whitespace-nowrap text-xs text-slate-400">
                    {t.createdAt ? formatDate(new Date(t.createdAt)) : "—"}
                  </Td>
                  <Td className="font-medium text-white">{t.userName ?? t.userId.slice(0, 8)}</Td>
                  <Td className="font-mono text-emerald-300">{t.playerId ?? "—"}</Td>
                  <Td className="text-right tabular-nums font-semibold text-rose-300">
                    {t.cashOut > 0 ? formatXof(t.cashOut) : "—"}
                  </Td>
                  <Td className="text-right tabular-nums font-semibold text-emerald-300">
                    {t.cashIn > 0 ? formatXof(t.cashIn) : "—"}
                  </Td>
                  <Td className="text-right tabular-nums font-bold text-amber-100">
                    {formatXof(t.runningBalance)}
                  </Td>
                  <Td className="max-w-[8rem] truncate font-mono text-[10px] text-slate-500" title={t.reference}>
                    {t.reference || t.id.slice(0, 10)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-semibold text-white">Customers account book</h3>
            <p className="text-xs text-slate-500">
              Deposits in bold — money each customer put in. Then withdrawals, GGR profit, and current wallet.
            </p>
          </div>
          <Link
            href="/admin/customers"
            className="text-xs font-medium text-emerald-300 hover:underline"
          >
            Manage customers →
          </Link>
        </div>

        {!customers ? (
          <EmptyState message="Loading customers…" />
        ) : customers.length === 0 ? (
          <EmptyState message="No customers yet." />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Player ID</Th>
                <Th>Name</Th>
                <Th className="text-right">Deposits</Th>
                <Th className="text-right">Withdrawals</Th>
                <Th className="text-right">GGR profit</Th>
                <Th className="text-right">Balance</Th>
                <Th>Account</Th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const stats = accountTotalsFromStats(c.stats);
                const bal = customerWallets[c.uid]?.balance;
                const cashHeld = bal ?? Number(c.stats?.walletCash ?? 0);
                const ggr = commissionableGgr(stats.totalDeposits, stats.totalWithdrawals, cashHeld);
                return (
                  <tr key={c.uid}>
                    <Td className="font-mono text-sm text-emerald-300">{playerDisplayId(c)}</Td>
                    <Td className="font-medium text-white">{c.name}</Td>
                    <Td className="text-right tabular-nums font-bold text-white">
                      {formatXof(stats.totalDeposits)}
                    </Td>
                    <Td className="text-right tabular-nums text-slate-300">
                      {formatXof(stats.totalWithdrawals)}
                    </Td>
                    <Td className="text-right tabular-nums font-semibold text-white">
                      {formatXof(ggr)}
                    </Td>
                    <Td className="text-right tabular-nums font-semibold">
                      {bal === undefined && c.stats?.walletCash == null ? "—" : formatXof(cashHeld)}
                    </Td>
                    <Td>
                      <Button
                        variant="secondary"
                        className="!px-2.5 !py-1 text-xs"
                        onClick={() => setAccountUser(c)}
                      >
                        Open
                      </Button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}
      </div>

      <AdminCustomerSupportModal user={accountUser} onClose={() => setAccountUser(null)} />
    </div>
  );
}
