"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { onValue, ref } from "firebase/database";
import {
  Users,
  UserCog,
  TrendingUp,
  Banknote,
  HandCoins,
  AlertCircle,
  Radio,
  Activity,
  Award,
  WalletCards,
  Percent,
} from "lucide-react";
import { db } from "@/lib/firestore";
import { rtdb } from "@/lib/rtdb";
import { useAuth } from "@/lib/auth-context";
import { formatXof } from "@/lib/format";
import { roleLabel } from "@/lib/staff-nav";
import { StaffAccountCard } from "@/components/staff/StaffAccountCard";
import { apiProviderCommissionDue, ggrFromTotals } from "@/lib/platformFinancials";
import { DEFAULT_SETTINGS, type PlatformSettings } from "@/lib/types";
import { Button, Card, StatCard } from "@/components/ui";

interface PlatformStats {
  customerCount?: number;
  agentCount?: number;
  totalBets?: number;
  totalWins?: number;
  totalDeposits?: number;
  totalWithdrawals?: number;
}

const ONLINE_MS = 3 * 60 * 1000;

export function StaffDashboard() {
  const { profile, wallet } = useAuth();
  const isAdmin = profile?.role === "admin";
  const stats = profile?.stats ?? {};
  const agentGgr = (stats.totalBets ?? 0) - (stats.totalWins ?? 0);

  const [platformStats, setPlatformStats] = useState<PlatformStats>({});
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    const unsubStats = onSnapshot(doc(db, "stats", "platform"), (snap) => {
      if (snap.exists()) setPlatformStats(snap.data() as PlatformStats);
    });
    const unsubSettings = onSnapshot(doc(db, "settings", "platform"), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as PlatformSettings;
        setSettings({ ...DEFAULT_SETTINGS, ...data });
      }
    });
    const pendingQ = query(
      collection(db, "withdrawal_requests"),
      where("status", "in", ["Pending", "Processing"])
    );
    const unsubPending = onSnapshot(pendingQ, (snap) => setPendingWithdrawals(snap.size));
    const unsubPresence = onValue(ref(rtdb, "presence"), (snap) => {
      const val = snap.val() as Record<string, { lastSeen?: number }> | null;
      if (!val) {
        setOnlineCount(0);
        return;
      }
      const now = Date.now();
      setOnlineCount(
        Object.values(val).filter((r) => now - Number(r.lastSeen ?? 0) <= ONLINE_MS).length
      );
    });
    return () => {
      unsubStats();
      unsubSettings();
      unsubPending();
      unsubPresence();
    };
  }, [isAdmin]);

  const financials = useMemo(() => {
    const totalBets = platformStats.totalBets ?? 0;
    const totalWins = platformStats.totalWins ?? 0;
    const totalDeposits = platformStats.totalDeposits ?? 0;
    const totalWithdrawals = platformStats.totalWithdrawals ?? 0;
    const ggr = ggrFromTotals({ totalBets, totalWins });
    const providerDue = apiProviderCommissionDue(ggr, settings.apiProviderRate ?? 0);
    return { totalBets, totalWins, totalDeposits, totalWithdrawals, ggr, providerDue };
  }, [platformStats, settings.apiProviderRate]);

  if (!profile) return null;

  if (isAdmin) {
    const providerName = settings.apiProviderName || "API Provider";
    const providerPct = ((settings.apiProviderRate ?? 0) * 100).toFixed(1);

    return (
      <div className="space-y-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-violet-400">
            {roleLabel(profile.role)} backend
          </p>
          <h1 className="text-xl font-bold">Platform overview</h1>
          <p className="mt-1 text-sm text-slate-400">
            Full access — all users, wallets, live activity, and transactions.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Total Customers" value={platformStats.customerCount ?? 0} icon={<Users size={20} />} />
          <StatCard label="Total Agents" value={platformStats.agentCount ?? 0} icon={<UserCog size={20} />} />
          <Link href="/admin/operations?tab=live">
            <StatCard label="Live now" value={onlineCount} hint="operations hub" icon={<Radio size={20} />} />
          </Link>
          <StatCard
            label="Total GGR"
            value={formatXof(financials.ggr)}
            hint="bets minus wins"
            icon={<TrendingUp size={20} />}
          />
          <StatCard
            label="Total Deposits"
            value={formatXof(financials.totalDeposits)}
            icon={<Banknote size={20} />}
          />
          <StatCard
            label="Total Withdrawals"
            value={formatXof(financials.totalWithdrawals)}
            icon={<HandCoins size={20} />}
          />
          <Link href="/admin/withdrawals">
            <StatCard
              label="Pending Withdrawals"
              value={
                <span className={pendingWithdrawals > 0 ? "text-amber-300" : undefined}>
                  {pendingWithdrawals}
                </span>
              }
              hint="ModemPay queue"
              icon={<AlertCircle size={20} />}
            />
          </Link>
          <Link href="/admin/settings">
            <StatCard
              label={`${providerName} due`}
              value={formatXof(financials.providerDue)}
              hint={`${providerPct}% of GGR`}
              icon={<Percent size={20} />}
            />
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-4">
            <h2 className="mb-2 font-semibold">All users</h2>
            <p className="mb-4 text-sm text-slate-400">Create customers, agents, sub-agents, and admins.</p>
            <Link href="/admin/users">
              <Button variant="secondary" className="w-full gap-2">
                <Users size={16} /> Manage users
              </Button>
            </Link>
          </Card>
          <Card className="p-4">
            <h2 className="mb-2 font-semibold">Operations hub</h2>
            <p className="mb-4 text-sm text-slate-400">Live users, full ledger, everyone on the platform.</p>
            <Link href="/admin/operations">
              <Button variant="secondary" className="w-full gap-2">
                <Activity size={16} /> Open operations
              </Button>
            </Link>
          </Card>
          <Card className="p-4">
            <h2 className="mb-2 font-semibold">Platform settings</h2>
            <p className="mb-4 text-sm text-slate-400">API provider commission %, bonuses, limits, and promos.</p>
            <Link href="/admin/settings">
              <Button variant="secondary" className="w-full">
                Settings
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-sky-400">
          {roleLabel(profile.role)} backend
        </p>
        <h1 className="text-xl font-bold">Welcome back, {profile.name}</h1>
        <p className="mt-1 text-sm text-slate-400">
          Your link, customers, commissions, and network transactions — one login, your access only.
        </p>
      </div>

      <StaffAccountCard profile={profile} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/admin/operations">
          <StatCard
            label="Operations hub"
            value="Live · Ledger · Network"
            hint="your scope only"
            icon={<Activity size={20} />}
          />
        </Link>
        <StatCard label="My Customers" value={stats.customerCount ?? 0} icon={<Users size={20} />} />
        {profile.role === "super_agent" && (
          <StatCard label="Sub Agents" value={stats.subAgentCount ?? 0} icon={<UserCog size={20} />} />
        )}
        <StatCard label="Customer Deposits" value={formatXof(stats.customerDeposits ?? 0)} icon={<Banknote size={20} />} />
        <StatCard label="Sales (GGR)" value={formatXof(Math.max(0, agentGgr))} icon={<TrendingUp size={20} />} />
        <StatCard label="Commission Due" value={formatXof(wallet?.balance ?? 0)} icon={<WalletCards size={20} />} />
        <StatCard label="Commission Earned" value={formatXof(stats.commissionEarned ?? 0)} icon={<Award size={20} />} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <h2 className="mb-2 font-semibold">Add customer</h2>
          <Link href="/admin/customers">
            <Button variant="secondary" className="w-full">
              My customers
            </Button>
          </Link>
        </Card>
        {profile.role === "super_agent" && (
          <Card className="p-4">
            <h2 className="mb-2 font-semibold">Add sub-agent</h2>
            <Link href="/admin/sub-agents">
              <Button variant="secondary" className="w-full">
                Sub agents
              </Button>
            </Link>
          </Card>
        )}
        <Card className="p-4">
          <h2 className="mb-2 font-semibold">My wallet</h2>
          <Link href="/admin/agent-wallet">
            <Button variant="secondary" className="w-full">
              Commission wallet
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
