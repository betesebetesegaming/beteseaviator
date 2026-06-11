"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import {
  Users,
  UserCog,
  TrendingUp,
  Banknote,
  HandCoins,
  AlertCircle,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { formatXof } from "@/lib/format";
import { StatCard } from "@/components/ui";

interface PlatformStats {
  customerCount?: number;
  agentCount?: number;
  totalBets?: number;
  totalWins?: number;
  totalDeposits?: number;
  totalWithdrawals?: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<PlatformStats>({});
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);

  useEffect(() => {
    const unsubStats = onSnapshot(doc(db, "stats", "platform"), (snap) => {
      if (snap.exists()) setStats(snap.data() as PlatformStats);
    });
    const q = query(
      collection(db, "paymentRequests"),
      where("type", "==", "withdrawal"),
      where("status", "==", "pending")
    );
    const unsubPending = onSnapshot(q, (snap) => setPendingWithdrawals(snap.size));
    return () => {
      unsubStats();
      unsubPending();
    };
  }, []);

  const ggr = (stats.totalBets ?? 0) - (stats.totalWins ?? 0);

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold">Platform Overview</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total Customers"
          value={stats.customerCount ?? 0}
          icon={<Users size={20} />}
        />
        <StatCard
          label="Total Agents"
          value={stats.agentCount ?? 0}
          icon={<UserCog size={20} />}
        />
        <StatCard
          label="Total GGR"
          value={formatXof(ggr)}
          hint="bets minus wins"
          icon={<TrendingUp size={20} />}
        />
        <StatCard
          label="Total Deposits"
          value={formatXof(stats.totalDeposits ?? 0)}
          icon={<Banknote size={20} />}
        />
        <StatCard
          label="Total Withdrawals"
          value={formatXof(stats.totalWithdrawals ?? 0)}
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
            hint="click to review the queue"
            icon={<AlertCircle size={20} />}
          />
        </Link>
      </div>
    </div>
  );
}
