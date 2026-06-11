"use client";

import Link from "next/link";
import { Plane, Wallet, LogOut } from "lucide-react";
import { RoleGuard } from "@/components/role-guard";
import { useAuth } from "@/lib/auth-context";
import { formatXof } from "@/lib/format";

function PlayHeader() {
  const { profile, wallet, logout } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/play" className="flex items-center gap-2 font-bold">
          <Plane className="text-emerald-400" size={22} />
          <span className="hidden sm:inline">
            BETESE <span className="text-emerald-400">Aviator</span>
          </span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden text-sm text-slate-400 md:inline">
            Hi, {profile?.name?.split(" ")[0] ?? "player"}
          </span>
          <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-bold text-emerald-300">
            {formatXof(wallet?.balance ?? 0)}
          </span>
          <Link
            href="/play/wallet"
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium hover:bg-slate-700"
          >
            <Wallet size={16} /> <span className="hidden sm:inline">Wallet</span>
          </Link>
          <button
            onClick={logout}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allow={["player"]}>
      <PlayHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </RoleGuard>
  );
}
