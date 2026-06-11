"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth, homeFor } from "@/lib/auth-context";
import type { Role } from "@/lib/types";
import { Spinner } from "./ui";

/**
 * Client route guard: waits for auth hydration, sends guests to /login and
 * bounces users who open another role's area back to their own home.
 * The backend (Cloud Functions + security rules) enforces the same rules
 * independently — this is UX only.
 */
export function RoleGuard({
  allow,
  children,
}: {
  allow: Role[];
  children: ReactNode;
}) {
  const { fbUser, profile, loading } = useAuth();
  const router = useRouter();

  const permitted = !!profile && allow.includes(profile.role) && profile.status === "active";

  useEffect(() => {
    if (loading) return;
    if (!fbUser) {
      router.replace("/login");
      return;
    }
    if (!profile) {
      // Authenticated but no profile yet (e.g. fresh Google sign-in): finish registration.
      router.replace("/register/complete");
      return;
    }
    if (profile.status !== "active") {
      router.replace("/suspended");
      return;
    }
    if (!allow.includes(profile.role)) {
      router.replace(homeFor(profile.role));
    }
  }, [loading, fbUser, profile, allow, router]);

  if (loading || !permitted) return <Spinner label="Loading…" />;
  return <>{children}</>;
}
