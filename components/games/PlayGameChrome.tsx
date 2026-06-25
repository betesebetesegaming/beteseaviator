"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogOut, Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { formatXof } from "@/lib/format";
import { Logo } from "@/components/logo";

/** Compact Aviator-style top bar while a game is open on mobile. */
export function PlayGameChrome() {
  const router = useRouter();
  const { profile, wallet, logout } = useAuth();
  const balance = wallet?.balance ?? 0;
  const bonus = wallet?.bonusBalance ?? 0;

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-white/10 bg-[#0b0b0b]/95 backdrop-blur-sm">
      <div className="flex h-11 items-center justify-between gap-2 px-2 sm:h-12 sm:px-3">
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={() => router.push("/play")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
            aria-label="Back to games"
          >
            <ArrowLeft size={18} />
          </button>
          <Link href="/play" className="shrink-0">
            <Logo height={20} showWordmark={false} />
          </Link>
        </div>

        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-black tabular-nums text-emerald-400 sm:text-base">
              {new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(balance)}{" "}
              <span className="text-[10px] font-bold text-emerald-500/80 sm:text-xs">GMD</span>
            </p>
            {bonus > 0 ? (
              <p className="truncate text-[9px] font-semibold text-violet-400 sm:text-[10px]">
                +{formatXof(bonus)} bonus
              </p>
            ) : null}
          </div>
          <Link
            href="/play/wallet"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
            title="Wallet"
          >
            <Wallet size={16} />
          </Link>
          {profile ? (
            <button
              type="button"
              onClick={logout}
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-white sm:flex"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
