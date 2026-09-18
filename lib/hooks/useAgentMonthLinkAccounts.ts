"use client";

import { useMemo } from "react";
import { monthlyOpenedViaLinkByAgent, openedViaLinkInRange } from "@/lib/agentMonthAccounts";
import { monthRangeIso, recentMonthKeys } from "@/lib/ggrAccounting";
import { useAgentLinkedPlayers } from "@/lib/hooks/useAgentLinkedPlayers";

/** Everyone who opened an account via this marketer's link in the current month. */
export function useAgentMonthLinkAccounts(agentId: string | undefined) {
  const players = useAgentLinkedPlayers(agentId);
  const month = useMemo(() => monthRangeIso(), []);
  const monthKeys = useMemo(() => recentMonthKeys(12), []);
  const opened = useMemo(
    () => openedViaLinkInRange(players, agentId, month.from, month.to),
    [players, agentId, month.from, month.to]
  );
  const byMonth = useMemo(() => {
    if (!agentId) return new Map<string, number>();
    return monthlyOpenedViaLinkByAgent(players, monthKeys).get(agentId) ?? new Map();
  }, [players, agentId, monthKeys]);
  return {
    ready: players != null,
    opened,
    count: opened.length,
    month,
    monthKeys,
    byMonth,
    lifetimeCount: players?.length ?? 0,
  };
}
