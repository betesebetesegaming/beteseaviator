import type { RtdbDepositRecord, RtdbWithdrawalRecord } from "@/lib/payments/rtdbRecords";

export function paymentIsoDate(isoTimestamp: string | undefined): string {
  return String(isoTimestamp || "").slice(0, 10);
}

export function inIsoDateRange(isoTimestamp: string | undefined, from: string, to: string): boolean {
  const d = paymentIsoDate(isoTimestamp);
  if (!d) return false;
  return d >= from && d <= to;
}

export function isSuccessfulDeposit(row: RtdbDepositRecord): boolean {
  const status = String(row.status || "").toLowerCase();
  const verification = String(row.verification_status || "").toLowerCase();
  return status === "completed" || verification === "verified";
}

export function isSuccessfulWithdrawal(row: RtdbWithdrawalRecord): boolean {
  return String(row.status || "").toLowerCase() === "completed";
}

export function isPendingWithdrawal(row: RtdbWithdrawalRecord): boolean {
  const s = String(row.status || "").toLowerCase();
  return s === "pending" || s === "processing";
}

type FilterOpts = {
  from?: string;
  to?: string;
  customerIds?: Set<string> | null;
};

function matchesCustomer(id: string | undefined, customerIds?: Set<string> | null): boolean {
  if (!customerIds) return true;
  if (!id) return false;
  return customerIds.has(id);
}

export function filterModemPayDeposits(
  rows: RtdbDepositRecord[],
  opts: FilterOpts & { successfulOnly?: boolean } = {}
): RtdbDepositRecord[] {
  return rows.filter((r) => {
    if (opts.successfulOnly && !isSuccessfulDeposit(r)) return false;
    if (opts.from && opts.to && !inIsoDateRange(r.timestamp, opts.from, opts.to)) return false;
    if (!matchesCustomer(r.customer_id, opts.customerIds)) return false;
    return true;
  });
}

export function filterModemPayWithdrawals(
  rows: RtdbWithdrawalRecord[],
  opts: FilterOpts & { status?: "all" | "completed" | "pending" } = {}
): RtdbWithdrawalRecord[] {
  return rows.filter((r) => {
    if (opts.status === "completed" && !isSuccessfulWithdrawal(r)) return false;
    if (opts.status === "pending" && !isPendingWithdrawal(r)) return false;
    if (opts.from && opts.to && !inIsoDateRange(r.requested_at, opts.from, opts.to)) return false;
    if (!matchesCustomer(r.user_id, opts.customerIds)) return false;
    return true;
  });
}

export function sumModemPayAmount(rows: { amount?: number }[]): number {
  return Math.round(rows.reduce((sum, r) => sum + Math.abs(Number(r.amount) || 0), 0) * 100) / 100;
}

export type ModemPayCashBucket = {
  deposits: number;
  withdrawals: number;
  depositCount: number;
  withdrawalCount: number;
};

function emptyBucket(): ModemPayCashBucket {
  return { deposits: 0, withdrawals: 0, depositCount: 0, withdrawalCount: 0 };
}

function bumpBucket(
  map: Map<string, ModemPayCashBucket>,
  key: string,
  field: "deposits" | "withdrawals",
  amount: number
) {
  if (!key) return;
  const cur = map.get(key) ?? emptyBucket();
  cur[field] = Math.round((cur[field] + amount) * 100) / 100;
  if (field === "deposits") cur.depositCount += 1;
  else cur.withdrawalCount += 1;
  map.set(key, cur);
}

/** Roll successful ModemPay deposits/withdrawals into calendar months (YYYY-MM → totals). */
export function groupModemPayCashByMonth(
  deposits: RtdbDepositRecord[],
  withdrawals: RtdbWithdrawalRecord[],
  from: string,
  to: string
): Map<string, { deposits: number; withdrawals: number }> {
  const byMonth = new Map<string, { deposits: number; withdrawals: number }>();

  const bump = (monthKey: string, field: "deposits" | "withdrawals", amount: number) => {
    if (!monthKey || monthKey.length < 7) return;
    const cur = byMonth.get(monthKey) ?? { deposits: 0, withdrawals: 0 };
    cur[field] = Math.round((cur[field] + amount) * 100) / 100;
    byMonth.set(monthKey, cur);
  };

  for (const row of filterModemPayDeposits(deposits, { from, to, successfulOnly: true })) {
    bump(paymentIsoDate(row.timestamp).slice(0, 7), "deposits", Math.abs(Number(row.amount) || 0));
  }
  for (const row of filterModemPayWithdrawals(withdrawals, { from, to, status: "completed" })) {
    bump(paymentIsoDate(row.requested_at).slice(0, 7), "withdrawals", Math.abs(Number(row.amount) || 0));
  }

  return byMonth;
}

/** Roll successful ModemPay cash into calendar days (YYYY-MM-DD) for fee reconciliation. */
export function groupModemPayCashByDay(
  deposits: RtdbDepositRecord[],
  withdrawals: RtdbWithdrawalRecord[],
  from: string,
  to: string,
  customerIds?: Set<string> | null
): Map<string, ModemPayCashBucket> {
  const byDay = new Map<string, ModemPayCashBucket>();

  for (const row of filterModemPayDeposits(deposits, { from, to, successfulOnly: true, customerIds })) {
    bumpBucket(byDay, paymentIsoDate(row.timestamp), "deposits", Math.abs(Number(row.amount) || 0));
  }
  for (const row of filterModemPayWithdrawals(withdrawals, {
    from,
    to,
    status: "completed",
    customerIds,
  })) {
    bumpBucket(
      byDay,
      paymentIsoDate(row.requested_at),
      "withdrawals",
      Math.abs(Number(row.amount) || 0)
    );
  }

  return byDay;
}

export function summarizeModemPayPeriod(
  deposits: RtdbDepositRecord[],
  withdrawals: RtdbWithdrawalRecord[],
  from: string,
  to: string,
  customerIds?: Set<string> | null
): ModemPayCashBucket & { net: number; pendingPayouts: number; pendingPayoutCount: number } {
  const okDeposits = filterModemPayDeposits(deposits, { from, to, successfulOnly: true, customerIds });
  const okWithdrawals = filterModemPayWithdrawals(withdrawals, {
    from,
    to,
    status: "completed",
    customerIds,
  });
  const pending = filterModemPayWithdrawals(withdrawals, { from, to, status: "pending", customerIds });
  const depositTotal = sumModemPayAmount(okDeposits);
  const withdrawalTotal = sumModemPayAmount(okWithdrawals);
  return {
    deposits: depositTotal,
    withdrawals: withdrawalTotal,
    depositCount: okDeposits.length,
    withdrawalCount: okWithdrawals.length,
    net: Math.round((depositTotal - withdrawalTotal) * 100) / 100,
    pendingPayouts: sumModemPayAmount(pending),
    pendingPayoutCount: pending.length,
  };
}
