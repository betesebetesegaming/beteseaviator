"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { GameDepositSheet } from "@/components/games/GameDepositSheet";

/** Minimal floating controls — does not reduce game iframe height. */
export function GameFloatingBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("mode") === "demo";
  const { profile, wallet } = useAuth();
  const { openAuth } = useAuthModal();
  const [depositOpen, setDepositOpen] = useState(false);
  const balance = wallet?.balance ?? 0;

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex items-start justify-between gap-2 px-2 pt-[max(0.35rem,env(safe-area-inset-top))]"
        aria-hidden={false}
      >
        <button
          type="button"
          onClick={() => router.push("/play")}
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm active:bg-black/75"
          aria-label="Back to games"
        >
          <ArrowLeft size={18} />
        </button>

        {isDemo ? (
          <button
            type="button"
            onClick={() => openAuth("register")}
            className="pointer-events-auto rounded-full bg-[#f5e042] px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-black"
          >
            Sign up to play
          </button>
        ) : (
          <div className="pointer-events-auto flex items-center gap-1.5">
            <div className="rounded-full bg-black/55 px-2.5 py-1 backdrop-blur-sm">
              <p className="text-xs font-black tabular-nums text-emerald-400 sm:text-sm">
                {new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(balance)}{" "}
                <span className="text-[9px] font-bold text-emerald-500/90">GMD</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDepositOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 active:scale-95"
              title="Add money"
              aria-label="Add money"
            >
              <Plus size={20} strokeWidth={2.5} />
            </button>
            <Link
              href="/play/wallet"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm active:bg-black/75"
              title="Wallet"
            >
              <Wallet size={16} />
            </Link>
          </div>
        )}
      </div>

      {profile && !isDemo ? (
        <GameDepositSheet open={depositOpen} onClose={() => setDepositOpen(false)} />
      ) : null}
    </>
  );
}
