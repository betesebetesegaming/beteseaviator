import type { Commission, DailyStats } from "@/lib/types";
import { apiProviderCommissionDue, ggrFromTotals } from "@/lib/platformFinancials";

export type PeriodRange = {
  from: string;
  to: string;
  label: string;
};

export type PeriodTotals = {
  bets: number;
  wins: number;
  ggr: number;
  deposits: number;
  withdrawals: number;
};

export type PeriodAccounting = PeriodTotals & {
  providerDue: number;
  agentCommission: number;
  beteseKeeps: number;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday-start calendar week through today (UTC dates, same as dailyStats keys). */
export function weekRangeIso(now = new Date()): PeriodRange {
  const end = isoDate(now);
  const start = new Date(now);
  const day = start.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  start.setUTCDate(start.getUTCDate() - diff);
  const from = isoDate(start);
  return { from, to: end, label: `${from} → ${end}` };
}

/** First day of current UTC month through today. */
export function monthRangeIso(now = new Date()): PeriodRange {
  const end = isoDate(now);
  const from = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const monthName = now.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return { from, to: end, label: monthName };
}

/** First day of the month `monthsBack` months ago through today (UTC). */
export function monthsBackRangeIso(monthsBack: number, now = new Date()): PeriodRange {
  const end = isoDate(now);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1));
  const from = isoDate(start);
  return { from, to: end, label: `${from} → ${end}` };
}

export function monthKeyFromIsoDate(date: string): string {
  return date.slice(0, 7);
}

export function monthLabelFromKey(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  if (!y || !m) return yyyyMm;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export type MonthlyPeriodRow = PeriodTotals & {
  monthKey: string;
  label: string;
};

/** Roll dailyStats into calendar months (newest first). */
export function groupDailyStatsByMonth(days: DailyStats[]): MonthlyPeriodRow[] {
  const byMonth = new Map<string, PeriodTotals>();
  for (const d of days) {
    const key = monthKeyFromIsoDate(d.date);
    if (!key || key.length < 7) continue;
    const cur = byMonth.get(key) ?? { bets: 0, wins: 0, ggr: 0, deposits: 0, withdrawals: 0 };
    cur.bets += d.bets ?? 0;
    cur.wins += d.wins ?? 0;
    cur.deposits += d.deposits ?? 0;
    cur.withdrawals += d.withdrawals ?? 0;
    byMonth.set(key, cur);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monthKey, totals]) => ({
      monthKey,
      label: monthLabelFromKey(monthKey),
      ...totals,
      ggr: ggrFromTotals({ totalBets: totals.bets, totalWins: totals.wins }),
    }));
}

export function groupCommissionsByMonth(rows: Commission[]): Map<string, number> {
  const byMonth = new Map<string, number>();
  for (const c of rows) {
    const key = monthKeyFromIsoDate(c.periodDate);
    if (!key) continue;
    byMonth.set(key, (byMonth.get(key) ?? 0) + (c.commissionAmount ?? 0));
  }
  for (const [k, v] of byMonth) {
    byMonth.set(k, Math.round(v * 100) / 100);
  }
  return byMonth;
}

export function sumDailyStats(days: DailyStats[]): PeriodTotals {
  const totals = { bets: 0, wins: 0, ggr: 0, deposits: 0, withdrawals: 0 };
  for (const d of days) {
    totals.bets += d.bets ?? 0;
    totals.wins += d.wins ?? 0;
    totals.deposits += d.deposits ?? 0;
    totals.withdrawals += d.withdrawals ?? 0;
  }
  totals.ggr = ggrFromTotals({ totalBets: totals.bets, totalWins: totals.wins });
  return totals;
}

export function sumAgentCommissions(rows: Commission[]): number {
  return Math.round(rows.reduce((sum, c) => sum + (c.commissionAmount ?? 0), 0) * 100) / 100;
}

export function sumAgentGgr(rows: Commission[]): number {
  return Math.round(rows.reduce((sum, c) => sum + (c.ggrAmount ?? 0), 0) * 100) / 100;
}

/** GGR implied by a provider invoice at the configured rate. */
export function ggrFromProviderDue(amountDue: number, providerRate: number): number | null {
  if (!Number.isFinite(amountDue) || amountDue <= 0) return null;
  if (!Number.isFinite(providerRate) || providerRate <= 0) return null;
  return Math.round((amountDue / providerRate) * 100) / 100;
}

export function buildPeriodAccounting(
  totals: PeriodTotals,
  providerRate: number,
  agentCommission: number
): PeriodAccounting {
  const providerDue = apiProviderCommissionDue(totals.ggr, providerRate);
  const beteseKeeps = Math.round((totals.ggr - providerDue - agentCommission) * 100) / 100;
  return { ...totals, providerDue, agentCommission, beteseKeeps };
}

/** How close two GGR figures are (within 1 GMD or 0.5%). */
export function ggrMatchesPeriod(actualGgr: number, impliedGgr: number): boolean {
  if (impliedGgr <= 0 || actualGgr <= 0) return false;
  const diff = Math.abs(actualGgr - impliedGgr);
  return diff <= 1 || diff / impliedGgr <= 0.005;
}
