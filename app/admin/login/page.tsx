"use client";

import { useEffect, useRef, useState } from "react";
import { StaffLoginForm } from "@/components/auth/StaffLoginForm";
import { StaffLoginShell } from "@/components/auth/StaffLoginShell";
import { Button, Spinner } from "@/components/ui";
import { resolveStaffSession } from "@/lib/api";
import { auth } from "@/lib/firebase";
import { homeFor, profileMatchesUser, useAuth } from "@/lib/auth-context";
import { hardRedirect, withTimeout } from "@/lib/hardRedirect";
import { isStaffRole } from "@/lib/staff-routes";

const STAFF_SESSION_MS = 8000;

export default function StaffLoginPage() {
  const { fbUser, profile, profileReady, logout } = useAuth();
  const [openingDashboard, setOpeningDashboard] = useState(false);
  const syncAttemptedRef = useRef(false);

  const settledProfile = profileMatchesUser(profile, fbUser) ? profile : null;
  const playerSession = settledProfile?.role === "player";
  const activeStaff =
    settledProfile &&
    settledProfile.status === "active" &&
    isStaffRole(settledProfile.role);

  useEffect(() => {
    if (!activeStaff || !profileReady) return;
    setOpeningDashboard(true);
    hardRedirect(homeFor(settledProfile.role));
  }, [activeStaff, profileReady, settledProfile]);

  useEffect(() => {
    if (!fbUser || !profileReady || settledProfile || playerSession) return;
    if (syncAttemptedRef.current) return;
    syncAttemptedRef.current = true;
    setOpeningDashboard(true);

    void withTimeout(resolveStaffSession({}), STAFF_SESSION_MS, "Staff profile sync timed out")
      .then(async (session) => {
        await auth.currentUser?.getIdToken(true);
        hardRedirect(homeFor(session.role));
      })
      .catch(() => {
        syncAttemptedRef.current = false;
        setOpeningDashboard(false);
      });
  }, [fbUser, profileReady, settledProfile, playerSession]);

  if (openingDashboard) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950">
        <Spinner label="Opening staff dashboard…" />
      </div>
    );
  }

  return (
    <StaffLoginShell
      badge="Staff portal"
      badgeColor="text-emerald-400"
      title="Staff sign in"
      subtitle="Admin and agent marketers — sign in with the username and password BETESE admin gave you. Agent accounts are not self-service."
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
      {fbUser && profileReady && !settledProfile && !playerSession && (
        <p className="mb-4 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
          Sign in below with your staff username or email.
        </p>
      )}
      <StaffLoginForm />
    </StaffLoginShell>
  );
}
