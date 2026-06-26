"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { StaffLoginForm } from "@/components/auth/StaffLoginForm";
import { StaffLoginShell } from "@/components/auth/StaffLoginShell";
import { Spinner } from "@/components/ui";
import { homeFor, useAuth } from "@/lib/auth-context";
import { isStaffRole } from "@/lib/staff-routes";

export default function StaffLoginPage() {
  const router = useRouter();
  const { fbUser, profile, loading, profileReady } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!fbUser) return;
    if (!profileReady || !profile || profile.uid !== fbUser.uid) return;

    if (profile.status !== "active") {
      router.replace("/suspended");
      return;
    }

    if (profile.role === "player") {
      router.replace("/play");
      return;
    }

    if (isStaffRole(profile.role)) {
      router.replace(homeFor(profile.role));
    }
  }, [loading, profileReady, fbUser, profile, router]);

  const waitingForStaffRedirect =
    loading ||
    (fbUser && !profileReady) ||
    (fbUser && profile && isStaffRole(profile.role));

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
