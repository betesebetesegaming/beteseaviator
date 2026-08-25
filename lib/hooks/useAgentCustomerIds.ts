"use client";

import { useMemo } from "react";
import { useAgentLinkedPlayers } from "@/lib/hooks/useAgentLinkedPlayers";

/** Player UIDs attached to an agent (ancestors or parentId). */
export function useAgentCustomerIds(agentId: string | undefined) {
  const players = useAgentLinkedPlayers(agentId);

  const customerIds = useMemo(() => {
    if (!players) return null;
    return new Set(players.map((p) => p.uid));
  }, [players]);

  const customerNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const p of players ?? []) names.set(p.uid, String(p.name || "Customer"));
    return names;
  }, [players]);

  return { customerIds, customerNames };
}
