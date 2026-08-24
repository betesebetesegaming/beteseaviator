"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Banknote, UserPlus } from "lucide-react";
import { db } from "@/lib/firestore";
import { useAuth } from "@/lib/auth-context";
import { todayIso, formatXof } from "@/lib/format";
import { agentPeriodGgr } from "@/lib/agentPeriodGgr";
import {
  agentOfficeFigures,
  firstDepositQualify,
  ggrBookDeposits,
} from "@/lib/agentDepositSales";
import {
  calendarMonthRangeIso,
  monthLabelFromKey,
  monthRangeIso,
  recentMonthKeys,
  weekRangeIso,
} from "@/lib/ggrAccounting";
import {
  addPlayerToAgentBook,
  agentCommissionDue,
  commissionableGgr,
  emptyAgentCommissionBook,
  finalizeAgentBook,
  playerLinkedToAgent,
  type AgentCommissionBook,
} from "@/lib/platformFinancials";
import { mergePlatformSettings } from "@/lib/platformSettingsMerge";
import {
  DEFAULT_SETTINGS,
  type AgentDailyStats,
  type Commission,
  type PlatformSettings,
  type UserProfile,
} from "@/lib/types";
import { Card, Input, Select, Spinner, StatCard, TableShell, Td, Th } from "@/components/ui";

type AgentOpenRow = {
  uid: string;
  name: string;
  customersOpened: number;
};

/** How many customers this agent opened today (manual create + referral signups). */
export function AgentTodayCustomerOpens() {
  const { profile } = useAuth();
  const today = useMemo(() => todayIso(), []);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!profile?.uid) return;
    const ref = doc(db, "agentDailyStats", `${profile.uid}_${today}`);
    return onSnapshot(ref, (snap) => {
      setCount(snap.exists() ? Number(snap.data()?.customersOpened ?? 0) : 0);
    });
  }, [profile?.uid, today]);

  if (count === null) return null;

  return (
    <StatCard
      label="Customers opened today"
      value={count}
      hint={`accounts you registered · ${today}`}
      icon={<UserPlus size={20} />}
    />
  );
}

type PeriodKind = "live" | "month" | "day";

