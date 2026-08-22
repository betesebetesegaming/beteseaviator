"use client";

import { useMemo } from "react";
import { todayIso } from "@/lib/format";
import { monthRangeIso, weekRangeIso } from "@/lib/ggrAccounting";
import { useAgentCustomerIds } from "@/lib/hooks/useAgentCustomerIds";
import { useLedgerDeposits } from "@/lib/hooks/useLedgerDeposits";
import {
  continueDepositsFromWave,
  emptyDepositSales,
  emptyFirstDepositSales,
  firstDepositsFromWave,
  getFirstSales,
  getSales,
  type DepositSalesTotals,
  type FirstDepositSales,
} from "@/lib/agentDepositSales";

/** Live first deposits (target/pay) and continue deposits (GGR only) on one link. */
export function useAgentDepositSales(agentId: string | undefined): {
  first: FirstDepositSales;
  continueSales: DepositSalesTotals;
  ready: boolean;
} {
  const { customerIds } = useAgentCustomerIds(agentId);
  const { deposits } = useLedgerDeposits({ customerIds });
  const today = useMemo(() => todayIso(), []);
  const week = useMemo(() => weekRangeIso(), []);
  const month = useMemo(() => monthRangeIso(), []);

  const computed = useMemo(() => {
    if (!agentId || !customerIds) {
      return { first: emptyFirstDepositSales(), continueSales: emptyDepositSales() };
    }
    const playerAgents = new Map<string, string[]>();
    for (const id of customerIds) playerAgents.set(id, [agentId]);
    const ranges = { today, weekFrom: week.from, monthFrom: month.from };
    const firstMap = firstDepositsFromWave(deposits ?? [], playerAgents, ranges);
    const continueMap = continueDepositsFromWave(deposits ?? [], playerAgents, ranges);
    return {
      first: getFirstSales(firstMap, agentId),
      continueSales: getSales(continueMap, agentId),
    };
  }, [agentId, customerIds, deposits, today, week.from, month.from]);

  return {
    first: computed.first,
    continueSales: computed.continueSales,
    ready: Boolean(agentId) && customerIds != null && deposits != null,
  };
}
