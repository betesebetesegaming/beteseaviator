"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { auth } from "@/lib/firebase";
import { resolveStaffSession } from "@/lib/api";
import { profileMatchesUser, useAuth, homeFor } from "@/lib/auth-context";
import { hardRedirect, withTimeout } from "@/lib/hardRedirect";
import type { Role } from "@/lib/types";
import { Spinner } from "./ui";

const STAFF_BOOTSTRAP_MS = 8000;

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
  const { fbUser, profile, loading, profileReady } = useAuth();
  const bootstrappingRef = useRef(false);
  const redirectedRef = useRef(false);

  const profileMatchesUserFlag = profileMatchesUser(profile, fbUser);
  const permitted =
    profileMatchesUserFlag &&
    !!profile &&
    allow.includes(profile.role) &&
    profile.status === "active";

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
      .then(async () => {
        await auth.currentUser?.getIdToken(true);
        bootstrappingRef.current = false;
        hardRedirect(window.location.pathname + window.location.search);
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

  if (loading || !profileReady) return <Spinner label="Loading…" />;
  if (!fbUser) return <Spinner label="Redirecting…" />;
  if (!permitted) return <Spinner label="Opening staff dashboard…" />;
  return <>{children}</>;
}
