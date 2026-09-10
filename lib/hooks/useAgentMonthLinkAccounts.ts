"use client";

import { useMemo } from "react";
import { openedViaLinkInRange } from "@/lib/agentMonthAccounts";
import { monthRangeIso } from "@/lib/ggrAccounting";
import { useAgentLinkedPlayers } from "@/lib/hooks/useAgentLinkedPlayers";

/** Everyone who opened an account via this marketer's link in the current month. */
export function useAgentMonthLinkAccounts(agentId: string | undefined) {
  const players = useAgentLinkedPlayers(agentId);
  const month = useMemo(() => monthRangeIso(), []);
  const opened = useMemo(
    () => openedViaLinkInRange(players, agentId, month.from, month.to),
    [players, agentId, month.from, month.to]
  );
  return {
    ready: players != null,
    opened,
    count: opened.length,
    month,
  };
}
