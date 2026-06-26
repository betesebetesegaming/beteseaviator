"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth, homeFor } from "@/lib/auth-context";
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

  const profileMatchesUser = !!fbUser && profile?.uid === fbUser.uid;
  const permitted =
    profileMatchesUser &&
    !!profile &&
    allow.includes(profile.role) &&
    profile.status === "active";

  useEffect(() => {
    if (loading) return;
    if (!fbUser) {
      router.replace(loginPath);
      return;
    }
    if (profileReady && !profile) {
      router.replace(loginPath);
      return;
    }
    if (!profile || !profileMatchesUser) return;
    if (profile.status !== "active") {
      router.replace("/suspended");
      return;
    }
    if (!allow.includes(profile.role)) {
      router.replace(homeFor(profile.role));
    }
  }, [loading, profileReady, fbUser, profile, profileMatchesUser, allow, router, loginPath]);

  if (loading || !profileReady) return <Spinner label="Loading…" />;
  if (!permitted) return <Spinner label="Loading…" />;
  return <>{children}</>;
}
