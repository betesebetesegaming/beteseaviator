"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { resolveStaffSession } from "@/lib/api";
import { profileMatchesUser, useAuth, homeFor } from "@/lib/auth-context";
import type { Role } from "@/lib/types";
import { Spinner } from "./ui";

/**
 * Client route guard: waits for auth hydration, sends guests to a staff login
 * page and bounces users who open another role's area back home.
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
  const router = useRouter();
  const bootstrappingRef = useRef(false);

  const profileMatchesUserFlag = profileMatchesUser(profile, fbUser);
  const permitted =
    profileMatchesUserFlag &&
    !!profile &&
    allow.includes(profile.role) &&
    profile.status === "active";

  useEffect(() => {
    if (loading || !profileReady || !fbUser) return;
    if (permitted) return;

    if (profile && profileMatchesUserFlag) {
      if (profile.status !== "active") {
        router.replace("/suspended");
        return;
      }
      if (!allow.includes(profile.role)) {
        router.replace(homeFor(profile.role));
      }
      return;
    }

    if (bootstrappingRef.current) return;
    bootstrappingRef.current = true;

    const bootstrap = resolveStaffSession({});
    const timeout = new Promise<never>((_, reject) => {
      window.setTimeout(
        () => reject(new Error("Staff profile sync timed out")),
        15000
      );
    });

    void Promise.race([bootstrap, timeout])
      .then(async () => {
        await auth.currentUser?.getIdToken(true);
        window.location.reload();
      })
      .catch(() => {
        bootstrappingRef.current = false;
        router.replace(loginPath);
      });
  }, [
    loading,
    profileReady,
    fbUser,
    profile,
    profileMatchesUserFlag,
    permitted,
    allow,
    router,
    loginPath,
  ]);

  useEffect(() => {
    if (loading) return;
    if (!fbUser) {
      router.replace(loginPath);
    }
  }, [loading, fbUser, router, loginPath]);

  if (loading || !profileReady) return <Spinner label="Loading…" />;
  if (!fbUser) return <Spinner label="Redirecting…" />;
  if (!permitted) return <Spinner label="Opening staff dashboard…" />;
  return <>{children}</>;
}
