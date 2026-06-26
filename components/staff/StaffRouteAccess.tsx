"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ADMIN_ONLY_PREFIXES } from "@/lib/staff-nav";
import { Spinner } from "@/components/ui";

/** Blocks agents from admin-only URLs inside the shared staff backend. */
export function StaffRouteAccess({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, loading, profileReady } = useAuth();

  const adminOnly = ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
  const denied = adminOnly && !!profile && profile.role !== "admin";

  useEffect(() => {
    if (loading || !profileReady || !profile) return;
    if (denied) router.replace("/admin");
  }, [loading, profileReady, profile, denied, router]);

  if (loading || !profileReady || denied) return <Spinner label="Loading…" />;
  return <>{children}</>;
}
