"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, UserPlus, Wallet, LogOut } from "lucide-react";
import { useAuth, homeFor } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { formatXof } from "@/lib/format";
import { Logo } from "@/components/logo";
import { PresenceTracker } from "@/components/PresenceTracker";
import { LobbyBackgroundShell } from "@/components/games/LobbyBackgroundShell";
import { AgentReferralBanner } from "@/components/games/AgentReferralBanner";
import { parseAgentSlugFromHost } from "@/lib/agentLinks";

const PendingDepositReconciler = dynamic(
  () =>
    import("@/components/PendingDepositReconciler").then((m) => m.PendingDepositReconciler),
  { ssr: false }
);

function PlayAuthFromQuery() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openAuth } = useAuthModal();

  useEffect(() => {
    const signup = searchParams.get("signup");
    let ref = searchParams.get("ref")?.toLowerCase().trim() || null;

    if (!ref && typeof window !== "undefined") {
      ref = parseAgentSlugFromHost(window.location.hostname);
    }

    if (signup || ref) {
      openAuth("register", ref);
      router.replace(ref ? `/play?ref=${encodeURIComponent(ref)}` : "/play", { scroll: false });
    }
  }, [searchParams, openAuth, router]);

  return null;
}

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { openAuth } = useAuthModal();
  const { fbUser, profile, wallet, loading, logout } = useAuth();

  const isPlayer =
    !!profile && profile.role === "player" && profile.status === "active";
  const walletFrozen = Boolean(wallet?.frozen);
  const needsProfile = !!fbUser && !profile && !loading;

  useEffect(() => {
    if (loading || !profile) return;
    if (profile.role !== "player") {
      router.replace(homeFor(profile.role));
    }
  }, [loading, profile, router]);

  return (
    <LobbyBackgroundShell>
      <Suspense fallback={null}>
        <PlayAuthFromQuery />
      </Suspense>
      <PresenceTracker />
      {isPlayer && !walletFrozen ? <PendingDepositReconciler /> : null}
      <AgentReferralBanner />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/75 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/play">
            <Logo height={34} />
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            {isPlayer ? (
              <>
                <span className="hidden text-sm text-slate-400 md:inline">
                  Hi, {profile.name.split(" ")[0]}
                </span>
                <span className="hidden rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-bold text-emerald-300 sm:inline">
                  {formatXof(wallet?.balance ?? 0)}
                </span>
                {(wallet?.bonusBalance ?? 0) > 0 && (
                  <span className="hidden rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-xs font-bold text-violet-300 md:inline">
                    +{formatXof(wallet?.bonusBalance ?? 0)} bonus
                  </span>
                )}
                {walletFrozen && (
                  <span className="hidden rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-200 sm:inline">
                    Contact support
                  </span>
                )}
                <Link
                  href="/play/wallet"
                  className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium hover:bg-slate-700"
                >
                  <Wallet size={16} />{" "}
                  <span className="hidden sm:inline">{walletFrozen ? "History" : "Wallet"}</span>
                </Link>
                <button
                  onClick={logout}
                  className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
                  title="Logout"
                >
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              <>
                <span className="hidden rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-200 sm:inline">
                  Demo mode
                </span>
                <button
                  type="button"
                  onClick={() => openAuth(needsProfile ? "complete" : "login")}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium hover:bg-slate-700"
                >
                  <LogIn size={16} /> Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const ref =
                      typeof window !== "undefined"
                        ? new URLSearchParams(window.location.search).get("ref")
                        : null;
                    openAuth("register", ref);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  <UserPlus size={16} /> Sign up
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </LobbyBackgroundShell>
  );
}
