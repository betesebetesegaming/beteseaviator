"use client";

import { useEffect, useMemo, useState } from "react";
import { todayIso } from "@/lib/format";
import { monthRangeIso, weekRangeIso } from "@/lib/ggrAccounting";
import { subscribeDeposits } from "@/lib/payments/rtdbClient";
import type { RtdbDepositRecord } from "@/lib/payments/rtdbRecords";
import { useAgentCustomerIds } from "@/lib/hooks/useAgentCustomerIds";
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
  const [wave, setWave] = useState<RtdbDepositRecord[] | null>(null);
  const today = useMemo(() => todayIso(), []);
  const week = useMemo(() => weekRangeIso(), []);
  const month = useMemo(() => monthRangeIso(), []);

  useEffect(() => {
    return subscribeDeposits(undefined, setWave, { maxRows: 0 });
  }, []);

  const computed = useMemo(() => {
    if (!agentId || !customerIds) {
      return { first: emptyFirstDepositSales(), continueSales: emptyDepositSales() };
    }
    const playerAgents = new Map<string, string[]>();
    for (const id of customerIds) playerAgents.set(id, [agentId]);
    const ranges = { today, weekFrom: week.from, monthFrom: month.from };
    const firstMap = firstDepositsFromWave(wave ?? [], playerAgents, ranges);
    const continueMap = continueDepositsFromWave(wave ?? [], playerAgents, ranges);
    return {
      first: getFirstSales(firstMap, agentId),
      continueSales: getSales(continueMap, agentId),
    };
  }, [agentId, customerIds, wave, today, week.from, month.from]);

  return {
    first: computed.first,
    continueSales: computed.continueSales,
    ready: Boolean(agentId) && customerIds != null && wave != null,
  };
}