/** Platform total + per-agent breakdown for admin. Live today/week/month, or a past month/day. */
export function AdminDailyCustomerOpens() {
  const today = useMemo(() => todayIso(), []);
  const week = useMemo(() => weekRangeIso(), []);
  const month = useMemo(() => monthRangeIso(), []);
  const monthOptions = useMemo(() => recentMonthKeys(12), []);
  const [periodKind, setPeriodKind] = useState<PeriodKind>("live");
  const [monthKey, setMonthKey] = useState(month.from.slice(0, 7));
  const [dayDate, setDayDate] = useState(today);
  const [platformToday, setPlatformToday] = useState<number | null>(null);
  const [agents, setAgents] = useState<UserProfile[] | null>(null);
  const [players, setPlayers] = useState<UserProfile[] | null>(null);
  const [opensByAgent, setOpensByAgent] = useState<Map<string, number> | null>(null);
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [commissions, setCommissions] = useState<Commission[] | null>(null);

  const selectedMonth = useMemo(() => calendarMonthRangeIso(monthKey), [monthKey]);
  const isLive = periodKind === "live";
  const periodFrom = isLive
    ? month.from
    : periodKind === "day"
      ? dayDate
      : selectedMonth.from;
  const periodTo = isLive ? today : periodKind === "day" ? dayDate : selectedMonth.to;
  const periodLabel =
    periodKind === "day" ? dayDate : periodKind === "month" ? selectedMonth.label : month.label;

  useEffect(() => {
    const unsubPlatform = onSnapshot(doc(db, "dailyStats", today), (snap) => {
      setPlatformToday(snap.exists() ? Number(snap.data()?.newCustomers ?? 0) : 0);
    });
    const unsubAgents = onSnapshot(
      query(collection(db, "users"), where("role", "in", ["agent", "super_agent", "sub_agent"])),
      (snap) => {
        setAgents(
          snap.docs
            .map((d) => ({ uid: d.id, ...d.data() }) as UserProfile)
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      }
    );
    const unsubPlayers = onSnapshot(
      query(collection(db, "users"), where("role", "==", "player")),
      (snap) => {
        setPlayers(snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile));
      }
    );
    const unsubSettings = onSnapshot(doc(db, "settings", "platform"), (snap) => {
      if (snap.exists()) setSettings(mergePlatformSettings(snap.data() as Partial<PlatformSettings>));
    });
    return () => {
      unsubPlatform();
      unsubAgents();
      unsubPlayers();
      unsubSettings();
    };
  }, [today]);

  useEffect(() => {
    const statsQuery = query(
      collection(db, "agentDailyStats"),
      where("date", ">=", isLive ? month.from : periodFrom),
      where("date", "<=", periodTo),
      orderBy("date", "asc")
    );
    return onSnapshot(
      statsQuery,
      (snap) => {
        const map = new Map<string, number>();
        for (const d of snap.docs) {
          const row = d.data() as AgentDailyStats;
          if (isLive && row.date !== today) continue;
          map.set(row.agentId, (map.get(row.agentId) ?? 0) + Number(row.customersOpened ?? 0));
        }
        setOpensByAgent(map);
      },
      () => setOpensByAgent(new Map())
    );
  }, [isLive, today, month.from, periodFrom, periodTo]);

  useEffect(() => {
    const q = query(
      collection(db, "commissions"),
      where("periodDate", ">=", periodFrom),
      where("periodDate", "<=", periodTo)
    );
    return onSnapshot(q, (snap) => {
      setCommissions(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Commission));
    });
  }, [periodFrom, periodTo]);

  const rows = useMemo<AgentOpenRow[] | null>(() => {
    if (!agents || !opensByAgent) return null;
    return agents
      .map((a) => ({
        uid: a.uid,
        name: a.name,
        customersOpened: opensByAgent.get(a.uid) ?? 0,
      }))
      .sort((a, b) => b.customersOpened - a.customersOpened || a.name.localeCompare(b.name));
  }, [agents, opensByAgent]);

  const booksByAgent = useMemo(() => {
    const map = new Map<string, AgentCommissionBook>();
    if (!agents || !players) return map;
    for (const a of agents) map.set(a.uid, emptyAgentCommissionBook());
    for (const p of players) {
      for (const a of agents) {
        if (!playerLinkedToAgent(p, a.uid)) continue;
        addPlayerToAgentBook(map.get(a.uid)!, p.stats);
      }
    }
    for (const [id, book] of map) map.set(id, finalizeAgentBook(book));
    return map;
  }, [agents, players]);

  const officeByAgent = useMemo(() => {
    const map = new Map<string, ReturnType<typeof agentOfficeFigures>>();
    if (!agents) return map;
    for (const a of agents) {
      const book = booksByAgent.get(a.uid);
      map.set(
        a.uid,
        agentOfficeFigures({
          bookDeposits: book?.deposits,
          storedDeposits: a.stats?.customerDeposits,
          bookStakes: book?.stakes,
          storedBets: a.stats?.totalBets,
          bookWins: book?.wins,
          storedWins: a.stats?.totalWins,
        })
      );
    }
    return map;
  }, [agents, booksByAgent]);

  const agentTotalToday = useMemo(
    () => rows?.reduce((sum, r) => sum + r.customersOpened, 0) ?? 0,
    [rows]
  );

  const creditedByAgent = useMemo(() => {
    const map = new Map<string, { day: number; week: number; month: number }>();
    for (const c of commissions ?? []) {
      const cur = map.get(c.agentId) ?? { day: 0, week: 0, month: 0 };
      const g = Number(c.ggrAmount) || 0;
      cur.month += g;
      if (c.periodDate >= week.from) cur.week += g;
      if (c.periodDate === today) cur.day += g;
      map.set(c.agentId, cur);
    }
    return map;
  }, [commissions, week.from, today]);

  const periodLedger = useMemo(() => {
    const map = new Map<string, { ggr: number; commission: number }>();
    for (const c of commissions ?? []) {
      const cur = map.get(c.agentId) ?? { ggr: 0, commission: 0 };
      cur.ggr += Number(c.ggrAmount) || 0;
      cur.commission += Number(c.commissionAmount) || 0;
      map.set(c.agentId, cur);
    }
    for (const [id, row] of map) {
      map.set(id, {
        ggr: Math.round(row.ggr * 100) / 100,
        commission: Math.round(row.commission * 100) / 100,
      });
    }
    return map;
  }, [commissions]);

  const bookDepositsTotal = useMemo(() => {
    let amount = 0;
    for (const row of officeByAgent.values()) amount += row.deposits;
    return Math.round(amount * 100) / 100;
  }, [officeByAgent]);

  const periodTotals = useMemo(() => {
    let ggr = 0;
    let commission = 0;
    for (const row of periodLedger.values()) {
      ggr += row.ggr;
      commission += row.commission;
    }
    return {
      ggr: Math.round(ggr * 100) / 100,
      commission: Math.round(commission * 100) / 100,
      deposits: bookDepositsTotal,
      opens: agentTotalToday,
    };
  }, [periodLedger, bookDepositsTotal, agentTotalToday]);

  if (platformToday === null || rows === null || players === null) {
    return (
      <Card className="flex items-center justify-center p-8">
        <Spinner />
      </Card>
    );
  }

  const pct = ((settings.agentRate ?? 0.05) * 100).toFixed(0);
  const qualifyAt = settings.firstDepositQualifyGmd ?? 40_000;
  const selectValue = periodKind === "live" ? "live" : monthKey;

  return (
    <div className="space-y-4">
      {isLive ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Marketer deposits"
            value={formatXof(bookDepositsTotal)}
            hint={`same book they see · qualify at ${formatXof(qualifyAt)}`}
            icon={<Banknote size={20} />}
          />
          <StatCard
            label={`Month GGR (profit)`}
            value={formatXof(periodTotals.ggr)}
            hint={`continue play · ${pct}% of this`}
          />
          <StatCard
            label={`${pct}% of GGR`}
            value={formatXof(periodTotals.commission)}
            hint="pay on profit, not on top-ups"
          />
          <StatCard
            label="New customers today"
            value={platformToday}
            hint={`${agentTotalToday} via agents · ${today}`}
            icon={<UserPlus size={20} />}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={`Deposits · ${periodLabel}`}
            value={formatXof(periodTotals.deposits)}
            hint={`marketer books · qualify at ${formatXof(qualifyAt)}`}
            icon={<Banknote size={20} />}
          />
          <StatCard
            label={`GGR · ${periodLabel}`}
            value={formatXof(periodTotals.ggr)}
            hint="credited profit"
          />
          <StatCard
            label={`${pct}% of GGR`}
            value={formatXof(periodTotals.commission)}
            hint="commission paid"
          />
          <StatCard
            label={`Opened · ${periodLabel}`}
            value={periodTotals.opens}
            hint="accounts registered then"
            icon={<UserPlus size={20} />}
          />
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="font-semibold">
                {isLive
                  ? "Marketer account books (same figures they see)"
                  : `Agent records · ${periodLabel}`}
              </h2>
              <p className="text-sm text-slate-400">
                {isLive
                  ? `Deposits, played, wins, and profit/GGR match each marketer's own account and the operations book. Qualify at ${formatXof(qualifyAt)} deposits. ${pct}% is of this month's GGR profit only.`
                  : `Closed period (${periodFrom} → ${periodTo}). Deposits are the same lifetime book. Period GGR ${pct}% is profit credited in that window.`}
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:flex-row sm:items-end lg:w-auto">
              <Select
                label="Period"
                value={selectValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "live") {
                    setPeriodKind("live");
                    return;
                  }
                  setMonthKey(v);
                  setPeriodKind("month");
                }}
                className="min-w-[220px]"
              >
                <option value="live">Live — today / week / month</option>
                {monthOptions.map((key) => (
                  <option key={key} value={key}>
                    {monthLabelFromKey(key)}
                    {key === month.from.slice(0, 7) ? " (this month, credited)" : ""}
                  </option>
                ))}
              </Select>
              <Input
                label="Or a day"
                type="date"
                value={periodKind === "day" ? dayDate : ""}
                max={today}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) {
                    setPeriodKind("live");
                    return;
                  }
                  setDayDate(v > today ? today : v);
                  setMonthKey((v > today ? today : v).slice(0, 7));
                  setPeriodKind("day");
                }}
                className="min-w-[160px]"
              />
            </div>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">No agents on the platform yet.</p>
        ) : isLive ? (
          <TableShell>
            <thead>
              <tr>
                <Th>Marketer</Th>
                <Th className="text-right">Deposits</Th>
                <Th className="text-right">Played</Th>
                <Th className="text-right">Wins</Th>
                <Th className="text-right">Profit / GGR</Th>
                <Th className="text-right text-amber-200/90">Qualify {formatXof(qualifyAt)}</Th>
                <Th className="text-right">Month GGR</Th>
                <Th className="text-right">{pct}% of GGR</Th>
                <Th className="text-right">Customers</Th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => {
                  const sa = officeByAgent.get(a.uid)?.deposits ?? 0;
                  const sb = officeByAgent.get(b.uid)?.deposits ?? 0;
                  return sb - sa || a.name.localeCompare(b.name);
                })
                .map((r) => {
                  const agent = agents!.find((a) => a.uid === r.uid);
                  const lifetime = agent?.stats?.customerCount ?? 0;
                  const book = booksByAgent.get(r.uid);
                  const office = officeByAgent.get(r.uid) ?? agentOfficeFigures({});
                  const bookDeposits = ggrBookDeposits(
                    book?.deposits ?? 0,
                    agent?.stats?.customerDeposits ?? 0
                  );
                  const withdrawals = book?.withdrawals ?? 0;
                  const cashHeld = book?.cashHeld ?? agent?.stats?.customerCashHeld ?? 0;
                  const lifetimeGgr = commissionableGgr(bookDeposits, withdrawals, cashHeld);
                  const credited = creditedByAgent.get(r.uid);
                  const monthGgr = agentPeriodGgr(
                    "month",
                    lifetimeGgr,
                    agent?.stats,
                    credited?.month ?? 0
                  );
                  const rate = settings.agentRate ?? 0.05;
                  const q = firstDepositQualify(office.deposits, qualifyAt);
                  return (
                    <tr key={r.uid}>
                      <Td className="font-medium">{r.name}</Td>
                      <Td className="text-right tabular-nums font-bold text-white">
                        {formatXof(office.deposits)}
                      </Td>
                      <Td className="text-right tabular-nums font-bold text-white">
                        {formatXof(office.played)}
                      </Td>
                      <Td className="text-right tabular-nums font-bold text-white">
                        {formatXof(office.wins)}
                      </Td>
                      <Td className="text-right tabular-nums font-bold text-violet-200">
                        {formatXof(office.playGgr)}
                      </Td>
                      <Td
                        className={`text-right text-xs font-semibold ${q.qualified ? "text-emerald-300" : "text-amber-200"}`}
                      >
                        {q.qualified ? (
                          "Yes"
                        ) : (
                          <>
                            No · <span className="font-bold text-white">{formatXof(q.remaining)}</span>{" "}
                            to go
                          </>
                        )}
                      </Td>
                      <Td className="text-right tabular-nums text-slate-300">
                        {formatXof(monthGgr)}
                      </Td>
                      <Td className="text-right tabular-nums text-emerald-300">
                        {formatXof(agentCommissionDue(monthGgr, rate))}
                      </Td>
                      <Td className="text-right tabular-nums text-slate-400">{lifetime}</Td>
                    </tr>
                  );
                })}
            </tbody>
          </TableShell>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Marketer</Th>
                <Th className="text-right">Deposits</Th>
                <Th className="text-right">Played</Th>
                <Th className="text-right">Wins</Th>
                <Th className="text-right">Profit / GGR</Th>
                <Th className="text-right">Qualify</Th>
                <Th className="text-right">Period GGR</Th>
                <Th className="text-right">{pct}% of GGR</Th>
                <Th className="text-right">Customers</Th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => {
                  const sa = officeByAgent.get(a.uid)?.deposits ?? 0;
                  const sb = officeByAgent.get(b.uid)?.deposits ?? 0;
                  return sb - sa || a.name.localeCompare(b.name);
                })
                .map((r) => {
                  const agent = agents!.find((a) => a.uid === r.uid);
                  const lifetime = agent?.stats?.customerCount ?? 0;
                  const ledger = periodLedger.get(r.uid);
                  const ggr = ledger?.ggr ?? 0;
                  const commission = ledger?.commission ?? 0;
                  const office = officeByAgent.get(r.uid) ?? agentOfficeFigures({});
                  const q = firstDepositQualify(office.deposits, qualifyAt);
                  return (
                    <tr key={r.uid}>
                      <Td className="font-medium">{r.name}</Td>
                      <Td className="text-right tabular-nums font-bold text-white">
                        {formatXof(office.deposits)}
                      </Td>
                      <Td className="text-right tabular-nums font-bold text-white">
                        {formatXof(office.played)}
                      </Td>
                      <Td className="text-right tabular-nums font-bold text-white">
                        {formatXof(office.wins)}
                      </Td>
                      <Td className="text-right tabular-nums font-bold text-violet-200">
                        {formatXof(office.playGgr)}
                      </Td>
                      <Td
                        className={`text-right text-xs font-semibold ${q.qualified ? "text-emerald-300" : "text-amber-200"}`}
                      >
                        {q.qualified ? (
                          "Yes"
                        ) : (
                          <>
                            No · <span className="font-bold text-white">{formatXof(q.remaining)}</span>{" "}
                            to go
                          </>
                        )}
                      </Td>
                      <Td className="text-right tabular-nums text-slate-300">{formatXof(ggr)}</Td>
                      <Td className="text-right tabular-nums text-emerald-300">
                        {formatXof(commission)}
                      </Td>
                      <Td className="text-right tabular-nums text-slate-400">{lifetime}</Td>
                    </tr>
                  );
                })}
            </tbody>
          </TableShell>
        )}
      </Card>
    </div>
  );
}
