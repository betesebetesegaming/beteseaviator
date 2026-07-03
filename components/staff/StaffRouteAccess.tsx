"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ADMIN_ONLY_PREFIXES } from "@/lib/staff-nav";
import { hardRedirect } from "@/lib/hardRedirect";
import { Spinner } from "@/components/ui";

/** Blocks agents from admin-only URLs inside the shared staff backend. */
export function StaffRouteAccess({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { profile, loading, profileReady } = useAuth();
  const redirectedRef = useRef(false);

  const adminOnly = ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p));
  const denied = adminOnly && !!profile && profile.role !== "admin";

  useEffect(() => {
    if (loading || !profileReady || !profile || !denied) return;
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    hardRedirect("/admin");
  }, [loading, profileReady, profile, denied]);

  if (loading || !profileReady || denied) return <Spinner label="Loading…" />;
  return <>{children}</>;
}
