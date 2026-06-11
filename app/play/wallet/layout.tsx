"use client";

import { useEffect } from "react";
import { LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { Button, Spinner } from "@/components/ui";

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  const { fbUser, profile, loading } = useAuth();
  const { openAuth } = useAuthModal();

  const isPlayer =
    !!profile && profile.role === "player" && profile.status === "active";

  useEffect(() => {
    if (loading || isPlayer) return;
    openAuth(fbUser && !profile ? "complete" : "login");
  }, [loading, isPlayer, fbUser, profile, openAuth]);

  if (loading) return <Spinner label="Loading wallet…" />;

  if (!isPlayer) {
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
