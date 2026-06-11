"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth, homeFor } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import type { Role } from "@/lib/types";
import { Spinner } from "./ui";

/**
 * Client route guard: waits for auth hydration, sends guests to /play with
 * a sign-in popup and bounces users who open another role's area back home.
 * The backend (Cloud Functions + security rules) enforces the same rules
 * independently — this is UX only.
 */
export function RoleGuard({
  allow,
  children,
  guestMode = "login",
}: {
  allow: Role[];
  children: ReactNode;
  /** Which auth popup to open when a guest hits a protected route */
  guestMode?: "login" | "agent";
}) {
  const { fbUser, profile, loading } = useAuth();
  const { openAuth } = useAuthModal();
  const router = useRouter();

  const permitted = !!profile && allow.includes(profile.role) && profile.status === "active";

  useEffect(() => {
    if (loading) return;
    if (!fbUser) {
      router.replace("/play");
      openAuth(guestMode === "agent" ? "agent" : "login");
      return;
    }
    if (!profile) {
      router.replace("/play");
      openAuth("complete");
      return;
    }
    if (profile.status !== "active") {
      router.replace("/suspended");
      return;
    }
    if (!allow.includes(profile.role)) {
      router.replace(homeFor(profile.role));
    }
  }, [loading, fbUser, profile, allow, router, guestMode, openAuth]);

  if (loading || !permitted) return <Spinner label="Loading…" />;
  return <>{children}</>;
}
