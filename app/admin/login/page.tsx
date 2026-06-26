"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { StaffLoginForm } from "@/components/auth/StaffLoginForm";
import { StaffLoginShell } from "@/components/auth/StaffLoginShell";
import { Spinner } from "@/components/ui";
import { auth } from "@/lib/firebase";
import { homeFor, useAuth } from "@/lib/auth-context";
import { isStaffRole } from "@/lib/staff-routes";

export default function StaffLoginPage() {
  const router = useRouter();
  const { fbUser, profile, loading } = useAuth();
  const signingOutPlayer = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!fbUser) {
      signingOutPlayer.current = false;
      return;
    }
    if (!profile) {
      router.replace("/play");
      return;
    }

    if (profile.status !== "active") {
      router.replace("/suspended");
      return;
    }

    if (profile.role === "player") {
      if (!signingOutPlayer.current) {
        signingOutPlayer.current = true;
        void signOut(auth);
      }
      return;
    }

    if (isStaffRole(profile.role)) {
      router.replace(homeFor(profile.role));
    }
  }, [loading, fbUser, profile, router]);

  const waitingForStaffRedirect =
    loading || (fbUser && profile && isStaffRole(profile.role));

  if (waitingForStaffRedirect) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950">
        <Spinner label="Checking session…" />
      </div>
    );
  }

  return (
    <StaffLoginShell
      badge="Staff portal"
      badgeColor="text-emerald-400"
      title="Staff sign in"
    >
      <StaffLoginForm />
    </StaffLoginShell>
  );
}
