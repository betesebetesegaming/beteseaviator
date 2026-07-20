"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { Logo } from "@/components/logo";
import { GameDepositSheet } from "@/components/games/GameDepositSheet";

/** Minimal floating controls — top-left branding only; wallet / sign-up sit above game bet panels. */
export function GameFloatingBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("mode") === "demo";
  const { profile, wallet } = useAuth();
  const { openAuth } = useAuthModal();
  const [depositOpen, setDepositOpen] = useState(false);
  const balance = wallet?.balance ?? 0;
  const isGuestDemo = isDemo && !profile;
  const showWallet = profile && !isDemo;

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[70] px-2 pt-[max(0.35rem,env(safe-area-inset-top))]"
        aria-hidden={false}
      >
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => router.push("/play")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm active:bg-black/75"
            aria-label="Back to games"
          >
            <ArrowLeft size={16} />
          </button>
          <Link
            href="/play"
            className="flex items-center rounded-full bg-black/40 px-1.5 py-0.5 backdrop-blur-sm"
            aria-label="BETESE home"
          >
            <Logo height={18} showWordmark={false} />
          </Link>
        </div>
      </div>

      {isGuestDemo ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex justify-center px-3 pb-[max(5.75rem,calc(env(safe-area-inset-bottom)+5.25rem))]">
          <button
            type="button"
            onClick={() => openAuth("register")}
            className="pointer-events-auto rounded-full bg-[#f5e042]/95 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-black shadow-lg shadow-black/30 backdrop-blur-sm"
          >
            Sign up to play for real
          </button>
        </div>
      ) : null}

      {showWallet ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex justify-end gap-1.5 px-2 pb-[max(5.75rem,calc(env(safe-area-inset-bottom)+5.25rem))]">
          <div className="pointer-events-auto flex items-center gap-1.5">
            <div className="rounded-full bg-black/60 px-2.5 py-1 backdrop-blur-sm">
              <p className="text-xs font-black tabular-nums text-emerald-400">
                {new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(balance)}{" "}
                <span className="text-[9px] font-bold text-emerald-500/90">GMD</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDepositOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 active:scale-95"
              title={`Add money — from GMD 20`}
              aria-label="Add money"
            >
              <Plus size={18} strokeWidth={2.5} />
            </button>
            <Link
              href="/play/wallet"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm active:bg-black/75"
              title="Wallet"
            >
              <Wallet size={15} />
            </Link>
          </div>
        </div>
      ) : null}

      {profile && !isDemo ? (
        <GameDepositSheet open={depositOpen} onClose={() => setDepositOpen(false)} />
      ) : null}
    </>
  );
}
