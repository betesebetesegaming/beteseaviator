"use client";

import { KeyRound } from "lucide-react";
import { AgentMarketingLinks } from "@/components/agent/AgentMarketingLinks";
import { staffSignInHint, staffSignInId } from "@/lib/staffAccount";
import type { UserProfile } from "@/lib/types";
import { Card } from "@/components/ui";

export function StaffAccountCard({ profile }: { profile: UserProfile }) {
  const signInId = staffSignInId(profile);
  const isAgent = profile.role === "super_agent" || profile.role === "sub_agent";

  return (
    <div className="space-y-4">
      <Card className="border-sky-500/25 bg-sky-500/5">
        <div className="mb-2 flex items-center gap-2">
          <KeyRound size={16} className="text-sky-300" />
          <p className="text-sm font-semibold text-white">Your sign-in</p>
        </div>
        <p className="text-xs text-slate-400">{staffSignInHint(profile)}</p>
        {signInId ? (
          <code className="mt-3 block rounded-lg bg-slate-950/70 px-3 py-2 text-sm text-sky-200">
            {signInId}
          </code>
        ) : null}
      </Card>

      {isAgent && profile.agentSlug ? (
        <AgentMarketingLinks slug={profile.agentSlug} agentName={profile.name} />
      ) : isAgent ? (
        <Card className="border-amber-500/30 bg-amber-500/10 text-sm text-amber-100">
          Your agent username is not set yet. Contact BETESE admin — your marketing link is
          created from your username.
        </Card>
      ) : null}
    </div>
  );
}
