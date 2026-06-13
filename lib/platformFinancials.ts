import type { WalletTransaction } from "@/lib/types";

export interface PlatformFinancialTotals {
  totalBets: number;
  totalWins: number;
  totalDeposits: number;
  totalWithdrawals: number;
}

/** Sum ledger rows into platform totals (source of truth for dashboard). */
export function aggregateTransactionTotals(
  rows: Pick<WalletTransaction, "type" | "amount">[]
): PlatformFinancialTotals {
  const totals: PlatformFinancialTotals = {
    totalBets: 0,
    totalWins: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
  };

  for (const row of rows) {
    const amount = Math.abs(Number(row.amount) || 0);
    if (amount <= 0) continue;
    switch (row.type) {
      case "bet":
        totals.totalBets += amount;
        break;
      case "win":
        totals.totalWins += amount;
        break;
      case "deposit":
        totals.totalDeposits += amount;
        break;
      case "withdrawal":
        totals.totalWithdrawals += amount;
        break;
      default:
        break;
    }
  }

  return totals;
}

export function ggrFromTotals(totals: Pick<PlatformFinancialTotals, "totalBets" | "totalWins">): number {
  return Math.max(0, (totals.totalBets ?? 0) - (totals.totalWins ?? 0));
}

export function apiProviderCommissionDue(ggr: number, rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0 || ggr <= 0) return 0;
  return Math.round(ggr * rate * 100) / 100;
}
