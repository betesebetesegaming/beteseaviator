"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { UserPlus } from "lucide-react";
import { db } from "@/lib/firestore";
import { useAuth } from "@/lib/auth-context";
import { todayIso, daysAgoIso, formatXof } from "@/lib/format";
import type { AgentDailyStats, UserProfile } from "@/lib/types";
import { Card, Spinner, StatCard, TableShell, Td, Th } from "@/components/ui";

type AgentOpenRow = {
  uid: string;
  name: string;
  customersOpened: number;
  firstDeposits: number;
  firstDepositCount: number;
  allDeposits: number;
  customerCount: number;
  playGgr: number;
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

type AgentGgr = { lifetime: number; last7: number };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Platform total + per-agent breakdown for admin. */
export function AdminDailyCustomerOpens() {
  const today = useMemo(() => todayIso(), []);
  const from7 = useMemo(() => daysAgoIso(7), []);
  const [platformToday, setPlatformToday] = useState<number | null>(null);
  const [agents, setAgents] = useState<UserProfile[] | null>(null);
  const [opensByAgent, setOpensByAgent] = useState<Map<string, number> | null>(null);
  const [ggrByAgent, setGgrByAgent] = useState<Map<string, AgentGgr> | null>(null);

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
    const unsubGgr = onSnapshot(collection(db, "agentDailyGgr"), (snap) => {
      const betsL = new Map<string, number>();
      const winsL = new Map<string, number>();
      const bets7 = new Map<string, number>();
      const wins7 = new Map<string, number>();
      for (const d of snap.docs) {
        const row = d.data() as { agentId?: string; date?: string; bets?: number; wins?: number };
        const id = String(row.agentId || "");
        if (!id) continue;
        const bets = Number(row.bets ?? 0);
        const wins = Number(row.wins ?? 0);
        betsL.set(id, (betsL.get(id) ?? 0) + bets);
        winsL.set(id, (winsL.get(id) ?? 0) + wins);
        if (String(row.date || "") >= from7) {
          bets7.set(id, (bets7.get(id) ?? 0) + bets);
          wins7.set(id, (wins7.get(id) ?? 0) + wins);
        }
      }
      const map = new Map<string, AgentGgr>();
      for (const id of betsL.keys()) {
        map.set(id, {
          lifetime: Math.max(0, round2((betsL.get(id) ?? 0) - (winsL.get(id) ?? 0))),
          last7: Math.max(0, round2((bets7.get(id) ?? 0) - (wins7.get(id) ?? 0))),
        });
      }
      setGgrByAgent(map);
    });
    return () => {
      unsubPlatform();
      unsubAgents();
      unsubOpens();
      unsubGgr();
    };
  }, [today, from7]);

  const rows = useMemo<AgentOpenRow[] | null>(() => {
    if (!agents || !opensByAgent || !ggrByAgent) return null;
    return agents
      .map((a) => {
        const stats = a.stats ?? {};
        const fromLedger = ggrByAgent.get(a.uid);
        return {
          uid: a.uid,
          name: a.name,
          customersOpened: opensByAgent.get(a.uid) ?? 0,
          firstDeposits: Number(stats.firstDeposits ?? 0),
          firstDepositCount: Number(stats.firstDepositCount ?? 0),
          allDeposits: Number(stats.customerDeposits ?? 0),
          customerCount: Number(stats.customerCount ?? 0),
          playGgr:
            fromLedger?.lifetime ??
            Math.max(0, (stats.totalBets ?? 0) - (stats.totalWins ?? 0)),
        };
      })
      .sort(
        (a, b) =>
          b.firstDeposits - a.firstDeposits ||
          b.customersOpened - a.customersOpened ||
          a.name.localeCompare(b.name)
      );
  }, [agents, opensByAgent, ggrByAgent]);

  const agentTotalToday = useMemo(
    () => rows?.reduce((sum, r) => sum + r.customersOpened, 0) ?? 0,
    [rows]
  );

  if (platformToday === null || rows === null || ggrByAgent === null) {
    return (
      <Card className="flex items-center justify-center p-8">
        <Spinner />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="font-semibold">Marketer sales — first deposits via their link</h2>
          <p className="text-sm text-slate-400">
            First deposits are each customer&apos;s first qualifying top-up through that agent&apos;s
            link. That total only grows — it is what marketers worked for. Play GGR is later betting
            and can go up or down; it is not used to pay for opening accounts.
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">No agents on the platform yet.</p>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Agent / vendor</Th>
                <Th className="text-right">First deposits</Th>
                <Th className="text-right">First-time customers</Th>
                <Th className="text-right">All deposits</Th>
                <Th className="text-right">Play GGR</Th>
                <Th className="text-right">Opened today</Th>
                <Th className="text-right">Lifetime customers</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                return (
                  <tr key={r.uid}>
                    <Td className="font-medium">{r.name}</Td>
                    <Td className="text-right tabular-nums font-semibold text-emerald-200">
                      {formatXof(r.firstDeposits)}
                    </Td>
                    <Td className="text-right tabular-nums text-slate-300">{r.firstDepositCount}</Td>
                    <Td className="text-right tabular-nums text-slate-300">{formatXof(r.allDeposits)}</Td>
                    <Td className="text-right tabular-nums text-slate-500">{formatXof(r.playGgr)}</Td>
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
