"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { parseAgentSlugFromHost } from "@/lib/agentLinks";
import { useAuth } from "@/lib/auth-context";

function ReferralBannerInner() {
  const searchParams = useSearchParams();
  const { fbUser, profile } = useAuth();

  if (fbUser && profile?.role === "player") return null;

  let ref = searchParams.get("ref")?.toLowerCase().trim() || null;
  if (!ref && typeof window !== "undefined") {
    ref = parseAgentSlugFromHost(window.location.hostname);
  }
  if (!ref) return null;

  return (
    <div className="border-b border-sky-500/20 bg-sky-500/10 px-4 py-2 text-center text-xs text-sky-100">
      Register through agent{" "}
      <span className="font-bold uppercase text-sky-300">{ref}</span> — your account
      will be linked to them automatically.
    </div>
  );
}

export function AgentReferralBanner() {
  return (
    <Suspense fallback={null}>
      <ReferralBannerInner />
    </Suspense>
  );
}
