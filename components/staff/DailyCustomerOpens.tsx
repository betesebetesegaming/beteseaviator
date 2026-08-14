"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { UserPlus } from "lucide-react";
import toast from "react-hot-toast";
import { db } from "@/lib/firestore";
import { useAuth } from "@/lib/auth-context";
import { todayIso, formatXof } from "@/lib/format";
import { monthRangeIso } from "@/lib/ggrAccounting";
import { monthEndPayFromFirstOpen } from "@/lib/marketerFirstDepositPay";
import { adminRebuildAgentDepositStats, errorMessage } from "@/lib/api";
import type { AgentDailyStats, UserProfile } from "@/lib/types";
import { Button, Card, Spinner, StatCard, TableShell, Td, Th } from "@/components/ui";

type AgentOpenRow = {
  uid: string;
  name: string;
  customersOpened: number;
  firstDeposits: number;
  firstDepositCount: number;
  monthFirstDeposits: number;
  monthFirstDepositCount: number;
  customerCount: number;
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

/** Back-office: first-open cash (pay) only — customer play is not shown here. */
export function AdminDailyCustomerOpens() {
  const today = useMemo(() => todayIso(), []);
  const month = useMemo(() => monthRangeIso(), []);
  const [platformToday, setPlatformToday] = useState<number | null>(null);
  const [agents, setAgents] = useState<UserProfile[] | null>(null);
  const [opensByAgent, setOpensByAgent] = useState<Map<string, number> | null>(null);
  const [monthByAgent, setMonthByAgent] = useState<Map<string, { cash: number; count: number }> | null>(
    null
  );
  const [loadingCash, setLoadingCash] = useState(false);

  async function loadFirstOpenCash() {
    setLoadingCash(true);
    try {
      const res = await adminRebuildAgentDepositStats({});
      toast.success(
        `First-open cash loaded — ${res.firstDepositCustomers} customers across ${res.agentsUpdated} marketers.`
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoadingCash(false);
    }
  }

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
    const unsubOpens = onSnapshot(
      query(collection(db, "agentDailyStats"), where("date", "==", today)),
      (snap) => {
        const map = new Map<string, number>();
        for (const d of snap.docs) {
          const row = d.data() as AgentDailyStats;
          map.set(row.agentId, Number(row.customersOpened ?? 0));
        }
        setOpensByAgent(map);
      }
    );
    const unsubMonth = onSnapshot(
      query(collection(db, "agentDailyStats"), where("date", ">=", month.from)),
      (snap) => {
        const map = new Map<string, { cash: number; count: number }>();
        for (const d of snap.docs) {
          const row = d.data() as AgentDailyStats;
          const date = String(row.date || "");
          if (date > month.to) continue;
          const id = String(row.agentId || "");
          if (!id) continue;
          const cur = map.get(id) ?? { cash: 0, count: 0 };
          cur.cash += Number(row.firstDeposits ?? 0);
          cur.count += Number(row.firstDepositCount ?? 0);
          map.set(id, cur);
        }
        setMonthByAgent(map);
      }
    );
    return () => {
      unsubPlatform();
      unsubAgents();
      unsubOpens();
      unsubMonth();
    };
  }, [today, month.from, month.to]);

  const rows = useMemo<AgentOpenRow[] | null>(() => {
    if (!agents || !opensByAgent || !monthByAgent) return null;
    return agents
      .map((a) => {
        const stats = a.stats ?? {};
        const monthRow = monthByAgent.get(a.uid);
        return {
          uid: a.uid,
          name: a.name,
          customersOpened: opensByAgent.get(a.uid) ?? 0,
          firstDeposits: Number(stats.firstDeposits ?? 0),
          firstDepositCount: Number(stats.firstDepositCount ?? 0),
          monthFirstDeposits: Math.round((monthRow?.cash ?? 0) * 100) / 100,
          monthFirstDepositCount: monthRow?.count ?? 0,
          customerCount: Number(stats.customerCount ?? 0),
        };
      })
      .sort(
        (a, b) =>
          b.monthFirstDeposits - a.monthFirstDeposits ||
          b.firstDeposits - a.firstDeposits ||
          a.name.localeCompare(b.name)
      );
  }, [agents, opensByAgent, monthByAgent]);

  const agentTotalToday = useMemo(
    () => rows?.reduce((sum, r) => sum + r.customersOpened, 0) ?? 0,
    [rows]
  );
  const monthCashTotal = useMemo(
    () => rows?.reduce((sum, r) => sum + r.monthFirstDeposits, 0) ?? 0,
    [rows]
  );
  const lifetimeCashTotal = useMemo(
    () => rows?.reduce((sum, r) => sum + r.firstDeposits, 0) ?? 0,
    [rows]
  );

  if (platformToday === null || rows === null) {
    return (
      <Card className="flex items-center justify-center p-8">
        <Spinner />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="New customers today"
          value={platformToday}
          hint={`all signups · ${today}`}
          icon={<UserPlus size={20} />}
        />
        <StatCard
          label="Via agents today"
          value={agentTotalToday}
          hint="accounts linked to an agent"
          icon={<UserPlus size={20} />}
        />
        <StatCard
          label="First-open cash this month"
          value={formatXof(monthCashTotal)}
          hint={`${month.label} · what we pay on`}
        />
        <StatCard
          label="Lifetime first-open cash"
          value={formatXof(lifetimeCashTotal)}
          hint="all marketers · never reduces"
        />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
          <div>
            <h2 className="font-semibold text-emerald-100">First-open cash — marketer pay</h2>
            <p className="mt-1 text-sm text-slate-300">
              Green is actual first deposits via each marketer&apos;s link. That is the sale we pay at
              month end (40k → 7,000 · 60k+ → 8,500 · 100–150k → 10,000 · 150–200k → 12,000 · 200k+ →
              15,000). Customer play / bets is not in this table.
            </p>
          </div>
          <Button onClick={() => void loadFirstOpenCash()} disabled={loadingCash} className="shrink-0">
            {loadingCash ? "Loading first-open cash…" : "Load first-open cash"}
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">No agents on the platform yet.</p>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Marketer</Th>
                <Th className="text-right">This month first-open</Th>
                <Th className="text-right">Month-end pay</Th>
                <Th className="text-right">Lifetime first-open</Th>
                <Th className="text-right">First-time customers</Th>
                <Th className="text-right">Opened today</Th>
                <Th className="text-right">Accounts</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pay = monthEndPayFromFirstOpen(r.monthFirstDeposits);
                return (
                  <tr key={r.uid}>
                    <Td className="font-medium">{r.name}</Td>
                    <Td className="text-right tabular-nums font-semibold text-emerald-200">
                      {formatXof(r.monthFirstDeposits)}
                      <span className="block text-[10px] font-normal text-slate-500">
                        {r.monthFirstDepositCount} this month
                      </span>
                    </Td>
                    <Td className="text-right tabular-nums font-semibold text-amber-200">
                      {formatXof(pay.pay)}
                    </Td>
                    <Td className="text-right tabular-nums text-emerald-100">
                      {formatXof(r.firstDeposits)}
                    </Td>
                    <Td className="text-right tabular-nums text-slate-300">{r.firstDepositCount}</Td>
                    <Td className="text-right tabular-nums">
                      <span className={r.customersOpened > 0 ? "font-semibold text-emerald-300" : ""}>
                        {r.customersOpened}
                      </span>
                    </Td>
                    <Td className="text-right tabular-nums text-slate-400">{r.customerCount}</Td>
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
