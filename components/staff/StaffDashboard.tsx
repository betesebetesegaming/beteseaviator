"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import {
  Users,
  UserCog,
  TrendingUp,
  Banknote,
  HandCoins,
  AlertCircle,
  Radio,
  Activity,
  Percent,
} from "lucide-react";
import { db } from "@/lib/firestore";
import { useAuth } from "@/lib/auth-context";
import { getOperationsHub } from "@/lib/api";
import { useLivePresence } from "@/lib/hooks/useLivePresence";
import { formatXof } from "@/lib/format";
import { roleLabel } from "@/lib/staff-nav";
import { isAgentRole } from "@/lib/roles";
import { StaffAccountCard } from "@/components/staff/StaffAccountCard";
import { AgentPeriodStats } from "@/components/staff/AgentPeriodStats";
import { AgentQuickStart } from "@/components/agent/AgentQuickStart";
import { AgentProfitOverview } from "@/components/agent/AgentProfitOverview";
import {
  AdminDailyCustomerOpens,
  AgentTodayCustomerOpens,
} from "@/components/staff/DailyCustomerOpens";
import {
  AdminTodayDepositsStat,
  AgentTodayDepositsStat,
} from "@/components/accounts/TodayDepositsPanel";
import { apiProviderCommissionDue, ggrFromTotals } from "@/lib/platformFinancials";
import { mergePlatformSettings } from "@/lib/platformSettingsMerge";
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

export function StaffDashboard() {
  const { profile, wallet } = useAuth();
  const isAdmin = profile?.role === "admin";
  const stats = profile?.stats ?? {};
  const presence = useLivePresence(isAdmin);
  const [hubLive, setHubLive] = useState<number | null>(null);

  const [platformStats, setPlatformStats] = useState<PlatformStats>({});
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    const unsubStats = onSnapshot(doc(db, "stats", "platform"), (snap) => {
      if (snap.exists()) setPlatformStats(snap.data() as PlatformStats);
    });
    const unsubSettings = onSnapshot(doc(db, "settings", "platform"), (snap) => {
      if (snap.exists()) {
        setSettings(mergePlatformSettings(snap.data() as Partial<PlatformSettings>));
      }
    });
    const pendingQ = query(
      collection(db, "withdrawal_requests"),
      where("status", "in", ["Pending", "Processing"])
    );
    const unsubPending = onSnapshot(pendingQ, (snap) => setPendingWithdrawals(snap.size));
    return () => {
      unsubStats();
      unsubSettings();
      unsubPending();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !presence.error) {
      setHubLive(null);
      return;
    }
    let cancelled = false;
    const tick = () => {
      void getOperationsHub({ limit: 1 })
        .then((res) => {
          if (!cancelled) setHubLive(res.liveOnline);
        })
        .catch(() => undefined);
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isAdmin, presence.error]);

  const onlineCount = presence.error ? (hubLive ?? 0) : presence.onlineCount;

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
            <StatCard
              label="Live now"
              value={onlineCount}
              hint="players with the app open · last 10 min"
              icon={<Radio size={20} />}
            />
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
          <AdminTodayDepositsStat />
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
          <Link href="/admin/accounts">
            <StatCard
              label={`${providerName} due (all time)`}
              value={formatXof(financials.providerDue)}
              hint={`${providerPct}% of lifetime GGR — open Accounts for week/month`}
              icon={<Percent size={20} />}
            />
          </Link>
        </div>

        <AdminDailyCustomerOpens />

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-emerald-500/30 p-4">
            <h2 className="mb-2 font-semibold text-emerald-100">Create agent account</h2>
            <p className="mb-4 text-sm text-slate-400">
              Add a shop agent or marketer. Admin creates their first staff login — agents cannot
              self-register.
            </p>
            <Link href="/admin/agents?create=1">
              <Button className="w-full gap-2">
                <UserCog size={16} /> Create agent account
              </Button>
            </Link>
          </Card>
          <Card className="p-4">
            <h2 className="mb-2 font-semibold">All users</h2>
            <p className="mb-4 text-sm text-slate-400">Customers, agents, cash desk, Player IDs, suspend accounts.</p>
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
            <h2 className="mb-2 font-semibold">Accounts &amp; GGR</h2>
            <p className="mb-4 text-sm text-slate-400">Week/month GGR, QTech due, and agent commissions.</p>
            <Link href="/admin/accounts?tab=today">
              <Button variant="secondary" className="w-full">
                Today’s deposits
              </Button>
            </Link>
          </Card>
          <Card className="p-4">
            <h2 className="mb-2 font-semibold">Platform settings</h2>
            <p className="mb-4 text-sm text-slate-400">QTech commission %, bonuses, limits, and promos.</p>
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
          Share your marketing link. Deposits, played, wins, and profit/GGR on your account are the
          same figures BETESE staff see. You earn 5% of this month&apos;s GGR profit.
        </p>
      </div>

      <StaffAccountCard profile={profile} />

      {isAgentRole(profile.role) && profile.agentSlug ? <AgentQuickStart /> : null}

      {isAgentRole(profile.role) ? (
        <AgentProfitOverview
          agentId={profile.uid}
          commissionEarned={stats.commissionEarned ?? 0}
          commissionWallet={wallet?.balance ?? 0}
          storedDeposits={stats.customerDeposits ?? 0}
          anchors={stats}
        />
      ) : null}

      <AgentPeriodStats />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AgentTodayCustomerOpens />
        <AgentTodayDepositsStat />
        <Link href="/admin/operations">
          <StatCard
            label="Operations hub"
            value="Live · Ledger · Network"
            hint="your customers & transactions"
            icon={<Activity size={20} />}
          />
        </Link>
        <StatCard label="My Customers" value={stats.customerCount ?? 0} icon={<Users size={20} />} />
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
        <Card className="p-4">
          <h2 className="mb-2 font-semibold">Accounts &amp; profit</h2>
          <p className="mb-4 text-sm text-slate-400">Your sales (deposits), GGR profit, and commissions.</p>
          <Link href="/admin/accounts?tab=today">
            <Button variant="secondary" className="w-full">
              Today’s deposits
            </Button>
          </Link>
        </Card>
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
