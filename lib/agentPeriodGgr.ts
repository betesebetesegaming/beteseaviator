import { currentGgrPeriodKeys } from "@/lib/ggrAccounting";
import type { AgentStats } from "@/lib/types";

export type GgrPeriodKind = "day" | "week" | "month";

export type GgrPeriodAnchors = {
  ggrDayKey?: string | null;
  ggrDayBaseline?: number | null;
  ggrDayDepositBaseline?: number | null;
  ggrWeekKey?: string | null;
  ggrWeekBaseline?: number | null;
  ggrWeekDepositBaseline?: number | null;
  ggrMonthKey?: string | null;
  ggrMonthBaseline?: number | null;
  ggrMonthDepositBaseline?: number | null;
  commissionedGgr?: number | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function finiteNumber(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Live GGR for a calendar period.
 *
 * If this period's baseline was frozen (nightly job), GGR is current house
 * profit minus that baseline — it rises when customers lose and can fall if
 * they win money back, until the period ends.
 *
 * If anchors are missing or the calendar rolled over, fall back to commission
 * rows already credited in the period plus unpaid profit since the last payout.
 * A new month therefore starts near 0 instead of carrying last month's GGR.
 */
export function livePeriodGgr(args: {
  currentGgr: number;
  periodKey: string;
  storedKey?: string | null;
  storedBaseline?: number | null;
  commissionedGgr?: number | null;
  creditedInPeriod?: number;
}): number {
  const current = Math.max(0, Number(args.currentGgr) || 0);
  const baseline = finiteNumber(args.storedBaseline);
  if (args.storedKey === args.periodKey && baseline != null) {
    return round2(Math.max(0, current - baseline));
  }
  const peak = finiteNumber(args.commissionedGgr);
  const unpaid = peak == null ? 0 : Math.max(0, current - peak);
  return round2(Math.max(0, (Number(args.creditedInPeriod) || 0) + unpaid));
}

/** Deposits credited to the agent in this period (sales). Resets with the period. */
export function livePeriodSales(args: {
  currentDeposits: number;
  periodKey: string;
  storedKey?: string | null;
  storedBaseline?: number | null;
}): number {
  const current = Math.max(0, Number(args.currentDeposits) || 0);
  const baseline = finiteNumber(args.storedBaseline);
  if (args.storedKey === args.periodKey && baseline != null) {
    return round2(Math.max(0, current - baseline));
  }
  return 0;
}

export function periodKeysForKind(kind: GgrPeriodKind, now = new Date()): string {
  const keys = currentGgrPeriodKeys(now);
  return keys[kind];
}

export function agentPeriodGgr(
  kind: GgrPeriodKind,
  currentGgr: number,
  anchors: GgrPeriodAnchors | AgentStats | null | undefined,
  creditedInPeriod = 0,
  now = new Date()
): number {
  const keys = currentGgrPeriodKeys(now);
  if (kind === "day") {
    return livePeriodGgr({
      currentGgr,
      periodKey: keys.day,
      storedKey: anchors?.ggrDayKey,
      storedBaseline: anchors?.ggrDayBaseline,
      commissionedGgr: anchors?.commissionedGgr,
      creditedInPeriod,
    });
  }
  if (kind === "week") {
    return livePeriodGgr({
      currentGgr,
      periodKey: keys.week,
      storedKey: anchors?.ggrWeekKey,
      storedBaseline: anchors?.ggrWeekBaseline,
      commissionedGgr: anchors?.commissionedGgr,
      creditedInPeriod,
    });
  }
  return livePeriodGgr({
    currentGgr,
    periodKey: keys.month,
    storedKey: anchors?.ggrMonthKey,
    storedBaseline: anchors?.ggrMonthBaseline,
    commissionedGgr: anchors?.commissionedGgr,
    creditedInPeriod,
  });
}

export function agentPeriodSales(
  kind: GgrPeriodKind,
  currentDeposits: number,
  anchors: GgrPeriodAnchors | AgentStats | null | undefined,
  now = new Date()
): number {
  const keys = currentGgrPeriodKeys(now);
  if (kind === "day") {
    return livePeriodSales({
      currentDeposits,
      periodKey: keys.day,
      storedKey: anchors?.ggrDayKey,
      storedBaseline: anchors?.ggrDayDepositBaseline,
    });
  }
  if (kind === "week") {
    return livePeriodSales({
      currentDeposits,
      periodKey: keys.week,
      storedKey: anchors?.ggrWeekKey,
      storedBaseline: anchors?.ggrWeekDepositBaseline,
    });
  }
  return livePeriodSales({
    currentDeposits,
    periodKey: keys.month,
    storedKey: anchors?.ggrMonthKey,
    storedBaseline: anchors?.ggrMonthDepositBaseline,
  });
}
