import type { Timestamp } from "firebase/firestore";

export type Role = "admin" | "super_agent" | "sub_agent" | "player";
export type UserStatus = "active" | "suspended";

export interface UserProfile {
  uid: string;
  name: string;
  email: string | null;
  phone: string | null; // normalized digits
  role: Role;
  parentId: string | null; // owning agent uid (players) / super agent uid (sub agents)
  agentSlug: string | null; // agent username, referral code, subdomain
  status: UserStatus;
  createdAt: Timestamp | null;
  stats?: AgentStats;
}

export interface AgentStats {
  customerCount?: number;
  subAgentCount?: number;
  customerDeposits?: number;
  totalBets?: number;
  totalWins?: number;
  commissionEarned?: number;
}

export interface Wallet {
  balance: number;
  currency: "XOF";
  frozen: boolean;
  updatedAt: Timestamp | null;
}

export type TransactionType =
  | "deposit"
  | "withdrawal"
  | "bet"
  | "win"
  | "commission"
  | "transfer"
  | "refund";

export interface WalletTransaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number; // positive = credit, negative = debit
  balanceBefore: number;
  balanceAfter: number;
  reference: string;
  status: "pending" | "completed" | "failed";
  description: string;
  meta?: Record<string, unknown>;
  createdAt: Timestamp | null;
}

export interface Game {
  id: string;
  name: string;
  type: "crash" | "slots";
  provider: string;
  rtp: number;
  status: "active" | "inactive";
  settings: { maxMultiplier?: number; growthRate?: number };
}

export interface GameSession {
  id: string;
  playerId: string;
  gameId: string;
  betAmount: number;
  autoCashoutAt: number | null;
  cashoutMultiplier: number | null;
  winAmount: number | null;
  status: "active" | "won" | "lost" | "cancelled";
  roundId: string;
  provablyFairHash: string;
  createdAt: Timestamp | null;
}

export type RoundStatus = "betting" | "flying" | "crashed";

/** Live round state stored in Realtime Database at rounds/{gameId}/current */
export interface LiveRound {
  roundId: string;
  status: RoundStatus;
  /** epoch ms when current phase started */
  phaseStart: number;
  /** epoch ms when betting closes (betting phase only) */
  bettingEndsAt: number;
  /** sha256 commitment of the server seed (provably fair) */
  hash: string;
  /** revealed after crash */
  crashPoint?: number;
  /** revealed after crash */
  serverSeed?: string;
  /** multiplier growth rate (m = e^(k*t)) */
  growthRate: number;
}

export interface Commission {
  id: string;
  agentId: string;
  playerId: string;
  playerName?: string;
  ggrAmount: number;
  commissionRate: number;
  commissionAmount: number;
  periodDate: string; // YYYY-MM-DD
  paidAt: Timestamp | null;
  createdAt: Timestamp | null;
}

export type PaymentProvider = "wave" | "afrimoney" | "aps" | "qmoney";
export type PaymentStatus = "pending" | "approved" | "rejected" | "paid" | "failed";

export interface PaymentRequest {
  id: string;
  userId: string;
  userName?: string;
  userRole?: Role;
  type: "deposit" | "withdrawal";
  amount: number;
  provider: PaymentProvider;
  status: PaymentStatus;
  providerRef?: string | null;
  approvedBy?: string | null;
  meta?: { phone?: string; reason?: string; [k: string]: unknown };
  createdAt: Timestamp | null;
}

export interface PlatformSettings {
  subAgentRate: number; // e.g. 0.05
  superAgentRate: number; // e.g. 0.03
  minBet: number;
  maxBet: number;
  minDeposit: number;
  minWithdrawal: number;
  minAutoCashout: number;
  maxAutoCashout: number;
  providers: Record<PaymentProvider, boolean>;
}

export interface DailyStats {
  date: string;
  bets: number;
  wins: number;
  deposits: number;
  withdrawals: number;
  sessions: number;
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  subAgentRate: 0.05,
  superAgentRate: 0.03,
  minBet: 10,
  maxBet: 100_000,
  minDeposit: 100,
  minWithdrawal: 500,
  minAutoCashout: 1.01,
  maxAutoCashout: 100,
  providers: { wave: true, afrimoney: true, aps: true, qmoney: true },
};

export const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  wave: "Wave",
  afrimoney: "Afrimoney",
  aps: "APS",
  qmoney: "QMoney",
};
