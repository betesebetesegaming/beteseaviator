"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Banknote, Smartphone } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firestore";
import { useAuth } from "@/lib/auth-context";
import { getOperationsHub, type OperationsHubResponse, errorMessage } from "@/lib/api";
import { subscribeDeposits } from "@/lib/payments/rtdbClient";
import type { RtdbDepositRecord } from "@/lib/payments/rtdbRecords";
import {
  filterModemPayDeposits,
  isSuccessfulDeposit,
  sumModemPayAmount,
} from "@/lib/modemPayAccounting";
import { formatDate, formatXof, todayIso } from "@/lib/format";
import { isOtcCashMeta } from "@/lib/transactionChannel";
import type { AgentDailyStats, DailyStats } from "@/lib/types";
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

type MoneyRow = OperationsHubResponse["transactions"][number];

type DayDepositRow = {
  id: string;
  atMs: number;
  customerName: string;
  customerId: string;
  amount: number;
  channel: "Wave" | "Cash desk";
  status: string;
  reference: string;
};

function todayStartMs(today: string): number {
  return new Date(`${today}T00:00:00.000Z`).getTime();
}

function sortNewest(a: DayDepositRow, b: DayDepositRow): number {
  return b.atMs - a.atMs;
}

/** Same-day customer deposits only — Wave + shop cash, live. */
export function TodayDepositsPanel({
  customerIds,
  customerNames,
  scopeLabel,
  restrictToNetwork,
}: {
  customerIds?: Set<string> | null;
  customerNames?: Map<string, string>;
  scopeLabel: string;
  restrictToNetwork: boolean;
}) {
  const { profile } = useAuth();
  const agentId = profile?.uid;
  const today = useMemo(() => todayIso(), []);
  const fromMs = useMemo(() => todayStartMs(today), [today]);

  const [wave, setWave] = useState<RtdbDepositRecord[] | null>(null);
  const [cashTx, setCashTx] = useState<MoneyRow[] | null>(null);
  const [cashError, setCashError] = useState<string | null>(null);
  const [platformToday, setPlatformToday] = useState<DailyStats | null>(null);
  const [agentCashToday, setAgentCashToday] = useState<AgentDailyStats | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    return subscribeDeposits(undefined, setWave, { maxRows: 0 });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getOperationsHub({ type: "deposit", limit: 400 })
      .then((res) => {
        if (cancelled) return;
        const rows = res.transactions.filter((t) => {
          if (t.type !== "deposit") return false;
          if (!isOtcCashMeta(t.meta)) return false;
          if ((t.createdAt ?? 0) < fromMs) return false;
          if (restrictToNetwork && agentId) {
            return String((t.meta ?? {}).agentId || t.agentId || "") === agentId;
          }
          return true;
        });
        setCashTx(rows);
        setCashError(null);
      })
      .catch((e) => {
        if (!cancelled) {
          setCashTx([]);
          setCashError(errorMessage(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fromMs, restrictToNetwork, agentId]);

  useEffect(() => {
    if (restrictToNetwork) return;
    return onSnapshot(doc(db, "dailyStats", today), (snap) => {
      setPlatformToday(snap.exists() ? (snap.data() as DailyStats) : null);
    });
  }, [restrictToNetwork, today]);

  useEffect(() => {
    if (!restrictToNetwork || !agentId) return;
    return onSnapshot(doc(db, "agentDailyStats", `${agentId}_${today}`), (snap) => {
      setAgentCashToday(snap.exists() ? (snap.data() as AgentDailyStats) : null);
    });
  }, [restrictToNetwork, agentId, today]);

  const waitingForNetwork = restrictToNetwork && !customerIds;
  const loaded = wave !== null && cashTx !== null && !waitingForNetwork;

  const successfulWave = useMemo(() => {
    if (!wave) return [];
    return filterModemPayDeposits(wave, {
      from: today,
      to: today,
      customerIds: restrictToNetwork ? customerIds : null,
      successfulOnly: true,
    });
  }, [wave, today, customerIds, restrictToNetwork]);

  const pendingWave = useMemo(() => {
    if (!wave) return [];
    return filterModemPayDeposits(wave, {
      from: today,
      to: today,
      customerIds: restrictToNetwork ? customerIds : null,
    }).filter((r) => !isSuccessfulDeposit(r));
  }, [wave, today, customerIds, restrictToNetwork]);

  const waveTotal = sumModemPayAmount(successfulWave);
  const cashList = cashTx ?? [];
  const cashFromBook = restrictToNetwork
    ? Number(agentCashToday?.cashDeposits ?? 0)
    : cashList.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const cashCount = restrictToNetwork
    ? Number(agentCashToday?.cashDepositCount ?? cashList.length)
    : cashList.length;
  const cashTotal = cashFromBook || cashList.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const listedTotal = Math.round((waveTotal + cashTotal) * 100) / 100;
  const platformCredited = Number(platformToday?.deposits ?? 0);

  const rows = useMemo<DayDepositRow[]>(() => {
    const waveRows: DayDepositRow[] = successfulWave.map((r) => ({
      id: r.id || `${r.customer_id}-${r.timestamp}`,
      atMs: Date.parse(r.timestamp) || 0,
      customerName: r.customer_name || customerNames?.get(r.customer_id) || "—",
      customerId: r.customer_id,
      amount: Math.abs(Number(r.amount) || 0),
      channel: "Wave",
      status: String(r.status || "approved"),
      reference: r.transaction_id || r.provider_reference || r.id,
    }));
    const cashRows: DayDepositRow[] = cashList.map((t) => ({
      id: t.id,
      atMs: t.createdAt ?? 0,
      customerName: t.userName || customerNames?.get(t.userId) || "—",
      customerId: t.userId,
      amount: Math.abs(Number(t.amount) || 0),
      channel: "Cash desk",
      status: "completed",
      reference: t.reference || t.id,
    }));
    return [...waveRows, ...cashRows].sort(sortNewest);
  }, [successfulWave, cashList, customerNames]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.customerName.toLowerCase().includes(q) ||
        r.customerId.toLowerCase().includes(q) ||
        r.reference.toLowerCase().includes(q) ||
        r.channel.toLowerCase().includes(q),
    );
  }, [rows, search]);

  if (!loaded) return <Spinner label="Loading today’s deposits…" />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Deposits today</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          {scopeLabel}. Only money that came in on {today} — Wave on the phone and cash at the shop.
          This list resets at midnight.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="All deposits today"
          value={formatXof(listedTotal)}
          hint={`${successfulWave.length + cashCount} successful`}
          icon={<Banknote size={20} />}
        />
        <StatCard
          label="Wave today"
          value={formatXof(waveTotal)}
          hint={`${successfulWave.length} payment(s)`}
          icon={<Smartphone size={20} />}
        />
        <StatCard
          label="Cash desk today"
          value={formatXof(cashTotal)}
          hint={`${cashCount} payment(s)`}
        />
        {!restrictToNetwork ? (
          <StatCard
            label="Platform credited today"
            value={formatXof(platformCredited)}
            hint="dailyStats · Wave + cash + other credits"
          />
        ) : (
          <StatCard
            label="Incomplete Wave"
            value={pendingWave.length}
            hint="pending or rejected — not in the total"
          />
        )}
      </div>

      {cashError ? (
        <p className="text-sm text-amber-300">Cash desk list could not load: {cashError}</p>
      ) : null}

      <Card className="!p-4">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <Input
            label="Search today’s deposits"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, Player ID, Wave reference…"
            className="min-w-[16rem] sm:w-80"
          />
          <p className="text-xs text-slate-500">{visibleRows.length} shown · {today}</p>
        </div>

        {!visibleRows.length ? (
          <EmptyState message={`No successful deposits recorded for ${today} yet.`} />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Customer</Th>
                <Th>Amount</Th>
                <Th>How</Th>
                <Th>Status</Th>
                <Th>Reference</Th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap text-xs text-slate-400">
                    {r.atMs ? formatDate(new Date(r.atMs)) : "—"}
                  </Td>
                  <Td>
                    <span className="block font-medium text-white">{r.customerName}</span>
                    <span className="font-mono text-[10px] text-slate-500">
                      {r.customerId ? `${r.customerId.slice(0, 10)}…` : "—"}
                    </span>
                  </Td>
                  <Td className="font-semibold tabular-nums text-emerald-300">{formatXof(r.amount)}</Td>
                  <Td>{r.channel}</Td>
                  <Td>
                    <Badge value={r.status.toLowerCase()} />
                  </Td>
                  <Td className="max-w-[10rem] truncate font-mono text-[10px] text-slate-500">
                    {r.reference}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      {pendingWave.length > 0 ? (
        <Card className="border-amber-500/20 bg-amber-500/5 p-5">
          <h3 className="font-semibold text-amber-100">Not credited yet ({pendingWave.length})</h3>
          <p className="mb-3 mt-1 text-sm text-amber-200/80">
            Started today but still pending or rejected. These are not in the totals above.
          </p>
          <TableShell>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Customer</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {pendingWave.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap text-xs text-slate-400">
                    {r.timestamp ? formatDate(new Date(r.timestamp)) : "—"}
                  </Td>
                  <Td className="font-medium text-white">
                    {r.customer_name || customerNames?.get(r.customer_id) || "—"}
                  </Td>
                  <Td className="tabular-nums">{formatXof(Number(r.amount) || 0)}</Td>
                  <Td>
                    <Badge value={String(r.status || "pending").toLowerCase()} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </Card>
      ) : null}

      <p className="text-xs text-slate-500">
        Week and month Wave totals stay on{" "}
        <span className="text-slate-400">Wave ledger</span>
        {restrictToNetwork ? null : (
          <>
            {" "}
            · credited day total also appears on{" "}
            <Link href="/admin/reports" className="text-emerald-400 hover:underline">
              Reports
            </Link>
          </>
        )}
        .
      </p>
    </div>
  );
}

/** Dashboard shortcut: platform deposits credited today. */
export function AdminTodayDepositsStat() {
  const today = useMemo(() => todayIso(), []);
  const [amount, setAmount] = useState<number | null>(null);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    return onSnapshot(doc(db, "dailyStats", today), (snap) => {
      setAmount(snap.exists() ? Number(snap.data()?.deposits ?? 0) : 0);
    });
  }, [today]);

  useEffect(() => {
    return subscribeDeposits(
      undefined,
      (rows) => {
        const ok = filterModemPayDeposits(rows, {
          from: today,
          to: today,
          successfulOnly: true,
        });
        setCount(ok.length);
      },
      { maxRows: 0 },
    );
  }, [today]);

  if (amount === null) return null;

  return (
    <Link href="/admin/accounts?tab=today">
      <StatCard
        label="Deposits today"
        value={formatXof(amount)}
        hint={`${today}${count != null ? ` · ${count} Wave payment(s)` : ""} · open list`}
        icon={<Banknote size={20} />}
      />
    </Link>
  );
}

/** Agent dashboard shortcut into the same-day deposit list. */
export function AgentTodayDepositsStat() {
  const today = useMemo(() => todayIso(), []);
  return (
    <Link href="/admin/accounts?tab=today">
      <StatCard
        label="Deposits today"
        value="Wave + cash"
        hint={`${today} · open today’s list`}
        icon={<Banknote size={20} />}
      />
    </Link>
  );
}
