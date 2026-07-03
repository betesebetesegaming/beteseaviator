"use client";

import Link from "next/link";
import { ArrowLeft, Gift } from "lucide-react";
import { ReferralPanel } from "@/components/wallet/ReferralPanel";
import { useAuth } from "@/lib/auth-context";

export default function ReferralPage() {
  const { profile } = useAuth();

  if (!profile || profile.role !== "player") {
    return (
      <p className="text-center text-slate-400">
        <Link href="/play" className="text-emerald-400 hover:underline">
          Sign in
        </Link>{" "}
        as a player to invite friends and earn bonuses.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/play/wallet"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"
      >
        <ArrowLeft size={16} /> Wallet
      </Link>
      <div className="mb-6 flex items-start gap-3">
        <div className="rounded-lg bg-violet-500/15 p-2">
          <Gift size={22} className="text-violet-300" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Invite friends</h1>
          <p className="mt-1 text-sm text-slate-400">
            Share your personal QR or link — not the same as an agent shop link. Earn when friends
            join, deposit, and play.
          </p>
        </div>
      </div>
      <ReferralPanel />
    </div>
  );
}
