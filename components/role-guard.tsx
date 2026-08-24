"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { auth } from "@/lib/firebase";
import { resolveStaffSession } from "@/lib/api";
import { profileMatchesUser, useAuth, homeFor } from "@/lib/auth-context";
import { clearHardRedirectGuard, hardRedirect, withTimeout } from "@/lib/hardRedirect";
import type { Role } from "@/lib/types";
import { StaffOpenStuck } from "@/components/auth/StaffOpenStuck";
import { Spinner } from "./ui";

const STAFF_BOOTSTRAP_MS = 12000;
const STUCK_MS = 12000;

/**
 * Client route guard: waits for auth hydration, sends guests to staff login,
 * and bounces users who open another role's area back home.
 */
export function RoleGuard({
  allow,
  children,
  loginPath,
}: {
  allow: Role[];
  children: ReactNode;
  loginPath: string;
}) {
  const { fbUser, profile, loading, profileReady, logout } = useAuth();
  const bootstrappingRef = useRef(false);
  const redirectedRef = useRef(false);
  const [stuck, setStuck] = useState(false);

  const profileMatchesUserFlag = profileMatchesUser(profile, fbUser);
  const permitted =
    profileMatchesUserFlag &&
    !!profile &&
    allow.includes(profile.role) &&
    profile.status === "active";

  useEffect(() => {
    if (permitted) {
      clearHardRedirectGuard();
      setStuck(false);
    }
  }, [permitted]);

  useEffect(() => {
    if (loading || !profileReady || permitted || !fbUser) {
      setStuck(false);
      return;
    }
    const timer = window.setTimeout(() => setStuck(true), STUCK_MS);
    return () => window.clearTimeout(timer);
  }, [loading, profileReady, permitted, fbUser]);

  useEffect(() => {
    if (loading || !profileReady) return;

    const go = (path: string) => {
      if (redirectedRef.current) return;
      redirectedRef.current = true;
      hardRedirect(path);
    };

    if (!fbUser) {
      go(loginPath);
      return;
    }

    if (permitted) return;

    if (profile && profileMatchesUserFlag) {
      if (profile.status !== "active") {
        go("/suspended");
        return;
      }
      if (!allow.includes(profile.role)) {
        go(homeFor(profile.role));
      }
      return;
    }

    if (bootstrappingRef.current) return;
    bootstrappingRef.current = true;

    void withTimeout(resolveStaffSession({}), STAFF_BOOTSTRAP_MS, "Staff profile sync timed out")
      .then(async (session) => {
        await auth.currentUser?.getIdToken(true);
        bootstrappingRef.current = false;
        if (session.status !== "active") {
          go("/suspended");
          return;
        }
        hardRedirect(homeFor(session.role));
      })
      .catch(() => {
        bootstrappingRef.current = false;
        go(loginPath);
      });
  }, [
    loading,
    profileReady,
    fbUser,
    profile,
    profileMatchesUserFlag,
    permitted,
    allow,
    loginPath,
  ]);

  if (stuck && fbUser && !permitted) {
    return (
      <StaffOpenStuck
        onRetry={() => {
          setStuck(false);
          redirectedRef.current = false;
          bootstrappingRef.current = false;
          window.location.reload();
        }}
        onSignOut={() => void logout()}
      />
    );
  }

  if (loading || !profileReady) return <Spinner label="Loading…" />;
  if (!fbUser) return <Spinner label="Redirecting…" />;
  if (!permitted) return <Spinner label="Opening staff dashboard…" />;
  return <>{children}</>;
}
