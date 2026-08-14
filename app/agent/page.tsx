"use client";

import { Users, UserCog, Banknote, TrendingUp, Award, WalletCards, Activity } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { formatXof } from "@/lib/format";
import { AgentMarketingLinks } from "@/components/agent/AgentMarketingLinks";
import { AgentQuickStart } from "@/components/agent/AgentQuickStart";
import { AgentTodayCustomerOpens } from "@/components/staff/DailyCustomerOpens";
import { Button, Card, StatCard } from "@/components/ui";

export default function AgentDashboard() {
  const { profile, wallet } = useAuth();
  const stats = profile?.stats ?? {};
  const ggr = (stats.totalBets ?? 0) - (stats.totalWins ?? 0);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Welcome back, {profile?.name}</h1>
      <p className="mb-6 text-sm text-slate-400">
        Use your QR code below to bring new customers — scan, WhatsApp, or SMS. Every signup is
        linked to you. Their first deposit via your link is added to your sales and never reduces.
      </p>

      {profile?.agentSlug ? (
        <div className="mb-6 space-y-4">
          <AgentMarketingLinks slug={profile.agentSlug} agentName={profile.name} />
          <AgentQuickStart />
        </div>
      ) : (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/10 text-sm text-amber-100">
          Your agent username is not set yet. Contact BETESE admin to assign one — your marketing
          link is created automatically from your username.
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <AgentTodayCustomerOpens />
        <Link href="/agent/operations">
          <StatCard
            label="Operations hub"
            value="Live · Ledger · Network"
            hint="your customers & transactions"
            icon={<Activity size={20} />}
          />
        </Link>
        <StatCard
          label="My Customers"
          value={stats.customerCount ?? 0}
          hint="players from your link"
          icon={<Users size={20} />}
        />
        <StatCard
          label="First deposits (your link)"
          value={formatXof(stats.firstDeposits ?? 0)}
          hint={`${stats.firstDepositCount ?? 0} customers · never reduces`}
          icon={<Banknote size={20} />}
        />
        <StatCard
          label="All customer deposits"
          value={formatXof(stats.customerDeposits ?? 0)}
          hint="every top-up after signup via your link"
          icon={<Banknote size={20} />}
        />
        <StatCard
          label="Play GGR"
          value={formatXof(Math.max(0, ggr))}
          hint="bets minus wins — not first-deposit pay"
          icon={<TrendingUp size={20} />}
        />
        <StatCard
          label="Commission Earned"
          value={formatXof(stats.commissionEarned ?? 0)}
          hint="lifetime commission credited"
          icon={<Award size={20} />}
        />
        <StatCard
          label="Commission Due"
          value={formatXof(wallet?.balance ?? 0)}
          hint="available to withdraw now"
          icon={<WalletCards size={20} />}
        />
      </div>
    </div>
  );
}
