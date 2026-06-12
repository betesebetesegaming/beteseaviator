"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { StaffLoginForm } from "@/components/auth/StaffLoginForm";
import { StaffLoginShell } from "@/components/auth/StaffLoginShell";
import { Spinner } from "@/components/ui";
import { homeFor, useAuth } from "@/lib/auth-context";

export default function StaffLoginPage() {
  const router = useRouter();
  const { fbUser, profile, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!fbUser) return;
    if (!profile) return;
    if (profile.status !== "active") {
      router.replace("/suspended");
      return;
    }
    router.replace(homeFor(profile.role));
  }, [loading, fbUser, profile, router]);

  if (loading || fbUser) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950">
        <Spinner label="Checking session…" />
      </div>
    );
  }

  return (
    <StaffLoginShell
      badge="Staff portal"
      badgeColor="text-emerald-400"
      title="Admin & agent sign in"
      subtitle="One login for platform admins and agents. You are sent to the right dashboard after sign in."
    >
      <StaffLoginForm />
    </StaffLoginShell>
  );
}
