"use client";

import { useEffect, useMemo, useState } from "react";
import { todayIso } from "@/lib/format";
import { monthRangeIso, weekRangeIso } from "@/lib/ggrAccounting";
import { useAgentCustomerIds } from "@/lib/hooks/useAgentCustomerIds";
import { useLedgerDeposits } from "@/lib/hooks/useLedgerDeposits";
import { subscribeDeposits } from "@/lib/payments/rtdbClient";
import type { RtdbDepositRecord } from "@/lib/payments/rtdbRecords";
import {
  allLinkDeposits,
  continueDepositsFromWave,
  emptyDepositSales,
  emptyFirstDepositSales,
  firstDepositsFromWave,
  getFirstSales,
  getSales,
  successfulDepositsByAgent,
  type DepositSalesTotals,
  type FirstDepositSales,
} from "@/lib/agentDepositSales";

/** Live first deposits (target/pay) and continue deposits (GGR only) on one link. */
export function useAgentDepositSales(agentId: string | undefined): {
  first: FirstDepositSales;
  continueSales: DepositSalesTotals;
  linkDeposits: number;
  ready: boolean;
} {
  const { customerIds } = useAgentCustomerIds(agentId);
  const { deposits } = useLedgerDeposits({ customerIds });
  const [wave, setWave] = useState<RtdbDepositRecord[]>([]);
  const today = useMemo(() => todayIso(), []);
  const week = useMemo(() => weekRangeIso(), []);
  const month = useMemo(() => monthRangeIso(), []);

  useEffect(() => {
    return subscribeDeposits(undefined, setWave, { maxRows: 0 });
  }, []);

  const computed = useMemo(() => {
    if (!agentId || !customerIds) {
      return {
        first: emptyFirstDepositSales(),
        continueSales: emptyDepositSales(),
        linkDeposits: 0,
      };
    }
    const playerAgents = new Map<string, string[]>();
    for (const id of customerIds) playerAgents.set(id, [agentId]);
    const ranges = { today, weekFrom: week.from, monthFrom: month.from };
    const merged = [...(deposits ?? []), ...wave];
    const firstMap = firstDepositsFromWave(merged, playerAgents, ranges);
    const continueMap = continueDepositsFromWave(merged, playerAgents, ranges);
    const first = getFirstSales(firstMap, agentId);
    const continueSales = getSales(continueMap, agentId);
    const ledgerLifetime = successfulDepositsByAgent(deposits ?? [], playerAgents).get(agentId) ?? 0;
    const waveLifetime = successfulDepositsByAgent(wave, playerAgents).get(agentId) ?? 0;
    return {
      first,
      continueSales,
      linkDeposits: allLinkDeposits({
        firstLifetime: first.lifetime,
        continueLifetime: continueSales.lifetime,
        ledgerLifetime,
        waveLifetime,
      }),
    };
  }, [agentId, customerIds, deposits, wave, today, week.from, month.from]);

  return {
    first: computed.first,
    continueSales: computed.continueSales,
    linkDeposits: computed.linkDeposits,
    ready: Boolean(agentId) && customerIds != null && deposits != null,
  };
}
