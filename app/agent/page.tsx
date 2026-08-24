"use client";

import { Users, Activity } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { AgentMarketingLinks } from "@/components/agent/AgentMarketingLinks";
import { AgentQuickStart } from "@/components/agent/AgentQuickStart";
import { AgentProfitOverview } from "@/components/agent/AgentProfitOverview";
import { AgentTodayCustomerOpens } from "@/components/staff/DailyCustomerOpens";
import { AgentPeriodStats } from "@/components/staff/AgentPeriodStats";
import { Card, StatCard } from "@/components/ui";

export default function AgentDashboard() {
  const { profile, wallet } = useAuth();
  const stats = profile?.stats ?? {};

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Welcome back, {profile?.name}</h1>
      <p className="mb-6 text-sm text-slate-400">
        Use your QR code below to bring new customers. Deposits, played, wins, and profit on your
        account match the BETESE backoffice. You earn 5% of this month&apos;s profit. A new month
        starts that 5% at zero.
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

      <div className="mb-6">
        <AgentProfitOverview
          agentId={profile?.uid}
          commissionEarned={stats.commissionEarned ?? 0}
          commissionWallet={wallet?.balance ?? 0}
          storedDeposits={stats.customerDeposits ?? 0}
          anchors={stats}
        />
      </div>

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
      </div>

      <div className="mt-6">
        <AgentPeriodStats />
      </div>
    </div>
  );
}
