"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LogIn, UserPlus, Wallet, LogOut, UserCircle } from "lucide-react";
import { useAuth, homeFor } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { formatXof } from "@/lib/format";
import { Logo } from "@/components/logo";
import { PresenceTracker } from "@/components/PresenceTracker";
import { LobbyBackgroundShell } from "@/components/games/LobbyBackgroundShell";
import { AgentReferralBanner } from "@/components/games/AgentReferralBanner";
import { PlayGameChrome } from "@/components/games/PlayGameChrome";
import { CustomerCareBar } from "@/components/CustomerCareBar";
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
  const { fbUser, profile, loading } = useAuth();
  const handledRef = useRef(false);

  useEffect(() => {
    if (loading || handledRef.current) return;

    const isPlayer =
      !!profile && profile.role === "player" && profile.status === "active";

    if (isPlayer) return;

    if (fbUser && !profile) {
      handledRef.current = true;
      openAuth("complete");
      return;
    }

    const signup = searchParams.get("signup");
    const pref = searchParams.get("pref")?.toUpperCase().trim() || null;
    let ref = searchParams.get("ref")?.toLowerCase().trim() || null;

    if (!ref && typeof window !== "undefined") {
      ref = parseAgentSlugFromHost(window.location.hostname);
    }

    if (signup === "1") {
      handledRef.current = true;
      openAuth("register", ref, pref);
      const params = new URLSearchParams();
      if (ref) params.set("ref", ref);
      if (pref) params.set("pref", pref);
      const qs = params.toString();
      router.replace(qs ? `/play?${qs}` : "/play", { scroll: false });
    }
  }, [searchParams, openAuth, router, loading, fbUser, profile]);

  return null;
}

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { openAuth } = useAuthModal();
  const { fbUser, profile, wallet, loading, logout } = useAuth();

  const inGame = pathname?.startsWith("/play/game/");
  const isPlayer =
    !!profile && profile.role === "player" && profile.status === "active";
  const walletFrozen = Boolean(wallet?.frozen);
  const needsProfile = !!fbUser && !profile;
  const showGuestChrome = !loading && !fbUser;

  useEffect(() => {
    if (loading || !profile) return;
    if (profile.role !== "player") {
      router.replace(homeFor(profile.role));
    }
  }, [loading, profile, router]);

  if (inGame) {
    return (
      <LobbyBackgroundShell showPicker={false}>
        <Suspense fallback={null}>
          <PlayAuthFromQuery />
        </Suspense>
        <PresenceTracker />
        {isPlayer && !walletFrozen ? <PendingDepositReconciler /> : null}
        <div className="flex min-h-dvh flex-col bg-[#0b0b0b]">
          <PlayGameChrome />
          <main className="flex min-h-0 flex-1 flex-col">{children}</main>
        </div>
      </LobbyBackgroundShell>
    );
  }

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
            {loading && !fbUser && !profile ? (
              <span className="text-xs text-slate-500">Checking session…</span>
            ) : isPlayer ? (
              <>
                <span className="hidden text-sm text-slate-400 md:inline">
                  Hi, {profile.name.split(" ")[0]}
                </span>
                <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-300 sm:px-3 sm:py-1.5 sm:text-sm">
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
            ) : needsProfile ? (
              <>
                <span className="hidden rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-200 sm:inline">
                  {loading ? "Loading profile…" : "Finish setup"}
                </span>
                <button
                  type="button"
                  onClick={() => openAuth("complete")}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  <UserCircle size={16} /> Complete account
                </button>
                <button
                  onClick={logout}
                  className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
                  title="Logout"
                >
                  <LogOut size={16} />
                </button>
              </>
            ) : showGuestChrome ? (
              <>
                <span className="hidden rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-200 sm:inline">
                  Demo mode
                </span>
                <button
                  type="button"
                  onClick={() => openAuth("login")}
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
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-white/10 px-4 py-4">
        <div className="mx-auto max-w-7xl">
          <CustomerCareBar compact />
          <p className="mt-2 text-center text-[11px] text-slate-600">
            18+ only. Please gamble responsibly.
          </p>
        </div>
      </footer>
    </LobbyBackgroundShell>
  );
}
