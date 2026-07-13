import type { Timestamp } from "firebase/firestore";

export type Role = "admin" | "agent" | "super_agent" | "sub_agent" | "player";
export type UserStatus = "active" | "suspended";

export interface UserProfile {
  uid: string;
  name: string;
  email: string | null;
  phone: string | null; // normalized digits
  role: Role;
  parentId: string | null; // owning agent uid (players)
  agentSlug: string | null; // agent username, referral code, subdomain
  staffLoginId?: string | null; // admin username login id
  /** Sequential office ID — display as BTE-00001. */
  playerNumber?: number | null;
  /** Player invite code (e.g. GREGORY1A2B). */
  referralCode?: string | null;
  /** UID of player who referred this user. */
  referredBy?: string | null;
  status: UserStatus;
  createdAt: Timestamp | null;
  stats?: AgentStats;
  /** Admin enables OTC cash desk at agent shop (special cases). */
  cashOpsEnabled?: boolean;
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
  /** Unclaimed player referral rewards (GMD). */
  referralBalance?: number;
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
  /** native = BETESE crash engine; qtech = QTech-hosted iframe game */
  engine?: "native" | "qtech";
  /** QTech catalog game id (required when engine is qtech) */
  qtechGameId?: string;
  /** Lobby tab: aviator, crash, or instant win */
  lobbyCategory?: "aviator" | "crash" | "instantwin";
  /** Custom lobby tile image (Firebase Storage URL or site path). */
  imageUrl?: string;
  /** Player lobby ranking stats (updated on QTech bets). */
  lobbyStats?: {
    betCount?: number;
    betVolume?: number;
  };
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
  /** Optional player-facing title (admin override). */
  playerTitle?: string;
  /** Optional free-text rules shown to players for this bonus. */
  playerTerms?: string;
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

export interface SmartBonusSettings {
  /** Master switch for the whole retention engine. */
  enabled: boolean;
  /** Nightly job auto-creates pending offers for eligible players. */
  autoCreate: boolean;
  /** Use Claude to size bonuses + write explanations (falls back to rules). */
  aiEnabled: boolean;
  /** Min days with no bet before a player is a welcome-back candidate. */
  inactiveDays: number;
  /** Recommended bonus is clamped to this range (GMD). */
  minBonus: number;
  maxBonus: number;
  /** Bonus as a fraction of the required matching deposit (1 = 100% match). */
  matchPercent: number;
  /** Times the bonus must be wagered before it converts to cash. */
  wagerMultiplier: number;
  /** Offer lifetime in days before it auto-expires. */
  expiryDays: number;
  /** Max simultaneous active Smart Bonus offers per player. */
  maxConcurrent: number;
}

export type HealthTier = "very_active" | "active" | "at_risk" | "inactive" | "dormant";

export interface PlayerHealth {
  uid: string;
  name: string;
  phone: string | null;
  playerNumber: number | null;
  agentId: string | null;
  ancestors?: string[];
  healthScore: number;
  tier: HealthTier;
  daysSinceLastLogin: number;
  daysSinceLastBet: number;
  daysSinceLastDeposit: number;
  avgDeposit: number;
  avgWeeklyDeposits: number;
  lifetimeDeposits: number;
  lifetimeGgr: number;
  activeBettingDays30: number;
  depositCount: number;
  betCount: number;
  bonusHistoryCount: number;
  bonusConversionCount: number;
  recommendedBonus: number;
  matchDeposit: number;
  eligible: boolean;
  reason: string;
  ineligibleReason?: string;
  aiGenerated?: boolean;
  confidence?: number | null;
  hasActiveOffer?: boolean;
  analyzedAt: Timestamp | null;
}

export type SmartBonusOfferStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "sent"
  | "activated"
  | "expired"
  | "completed";

export interface SmartBonusOffer {
  id: string;
  userId: string;
  userName: string;
  phone: string | null;
  agentId: string | null;
  ancestors?: string[];
  playerNumber: number | null;
  healthScore: number;
  tier: HealthTier;
  daysInactive: number;
  bonusAmount: number;
  matchDeposit: number;
  wagerMultiplier: number;
  wagerRequired: number;
  reason: string;
  /** Claude-authored outreach copy + provenance (empty when rule-based). */
  outreachMessage?: string;
  aiGenerated?: boolean;
  confidence?: number | null;
  status: SmartBonusOfferStatus;
  source: "ai" | "agent_request";
  requestedByAgent?: string | null;
  createdAt: Timestamp | null;
  expiresAt: string;
  approvedBy?: string | null;
  approvedAt?: Timestamp | null;
  rejectedBy?: string | null;
  rejectReason?: string | null;
  sentAt?: Timestamp | null;
  sentChannel?: string | null;
  activatedAt?: Timestamp | null;
  matchedDeposit?: number;
  bonusCredited?: number;
  completedAt?: Timestamp | null;
}

export interface PlayerReferralSettings {
  enabled: boolean;
  bonusAmount: number;
  minQualifyingDeposit: number;
  requireFirstBet: boolean;
  /** Unclaimed balance auto-moves to play credit every Monday. */
  weeklyReleaseToPlay?: boolean;
}

export interface CustomerCareSettings {
  phone?: string;
  whatsapp?: string;
  label?: string;
}

export interface QTechSettings {
  enabled?: boolean;
  passKey?: string;
  apiBaseUrl?: string;
  operatorId?: string;
  apiPassword?: string;
  currency?: string;
  country?: string;
  lang?: string;
  lobbyUrl?: string;
}

export interface PlatformSettings {
  /** Agent commission share of GGR (e.g. 0.05 = 5%). */
  agentRate?: number;
  subAgentRate: number; // legacy
  superAgentRate: number; // legacy
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
  /** Player-facing label for games bonus balance applies to. */
  bonusGamesLabel?: string;
  /** Intro text on the player wallet deposit bonuses panel. */
  bonusIntroText?: string;
  /** Player-facing withdrawal / play-through rules (full text override). */
  withdrawalRulesText?: string;
  /** ISO UTC datetime — after this, no new deposit bonuses (empty = no end). */
  bonusCampaignEndsAt?: string;
  providers: Record<PaymentProvider, boolean>;
  bonuses?: BonusSettings;
  playerReferral?: PlayerReferralSettings;
  smartBonus?: SmartBonusSettings;
  customerCare?: CustomerCareSettings;
  qtech?: QTechSettings;
}

export interface DailyStats {
  date: string;
  bets: number;
  wins: number;
  deposits: number;
  withdrawals: number;
  sessions: number;
  newCustomers?: number;
}

export interface AgentDailyStats {
  agentId: string;
  date: string;
  customersOpened: number;
  /** OTC cash credits handled by this agent today. */
  cashDeposits?: number;
  cashDepositCount?: number;
  /** OTC cash payouts handled by this agent today. */
  cashWithdrawals?: number;
  cashWithdrawalCount?: number;
}

import { DEFAULT_BONUS_SETTINGS } from "./bonuses";

export const DEFAULT_SETTINGS: PlatformSettings = {
  agentRate: 0.05,
  subAgentRate: 0.05,
  superAgentRate: 0.03,
  apiProviderRate: 0.15,
  apiProviderName: "QTech",
  minBet: 1,
  maxBet: 100_000,
  minDeposit: 25,
  minWithdrawal: 100,
  minAutoCashout: 1.01,
  maxAutoCashout: 100,
  depositPlaythroughRate: 0.8,
  earlyWithdrawalFeeRate: 0.15,
  bonusWagerMultiplier: 3,
  bonusGamesLabel: "Aviator & Crash",
  bonusCampaignEndsAt: "",
  providers: { wave: true, afrimoney: true, aps: true, qmoney: true },
  bonuses: DEFAULT_BONUS_SETTINGS,
  playerReferral: {
    enabled: true,
    bonusAmount: 10,
    minQualifyingDeposit: 50,
    requireFirstBet: true,
    weeklyReleaseToPlay: true,
  },
  smartBonus: {
    enabled: false,
    autoCreate: true,
    aiEnabled: false,
    inactiveDays: 30,
    minBonus: 50,
    maxBonus: 1000,
    matchPercent: 1,
    wagerMultiplier: 3,
    expiryDays: 3,
    maxConcurrent: 1,
  },
  customerCare: {
    phone: "2204176003",
    whatsapp: "2204176003",
    label: "BETESE Customer Care",
  },
  qtech: {
    enabled: false,
    passKey: "",
    apiBaseUrl: "",
    operatorId: "",
    apiPassword: "",
    currency: "GMD",
    country: "GM",
    lang: "en_GM",
    lobbyUrl: "https://www.beteseaviator.com/play",
  },
};

export const PROVIDER_LABELS: Record<PaymentProvider, string> = {
  wave: "Wave",
  afrimoney: "Afrimoney",
  aps: "APS",
  qmoney: "QMoney",
};
