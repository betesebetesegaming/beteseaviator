import { isSuccessfulDeposit, paymentIsoDate } from "@/lib/modemPayAccounting";
import type { RtdbDepositRecord } from "@/lib/payments/rtdbRecords";

export type DepositSalesTotals = {
  day: number;
  week: number;
  month: number;
  lifetime: number;
};

/** First-time deposits plus how many customers made that first payment. */
export type FirstDepositSales = DepositSalesTotals & {
  dayCount: number;
  weekCount: number;
  monthCount: number;
  lifetimeCount: number;
};

export type SalesDateRanges = {
  today: string;
  weekFrom: string;
  monthFrom: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function emptyDepositSales(): DepositSalesTotals {
  return { day: 0, week: 0, month: 0, lifetime: 0 };
}

export function emptyFirstDepositSales(): FirstDepositSales {
  return {
    ...emptyDepositSales(),
    dayCount: 0,
    weekCount: 0,
    monthCount: 0,
    lifetimeCount: 0,
  };
}

export function addDepositToSales(
  sales: DepositSalesTotals,
  amount: number,
  isoDate: string,
  ranges: SalesDateRanges
): void {
  const amt = Math.abs(Number(amount) || 0);
  if (amt <= 0 || !isoDate) return;
  sales.lifetime = round2(sales.lifetime + amt);
  if (isoDate >= ranges.monthFrom) sales.month = round2(sales.month + amt);
  if (isoDate >= ranges.weekFrom) sales.week = round2(sales.week + amt);
  if (isoDate === ranges.today) sales.day = round2(sales.day + amt);
}

function bumpFirst(sales: FirstDepositSales, amount: number, isoDate: string, ranges: SalesDateRanges) {
  const amt = Math.abs(Number(amount) || 0);
  if (amt <= 0 || !isoDate) return;
  addDepositToSales(sales, amt, isoDate, ranges);
  sales.lifetimeCount += 1;
  if (isoDate >= ranges.monthFrom) sales.monthCount += 1;
  if (isoDate >= ranges.weekFrom) sales.weekCount += 1;
  if (isoDate === ranges.today) sales.dayCount += 1;
}

/**
 * Each customer's earliest successful Wave payment is the first deposit.
 * Later payments by the same person are continue/top-up deposits.
 */
export function splitFirstAndContinue(rows: RtdbDepositRecord[]): {
  first: RtdbDepositRecord[];
  continueRows: RtdbDepositRecord[];
} {
  const byCustomer = new Map<string, RtdbDepositRecord[]>();
  for (const row of rows) {
    if (!isSuccessfulDeposit(row) || !row.customer_id) continue;
    const list = byCustomer.get(row.customer_id) ?? [];
    list.push(row);
    byCustomer.set(row.customer_id, list);
  }
  const first: RtdbDepositRecord[] = [];
  const continueRows: RtdbDepositRecord[] = [];
  for (const list of byCustomer.values()) {
    list.sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")));
    const head = list[0];
    if (!head) continue;
    first.push(head);
    continueRows.push(...list.slice(1));
  }
  return { first, continueRows };
}

function agentBucket<T>(map: Map<string, T>, agentId: string, empty: () => T): T {
  const cur = map.get(agentId) ?? empty();
  map.set(agentId, cur);
  return cur;
}

function attributeRows(
  rows: RtdbDepositRecord[],
  playerAgents: Map<string, string[]>,
  ranges: SalesDateRanges,
  counted: boolean
): Map<string, FirstDepositSales> {
  const map = new Map<string, FirstDepositSales>();
  for (const row of rows) {
    const agents = playerAgents.get(row.customer_id);
    if (!agents || agents.length === 0) continue;
    const iso = paymentIsoDate(row.timestamp);
    const amt = Math.abs(Number(row.amount) || 0);
    for (const agentId of agents) {
      const cur = agentBucket(map, agentId, emptyFirstDepositSales);
      if (counted) bumpFirst(cur, amt, iso, ranges);
      else addDepositToSales(cur, amt, iso, ranges);
    }
  }
  return map;
}

/** First deposits via the marketer link — target / what we pay for bringing customers in. */
export function firstDepositsFromWave(
  rows: RtdbDepositRecord[],
  playerAgents: Map<string, string[]>,
  ranges: SalesDateRanges
): Map<string, FirstDepositSales> {
  return attributeRows(splitFirstAndContinue(rows).first, playerAgents, ranges, true);
}

/** Later top-ups via the same link — these feed GGR; pay is 5% of profit, not of this amount. */
export function continueDepositsFromWave(
  rows: RtdbDepositRecord[],
  playerAgents: Map<string, string[]>,
  ranges: SalesDateRanges
): Map<string, DepositSalesTotals> {
  return attributeRows(splitFirstAndContinue(rows).continueRows, playerAgents, ranges, false);
}

function sumRowsInRange(
  rows: RtdbDepositRecord[],
  playerAgents: Map<string, string[]>,
  from: string,
  to: string,
  counted: boolean
): Map<string, { amount: number; count: number }> {
  const map = new Map<string, { amount: number; count: number }>();
  for (const row of rows) {
    const iso = paymentIsoDate(row.timestamp);
    if (!iso || iso < from || iso > to) continue;
    const agents = playerAgents.get(row.customer_id);
    if (!agents) continue;
    const amt = Math.abs(Number(row.amount) || 0);
    for (const agentId of agents) {
      const cur = map.get(agentId) ?? { amount: 0, count: 0 };
      cur.amount = round2(cur.amount + amt);
      if (counted) cur.count += 1;
      map.set(agentId, cur);
    }
  }
  return map;
}

export function firstDepositsInRange(
  rows: RtdbDepositRecord[],
  playerAgents: Map<string, string[]>,
  from: string,
  to: string
): Map<string, { amount: number; count: number }> {
  return sumRowsInRange(splitFirstAndContinue(rows).first, playerAgents, from, to, true);
}

export function continueDepositsInRange(
  rows: RtdbDepositRecord[],
  playerAgents: Map<string, string[]>,
  from: string,
  to: string
): Map<string, number> {
  const map = new Map<string, number>();
  for (const [id, row] of sumRowsInRange(
    splitFirstAndContinue(rows).continueRows,
    playerAgents,
    from,
    to,
    false
  )) {
    map.set(id, row.amount);
  }
  return map;
}

export function getFirstSales(
  map: Map<string, FirstDepositSales>,
  agentId: string
): FirstDepositSales {
  return map.get(agentId) ?? emptyFirstDepositSales();
}

export function getSales(
  map: Map<string, DepositSalesTotals>,
  agentId: string
): DepositSalesTotals {
  return map.get(agentId) ?? emptyDepositSales();
}

/** Unique first-deposit total (each customer counted on their owning agent only). */
export function sumFirstMonth(map: Map<string, FirstDepositSales>): {
  amount: number;
  count: number;
} {
  let amount = 0;
  let count = 0;
  for (const row of map.values()) {
    amount += row.month;
    count += row.monthCount;
  }
  return { amount: round2(amount), count };
}

export const DEFAULT_FIRST_DEPOSIT_QUALIFY_GMD = 40_000;

/** Qualify for BETESE first-deposit pay only at/above this total. */
export function firstDepositQualify(
  amount: number,
  threshold = DEFAULT_FIRST_DEPOSIT_QUALIFY_GMD
): {
  qualified: boolean;
  remaining: number;
  progress: number;
  threshold: number;
  have: number;
} {
  const need = Math.max(0, Number(threshold) || 0);
  const have = Math.max(0, Number(amount) || 0);
  const remaining = round2(Math.max(0, need - have));
  const qualified = need <= 0 || have + 1e-9 >= need;
  const progress = need <= 0 ? 1 : Math.min(1, have / need);
  return { qualified, remaining, progress, threshold: need, have: round2(have) };
}
