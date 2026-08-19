"use client";

import { Users, Banknote, TrendingUp, Award, WalletCards, Activity } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { formatXof } from "@/lib/format";
import { commissionableGgr, agentCommissionDue } from "@/lib/platformFinancials";
import { AgentMarketingLinks } from "@/components/agent/AgentMarketingLinks";
import { AgentQuickStart } from "@/components/agent/AgentQuickStart";
import { AgentTodayCustomerOpens } from "@/components/staff/DailyCustomerOpens";
import { AgentPeriodStats } from "@/components/staff/AgentPeriodStats";
import { Card, StatCard } from "@/components/ui";

export default function AgentDashboard() {
  const { profile, wallet } = useAuth();
  const stats = profile?.stats ?? {};
  const ggr = commissionableGgr(
    stats.customerDeposits ?? 0,
    stats.customerWithdrawals ?? 0,
    stats.customerCashHeld ?? 0
  );
  const share = agentCommissionDue(ggr, 0.05);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Welcome back, {profile?.name}</h1>
      <p className="mb-6 text-sm text-slate-400">
        Use your QR code below to bring new customers. You earn 5% of GGR profit from every
        customer on your link — first deposit and later top-ups both count. That 5% adds up
        every day, week, and month. Recycled winnings are not extra profit.
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
          label="Customer Deposits"
          value={formatXof(stats.customerDeposits ?? 0)}
          hint="all top-ups — not commission"
          icon={<Banknote size={20} />}
        />
        <StatCard
          label="GGR profit"
          value={formatXof(ggr)}
          hint="deposits − withdrawals − cash still in wallets"
          icon={<TrendingUp size={20} />}
        />
        <StatCard
          label="Your 5%"
          value={formatXof(share)}
          hint="lifetime share of that profit"
          icon={<Award size={20} />}
        />
        <StatCard
          label="Commission Earned"
          value={formatXof(stats.commissionEarned ?? 0)}
          hint="already credited from daily 5%"
          icon={<Award size={20} />}
        />
        <StatCard
          label="Commission Due"
          value={formatXof(wallet?.balance ?? 0)}
          hint="available to withdraw now"
          icon={<WalletCards size={20} />}
        />
      </div>

      <div className="mt-6">
        <AgentPeriodStats />
      </div>
    </div>
  );
}
