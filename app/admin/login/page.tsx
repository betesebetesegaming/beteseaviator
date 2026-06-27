"use client";

import { useEffect, useState } from "react";
import { StaffLoginForm } from "@/components/auth/StaffLoginForm";
import { StaffLoginShell } from "@/components/auth/StaffLoginShell";
import { Button, Spinner } from "@/components/ui";
import { homeFor, profileMatchesUser, useAuth } from "@/lib/auth-context";
import { isStaffRole } from "@/lib/staff-routes";

export default function StaffLoginPage() {
  const { fbUser, profile, profileReady, logout } = useAuth();
  const [openingDashboard, setOpeningDashboard] = useState(false);

  const settledProfile = profileMatchesUser(profile, fbUser) ? profile : null;
  const activeStaff =
    settledProfile &&
    settledProfile.status === "active" &&
    isStaffRole(settledProfile.role);

  useEffect(() => {
    if (!activeStaff || !profileReady) return;
    setOpeningDashboard(true);
    window.location.replace(homeFor(settledProfile.role));
  }, [activeStaff, profileReady, settledProfile]);

  if (openingDashboard) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950">
        <Spinner label="Opening staff dashboard…" />
      </div>
    );
  }

  const playerSession = settledProfile?.role === "player";

  return (
    <StaffLoginShell
      badge="Staff portal"
      badgeColor="text-emerald-400"
      title="Staff sign in"
      subtitle="Admin, super agents and sub agents use this page — not player phone sign-up."
    >
      {playerSession && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
          <p>You are signed in as a player on this browser.</p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3 w-full"
            onClick={() => void logout()}
          >
            Sign out of player account
          </Button>
        </div>
      )}
      {fbUser && profileReady && !settledProfile && (
        <p className="mb-4 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
          Sign in below with your staff username or email.
        </p>
      )}
      <StaffLoginForm />
    </StaffLoginShell>
  );
}
