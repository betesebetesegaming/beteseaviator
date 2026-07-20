"use client";

import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { isModemPayDepositRef } from "@/lib/payments/pendingDepositSession";
import { Button, Spinner } from "@/components/ui";

const LOADING_FAILSAFE_MS = 2_000;

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  const { fbUser, profile, loading } = useAuth();
  const { openAuth } = useAuthModal();
  const [forceShow, setForceShow] = useState(false);
  const [returningFromDeposit, setReturningFromDeposit] = useState(false);

  const isPlayer =
    !!profile && profile.role === "player" && profile.status === "active";

  useEffect(() => {
    try {
      setReturningFromDeposit(
        isModemPayDepositRef(new URLSearchParams(window.location.search).get("deposit")),
      );
    } catch {
      setReturningFromDeposit(false);
    }
  }, []);

  useEffect(() => {
    if (!loading) return;
    const t = window.setTimeout(() => setForceShow(true), LOADING_FAILSAFE_MS);
    return () => window.clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    if (loading && !forceShow && !returningFromDeposit) return;
    if (isPlayer) return;
    openAuth(fbUser && !profile ? "complete" : "login");
  }, [loading, forceShow, returningFromDeposit, isPlayer, fbUser, profile, openAuth]);

  // Returning from Wave/AfriMoney: don't trap the player on a spinner —
  // mount wallet so deposit status + reconcile can run immediately.
  if (loading && !forceShow && !returningFromDeposit && !isPlayer) {
    return <Spinner label="Loading wallet…" />;
  }

  if (!isPlayer && !returningFromDeposit) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <p className="text-slate-400">Sign in to deposit, withdraw and view your wallet.</p>
        <Button onClick={() => openAuth(fbUser && !profile ? "complete" : "login")}>
          <LogIn size={16} className="mr-2 inline" />
          Sign in to continue
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
