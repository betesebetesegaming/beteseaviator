"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
        as a player to invite friends.
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
      <h1 className="mb-5 text-xl font-bold">Referral bonus account</h1>
      <ReferralPanel />
    </div>
  );
}
