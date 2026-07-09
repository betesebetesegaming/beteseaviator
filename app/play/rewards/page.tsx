"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Gift, Sparkles, Crown, Users, Megaphone } from "lucide-react";
import { db } from "@/lib/firestore";
import { useAuth } from "@/lib/auth-context";
import { isLiveOffer } from "@/lib/smartBonus";
import type { SmartBonusOffer } from "@/lib/types";
import { SmartBonusCard } from "@/components/wallet/SmartBonusCard";
import { Card, Spinner } from "@/components/ui";

const RANK = ["activated", "sent", "approved", "pending", "completed", "rejected", "expired"];

export default function RewardsPage() {
  const { fbUser, wallet } = useAuth();
  const [offers, setOffers] = useState<SmartBonusOffer[] | null>(null);

  useEffect(() => {
    if (!fbUser) return;
    const q = query(collection(db, "smartBonusOffers"), where("userId", "==", fbUser.uid));
    return onSnapshot(
      q,
      (snap) => setOffers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SmartBonusOffer)),
      () => setOffers([])
    );
  }, [fbUser]);

  // The offer worth showing: an activated one, else the most live one.
  const current = useMemo(() => {
    if (!offers || offers.length === 0) return null;
    const relevant = offers
      .filter((o) => o.status === "activated" || isLiveOffer(o.status))
      .sort((a, b) => RANK.indexOf(a.status) - RANK.indexOf(b.status));
    return relevant[0] ?? null;
  }, [offers]);

  if (!fbUser) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-bold">
        <Gift size={20} className="text-violet-300" /> My Rewards
      </h1>
      <p className="mb-5 text-sm text-slate-400">Your personalized bonuses and loyalty rewards, all in one place.</p>

      {offers === null ? (
        <Spinner />
      ) : current ? (
        <div className="mb-6">
          <SmartBonusCard offer={current} wallet={wallet} />
        </div>
      ) : (
        <Card className="mb-6 border-white/10 text-sm text-slate-300">
          <div className="flex items-center gap-2 font-semibold">
            <Sparkles size={16} className="text-violet-300" /> Smart Bonus
          </div>
          <p className="mt-1 text-slate-400">
            No Smart Bonus waiting right now. Keep playing — BETESE picks loyal players for exclusive welcome-back
            bonuses automatically.
          </p>
        </Card>
      )}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">All reward types</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <RewardTile
          icon={<Sparkles size={18} />}
          title="Smart Bonus"
          desc="AI-selected welcome-back offers based on your play."
          status={current ? (current.status === "activated" ? "Active" : "Available") : "None active"}
          tone={current ? "good" : "muted"}
        />
        <RewardTile
          icon={<Gift size={18} />}
          title="Deposit Bonuses"
          desc="First-deposit, weekly and weekend match bonuses."
          status="On every deposit"
          tone="good"
          href="/play/wallet?tab=deposit"
        />
        <RewardTile
          icon={<Users size={18} />}
          title="Referral Rewards"
          desc="Invite friends and earn when they play."
          status="Invite & earn"
          tone="good"
          href="/play/referral"
        />
        <RewardTile
          icon={<Crown size={18} />}
          title="VIP Rewards"
          desc="Higher limits and perks as you level up."
          status="Coming soon"
          tone="muted"
        />
        <RewardTile
          icon={<Megaphone size={18} />}
          title="Promotional Rewards"
          desc="Limited-time campaigns and seasonal offers."
          status="Watch this space"
          tone="muted"
        />
      </div>
    </div>
  );
}

function RewardTile({
  icon,
  title,
  desc,
  status,
  tone,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  status: string;
  tone: "good" | "muted";
  href?: string;
}) {
  const body = (
    <Card className="h-full transition-colors hover:border-violet-500/30">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold">
          <span className="text-violet-300">{icon}</span> {title}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            tone === "good" ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-600/20 text-slate-400"
          }`}
        >
          {status}
        </span>
      </div>
      <p className="text-xs text-slate-400">{desc}</p>
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
