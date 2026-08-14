"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { UserPlus } from "lucide-react";
import { db } from "@/lib/firestore";
import { useAuth } from "@/lib/auth-context";
import { todayIso, formatXof } from "@/lib/format";
import type { AgentDailyStats, UserProfile } from "@/lib/types";
import { Card, Spinner, StatCard, TableShell, Td, Th } from "@/components/ui";

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

/** Platform total + per-agent breakdown for admin. */
export function AdminDailyCustomerOpens() {
  const today = useMemo(() => todayIso(), []);
  const [platformToday, setPlatformToday] = useState<number | null>(null);
  const [agents, setAgents] = useState<UserProfile[] | null>(null);
  const [opensByAgent, setOpensByAgent] = useState<Map<string, number> | null>(null);

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
    return () => {
      unsubPlatform();
      unsubAgents();
      unsubOpens();
    };
  }, [today]);

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

  const agentTotalToday = useMemo(
    () => rows?.reduce((sum, r) => sum + r.customersOpened, 0) ?? 0,
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
          <h2 className="font-semibold">Agent / vendor opens today</h2>
          <p className="text-sm text-slate-400">
            How many customer accounts each agent successfully opened today.
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">No agents on the platform yet.</p>
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Agent / vendor</Th>
                <Th className="text-right">Sales (GGR)</Th>
                <Th className="text-right">Deposits</Th>
                <Th className="text-right">Opened today</Th>
                <Th className="text-right">Lifetime customers</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const agent = agents!.find((a) => a.uid === r.uid);
                const lifetime = agent?.stats?.customerCount ?? 0;
                const stats = agent?.stats ?? {};
                const ggr = Math.max(0, (stats.totalBets ?? 0) - (stats.totalWins ?? 0));
                const deposits = stats.customerDeposits ?? 0;
                return (
                  <tr key={r.uid}>
                    <Td className="font-medium">{r.name}</Td>
                    <Td className="text-right tabular-nums text-slate-300">{formatXof(ggr)}</Td>
                    <Td className="text-right tabular-nums text-slate-300">{formatXof(deposits)}</Td>
                    <Td className="text-right tabular-nums">
                      <span className={r.customersOpened > 0 ? "font-semibold text-emerald-300" : ""}>
                        {r.customersOpened}
                      </span>
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
