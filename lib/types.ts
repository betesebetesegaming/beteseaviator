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
  staffLoginId?: string | null; // admin username login id
  /** Player invite code (e.g. GREGORY1A2B). */
  referralCode?: string | null;
  /** UID of player who referred this user. */
  referredBy?: string | null;
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
  referralInvites?: number;
  referralQualified?: number;
  referralBonusEarned?: number;
}

export interface Wallet {
  balance: number;
  bonusBalance?: number;
  currency: "GMD";
  frozen: boolean;
  updatedAt: Timestamp | null;
  /** Sum of deposits not yet played through for free withdrawal. */
  pendingDepositTotal?: number;
  /** GMD wagered toward deposit play-through. */
  depositWagerProgress?: number;
  /** Bonus must be wagered this much before converting to cash. */
  bonusWagerRequired?: number;
  /** GMD wagered from bonus balance toward conversion. */
  bonusWagerProgress?: number;
}

export type TransactionType =
  | "deposit"
  | "withdrawal"
  | "bet"
  | "win"
  | "commission"
  | "transfer"
  | "refund"
  | "bonus";

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

export interface BonusRuleSettings {
  enabled: boolean;
  /** Fraction of deposit, e.g. 0.25 = 25% */
  percent: number;
  maxAmount: number;
  minDeposit: number;
}

export interface WeekendBonusSettings extends BonusRuleSettings {
  /** Friday from this hour (GMT), default 18 = 6pm */
  fridayStartHour: number;
  /** Sunday until this hour (GMT), default 23 */
  sundayEndHour: number;
}

export interface BonusSettings {
  firstDeposit: BonusRuleSettings;
  weeklyCrash: BonusRuleSettings;
  weekend: WeekendBonusSettings;
}

export interface PlayerReferralSettings {
  enabled: boolean;
  bonusAmount: number;
  minQualifyingDeposit: number;
  requireFirstBet: boolean;
}

export interface CustomerCareSettings {
  phone?: string;
  whatsapp?: string;
  label?: string;
}

export interface PlatformSettings {
  subAgentRate: number; // e.g. 0.05
  superAgentRate: number; // e.g. 0.03
  /** API / game provider share of GGR (e.g. 0.15 = 15%). */
  apiProviderRate: number;
  apiProviderName: string;
  minBet: number;
  maxBet: number;
  minDeposit: number;
  minWithdrawal: number;
  minAutoCashout: number;
  maxAutoCashout: number;
  /** Fraction of deposits that must be wagered before free withdrawal (0.8 = 80%). */
  depositPlaythroughRate?: number;
  /** Fee on early withdrawal before play-through (0.15 = 15%). */
  earlyWithdrawalFeeRate?: number;
  /** Bonus must be wagered this many times before becoming cash. */
  bonusWagerMultiplier?: number;
  providers: Record<PaymentProvider, boolean>;
  bonuses?: BonusSettings;
  playerReferral?: PlayerReferralSettings;
  customerCare?: CustomerCareSettings;
}

export interface DailyStats {
  date: string;
  bets: number;
  wins: number;
  deposits: number;
  withdrawals: number;
  sessions: number;
}

import { DEFAULT_BONUS_SETTINGS } from "./bonuses";

export const DEFAULT_SETTINGS: PlatformSettings = {
  subAgentRate: 0.05,
  superAgentRate: 0.03,
  apiProviderRate: 0.15,
  apiProviderName: "API Provider",
  minBet: 10,
  maxBet: 100_000,
  minDeposit: 50,
  minWithdrawal: 500,
  minAutoCashout: 1.01,
  maxAutoCashout: 100,
  depositPlaythroughRate: 0.8,
  earlyWithdrawalFeeRate: 0.15,
  bonusWagerMultiplier: 3,
  providers: { wave: true, afrimoney: true, aps: true, qmoney: true },
  bonuses: DEFAULT_BONUS_SETTINGS,
  playerReferral: {
    enabled: true,
    bonusAmount: 10,
    minQualifyingDeposit: 50,
    requireFirstBet: true,
  },
  customerCare: {
    phone: "2204176003",
    whatsapp: "2204176003",
    label: "BETESE Customer Care",
  },
};

export const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  wave: "Wave",
  afrimoney: "Afrimoney",
  aps: "APS",
  qmoney: "QMoney",
};
