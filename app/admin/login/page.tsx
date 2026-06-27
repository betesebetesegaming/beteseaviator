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

  const profileSettled =
    !!fbUser && profileReady && !!profile && profile.uid === fbUser.uid;

  useEffect(() => {
    if (loading) return;
    if (!fbUser) return;
    if (!profileSettled) return;

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
  }, [loading, profileSettled, fbUser, profile, router]);

  // Spin only while the session/profile is still loading, or while a confirmed
  // redirect is in flight. A signed-in session whose profile finished loading
  // but isn't a usable staff profile (missing/empty doc, stale session) must
  // fall through to the login form instead of trapping on the spinner forever.
  const waitingForStaffRedirect =
    loading ||
    (!!fbUser && !profileReady) ||
    (profileSettled &&
      (profile.status !== "active" ||
        profile.role === "player" ||
        isStaffRole(profile.role)));

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
