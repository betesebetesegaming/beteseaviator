"use client";

import { useEffect, useState } from "react";
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
  Receipt,
  UserPlus,
} from "lucide-react";
import { db, rtdb } from "@/lib/firebase";
import { formatXof } from "@/lib/format";
import { StatCard, Card, Button } from "@/components/ui";

interface PlatformStats {
  customerCount?: number;
  agentCount?: number;
  totalBets?: number;
  totalWins?: number;
  totalDeposits?: number;
  totalWithdrawals?: number;
}

const ONLINE_MS = 3 * 60 * 1000;

export default function AdminDashboard() {
  const [stats, setStats] = useState<PlatformStats>({});
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);

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
      unsubPending();
      unsubPresence();
    };
  }, []);

  const ggr = (stats.totalBets ?? 0) - (stats.totalWins ?? 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">Platform Overview</h1>
        <p className="mt-1 text-sm text-slate-400">
          Create accounts under Users · watch live activity · audit every GMD movement in Ledger.
        </p>
      </div>

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
        <Link href="/admin/live">
          <StatCard
            label="Live now"
            value={onlineCount}
            hint="click for live user list"
            icon={<Radio size={20} />}
          />
        </Link>
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

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="mb-2 font-semibold text-white">Accounts</h2>
          <p className="mb-4 text-sm text-slate-400">
            Admin creates all roles. Super agents create sub-agents and customers from their
            dashboard.
          </p>
          <Link href="/admin/users">
            <Button variant="secondary" className="w-full gap-2">
              <UserPlus size={16} /> Manage users
            </Button>
          </Link>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold text-white">Live users</h2>
          <p className="mb-4 text-sm text-slate-400">
            See who is online now — customers on /play, agents and admins on their dashboards.
          </p>
          <Link href="/admin/live">
            <Button variant="secondary" className="w-full gap-2">
              <Radio size={16} /> Open live view
            </Button>
          </Link>
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold text-white">Transaction ledger</h2>
          <p className="mb-4 text-sm text-slate-400">
            Full audit trail with references, before/after balances and admin adjustment notes.
          </p>
          <Link href="/admin/transactions">
            <Button variant="secondary" className="w-full gap-2">
              <Receipt size={16} /> View ledger
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
