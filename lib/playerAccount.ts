import type { AgentStats } from "@/lib/types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Player P&L from lifetime bets/wins (positive = customer winning). */
export function playerWinLoss(stats?: Pick<AgentStats, "totalBets" | "totalWins"> | null): number {
  return round2((stats?.totalWins ?? 0) - (stats?.totalBets ?? 0));
}

export type AccountTotals = {
  totalDeposits: number;
  totalWithdrawals: number;
  totalBets: number;
  totalWins: number;
  winLoss: number;
};

export function accountTotalsFromStats(
  stats?: Pick<AgentStats, "totalDeposits" | "totalWithdrawals" | "totalBets" | "totalWins"> | null,
): AccountTotals {
  const totalDeposits = Number(stats?.totalDeposits ?? 0);
  const totalWithdrawals = Number(stats?.totalWithdrawals ?? 0);
  const totalBets = Number(stats?.totalBets ?? 0);
  const totalWins = Number(stats?.totalWins ?? 0);
  return {
    totalDeposits,
    totalWithdrawals,
    totalBets,
    totalWins,
    winLoss: round2(totalWins - totalBets),
  };
}
