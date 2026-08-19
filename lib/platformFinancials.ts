import type { WalletTransaction } from "@/lib/types";
import { normalizeCommissionRate } from "@/lib/commissionRate";

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

/**
 * Marketer commissionable GGR — net cash BETESE kept from linked customers.
 * Does not count recycled winnings (turnover / stakes − wins).
 *
 * Example: deposit 500, win 500, bet 1,000, lose → commissionable is 500, not 1,000.
 */
export function commissionableGgr(deposits: number, withdrawals: number, cashHeld: number): number {
  const n =
    (Number(deposits) || 0) -
    (Number(withdrawals) || 0) -
    Math.max(0, Number(cashHeld) || 0);
  return Math.round(Math.max(0, n) * 100) / 100;
}

export type AgentCommissionBook = {
  deposits: number;
  withdrawals: number;
  cashHeld: number;
  stakes: number;
  wins: number;
  commissionableGgr: number;
};

export function emptyAgentCommissionBook(): AgentCommissionBook {
  return { deposits: 0, withdrawals: 0, cashHeld: 0, stakes: 0, wins: 0, commissionableGgr: 0 };
}

export function playerLinkedToAgent(
  player: { parentId?: string | null; ancestors?: string[] | null },
  agentId: string
): boolean {
  if (!agentId) return false;
  if (player.parentId === agentId) return true;
  return Array.isArray(player.ancestors) && player.ancestors.includes(agentId);
}

export function addPlayerToAgentBook(
  book: AgentCommissionBook,
  stats:
    | {
        totalDeposits?: number;
        totalWithdrawals?: number;
        walletCash?: number;
        totalBets?: number;
        totalWins?: number;
      }
    | null
    | undefined
): void {
  book.deposits += Number(stats?.totalDeposits ?? 0);
  book.withdrawals += Number(stats?.totalWithdrawals ?? 0);
  book.cashHeld += Math.max(0, Number(stats?.walletCash ?? 0));
  book.stakes += Number(stats?.totalBets ?? 0);
  book.wins += Number(stats?.totalWins ?? 0);
}

export function finalizeAgentBook(book: AgentCommissionBook): AgentCommissionBook {
  const deposits = Math.round(book.deposits * 100) / 100;
  const withdrawals = Math.round(book.withdrawals * 100) / 100;
  const cashHeld = Math.round(book.cashHeld * 100) / 100;
  const stakes = Math.round(book.stakes * 100) / 100;
  const wins = Math.round(book.wins * 100) / 100;
  return {
    deposits,
    withdrawals,
    cashHeld,
    stakes,
    wins,
    commissionableGgr: commissionableGgr(deposits, withdrawals, cashHeld),
  };
}

export function apiProviderCommissionDue(ggr: number, rate: number): number {
  const r = normalizeCommissionRate(rate, 0);
  if (r <= 0 || ggr <= 0) return 0;
  return Math.round(ggr * r * 100) / 100;
}

/** Agent commission share of GGR (same rate as nightly job when all GGR is agent-attributed). */
export function agentCommissionDue(ggr: number, rate: number): number {
  const r = normalizeCommissionRate(rate, 0);
  if (r <= 0 || ggr <= 0) return 0;
  return Math.round(ggr * r * 100) / 100;
}
