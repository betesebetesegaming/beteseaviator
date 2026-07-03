import { app } from "./firebase";
import type { Functions } from "firebase/functions";
import type { PromoSlide } from "./games/promotions";
import type { PaymentProvider, Role } from "./types";

let functionsInstance: Functions | null = null;

async function getFunctions() {
  if (!functionsInstance) {
    const { getFunctions: initFunctions } = await import("firebase/functions");
    functionsInstance = initFunctions(app, "us-central1");
  }
  return functionsInstance;
}

function call<Req, Res>(name: string) {
  return async (data: Req): Promise<Res> => {
    const [{ httpsCallable }, fns] = await Promise.all([
      import("firebase/functions"),
      getFunctions(),
    ]);
    const result = await httpsCallable<Req, Res>(fns, name)(data);
    return result.data;
  };
}

// ---------- auth / profile ----------

export const completeRegistration = call<
  {
    name: string;
    phone?: string;
    ref?: string | null;
    pref?: string | null;
    deviceId?: string | null;
  },
  { ok: true; role: Role; playerNumber?: number; playerId?: string }
>("completeRegistration");

export const agentCreateCustomer = call<
  { name: string; phone: string; password: string },
  { uid: string; playerNumber: number; playerId: string }
>("agentCreateCustomer");

export const adminBackfillPlayerIds = call<
  { limit?: number },
  { ok: true; updated: string[]; count: number }
>("adminBackfillPlayerIds");

/** Reset player password after SMS OTP verification (forgot password flow). */
export const resetPlayerPassword = call<
  { phone: string; password: string },
  { ok: true; phone: string; authEmail: string }
>("resetPlayerPassword");

export const getPlayerReferralDashboard = call<
  Record<string, never>,
  {
    enabled: boolean;
    bonusAmount: number;
    minQualifyingDeposit: number;
    requireFirstBet: boolean;
    referralCode: string;
    friendsInvited: number;
    qualifiedFriends: number;
    pendingBonuses: number;
    totalBonusEarned: number;
    referralBalance: number;
    weeklyReleaseToPlay: boolean;
    nextReleaseAt: string;
  }
>("getPlayerReferralDashboard");

export const claimReferralEarnings = call<
  {
    mode: "withdraw";
    amount?: number;
    provider?: PaymentProvider;
    phone?: string;
  },
  { ok: true; requestId: string }
>("claimReferralEarnings");

export const adminReleaseReferralBonuses = call<
  { uid?: string },
  { players: number; total: number }
>("adminReleaseReferralBonuses");

/** Agent/staff username login: verifies password server-side, returns email for client sign-in. */
export const agentLogin = call<
  { username: string; password: string },
  { email: string }
>("agentLogin");

/** Sync staff Firestore profile + role claims after Firebase Auth sign-in. */
export const resolveStaffSession = call<
  Record<string, never>,
  { ok: true; role: Role; status: string; agentSlug: string | null; name: string }
>("resolveStaffSession");

// ---------- game ----------

export const placeBet = call<
  { gameId: string; betAmount: number; autoCashoutAt?: number | null },
  { sessionId: string; roundId: string; hash: string }
>("placeBet");

export const cashout = call<
  { sessionId: string },
  { multiplier: number; winAmount: number }
>("cashout");

// ---------- wallet ----------

export const requestDeposit = call<
  { provider: PaymentProvider; phone: string; amount: number },
  { requestId: string; reference: string; instructions: string }
>("requestDeposit");

export const requestWithdrawal = call<
  { provider: PaymentProvider; phone: string; amount: number },
  { requestId: string }
>("requestWithdrawal");

// ---------- agent ----------

export const agentDepositToCustomer = call<
  { customerId: string; amount: number },
  { ok: true }
>("agentDepositToCustomer");

// ---------- admin ----------

export const adminCreateUser = call<
  {
    role: Role;
    name: string;
    email?: string;
    phone?: string;
    username?: string;
    password: string;
    parentId?: string | null;
  },
  { uid: string; slug?: string }
>("adminCreateUser");

export const adminSetUserStatus = call<
  { uid: string; status: "active" | "suspended" },
  { ok: true }
>("adminSetUserStatus");

export const adminAdjustWallet = call<
  { uid: string; amount: number; reason: string },
  { newBalance: number }
>("adminAdjustWallet");

export const adminFreezeWallet = call<
  { uid: string; frozen: boolean },
  { ok: true }
>("adminFreezeWallet");

export const adminResetPlayerPassword = call<
  { phone: string; password: string },
  { ok: true; uid: string; phone: string; authEmail: string }
>("adminResetPlayerPassword");

export const adminResolvePayment = call<
  { requestId: string; action: "approve" | "reject"; reason?: string },
  { ok: true; status: string }
>("adminResolvePayment");

export const adminSaveSettings = call<Record<string, unknown>, { ok: true }>(
  "adminSaveSettings"
);

export const adminSaveLobbyPromos = call<
  { slides: PromoSlide[]; ticker?: string[] },
  { ok: true }
>("adminSaveLobbyPromos");

export const adminSaveLobbyLayout = call<
  {
    featuredGameIds: string[];
    manualOrder: string[];
    sortMode: "manual" | "best_selling";
  },
  { ok: true }
>("adminSaveLobbyLayout");

export const adminSyncAgentLogins = call<
  Record<string, never>,
  { ok: true; synced: number }
>("adminSyncAgentLogins");

export const adminRefreshDailyDemos = call<
  Record<string, never>,
  { ok: true; date: string; accounts: unknown[] }
>("adminRefreshDailyDemos");

export const adminRebuildPlatformStats = call<
  Record<string, never>,
  {
    ok: true;
    customerCount: number;
    agentCount: number;
    totalBets: number;
    totalWins: number;
    totalDeposits: number;
    totalWithdrawals: number;
    ggr: number;
  }
>("adminRebuildPlatformStats");

export const adminSetGameStatus = call<
  {
    gameId: string;
    status?: "active" | "inactive";
    name?: string;
    engine?: "native" | "qtech";
    qtechGameId?: string;
    rtp?: number;
    imageUrl?: string;
  },
  { ok: true }
>("adminSetGameStatus");

export type QTechSetupStatus = {
  walletUrl: string;
  walletReady: boolean;
  launchReady: boolean;
  integrationEnabled: boolean;
  missing: string[];
  games: Array<{
    id: string;
    name: string;
    status: string;
    qtechGameId: string;
    lobbyCategory: string;
    imageUrl: string;
    ready: boolean;
  }>;
};

export const adminGetQTechSetup = call<Record<string, never>, QTechSetupStatus>("adminGetQTechSetup");

export const adminSeedQTechGames = call<
  Record<string, never>,
  QTechSetupStatus & {
    ok: true;
    gameIds: string[];
    imageSync?: { updated: string[]; skipped: string[]; missing: string[] };
  }
>("adminSeedQTechGames");

export const adminSyncQTechGameImages = call<
  Record<string, never>,
  QTechSetupStatus & {
    ok: true;
    imageSync: { updated: string[]; skipped: string[]; missing: string[] };
  }
>("adminSyncQTechGameImages");

export const adminAddQTechGame = call<
  {
    qtechGameId: string;
    name: string;
    lobbyCategory: "aviator" | "crash" | "instantwin";
    rtp?: number;
    imageUrl?: string;
  },
  QTechSetupStatus & { ok: true; id: string }
>("adminAddQTechGame");

export const adminDeleteGame = call<{ gameId: string }, { ok: true }>("adminDeleteGame");

export const adminDeactivateNativeLobbyGames = call<
  Record<string, never>,
  { ok: true; deactivated: string[] }
>("adminDeactivateNativeLobbyGames");

export const adminSaveQTechSettings = call<
  { qtech: Record<string, unknown> },
  QTechSetupStatus & { ok: true }
>("adminSaveQTechSettings");

export type QTechCwTestStep = { name: string; ok: boolean; detail?: string };

export type QTechCwTestResult = {
  ok: boolean;
  playerId: string;
  walletUrl: string;
  sessions: { active: string; expired: string };
  steps: QTechCwTestStep[];
  error?: string;
  durationMs: number;
};

export const adminRunQTechCwTest = call<
  { playerUid?: string; amount?: number; gameId?: string },
  QTechCwTestResult
>("adminRunQTechCwTest");

export const launchQTechGame = call<
  { gameId: string; device?: "mobile" | "desktop" },
  { launchUrl: string; walletSession: string }
>("launchQTechGame");

export const launchQTechGameDemo = call<
  { gameId: string; device?: "mobile" | "desktop" },
  { launchUrl: string }
>("launchQTechGameDemo");

export const adminPreviewQTechGame = call<
  { qtechGameId: string; device?: "mobile" | "desktop" },
  { launchUrl: string }
>("adminPreviewQTechGame");

export type OperationsHubResponse = {
  scope: "platform" | "network";
  role: Role;
  network: Array<{
    uid: string;
    name: string;
    role: Role;
    phone: string | null;
    email: string | null;
    agentSlug: string | null;
    status: string;
    balance?: number;
    playerNumber?: number | null;
    playerId?: string | null;
    parentId?: string | null;
    parentName?: string | null;
    createdAt?: number | null;
  }>;
  agents?: Array<{
    uid: string;
    name: string;
    agentSlug: string | null;
    phone: string | null;
    email: string | null;
    status: string;
    customerCount: number;
    customersOpenedToday: number;
    customerDeposits: number;
    totalBets: number;
    totalWins: number;
    ggr: number;
    commissionEarned: number;
  }>;
  live: Array<{
    uid: string;
    name: string;
    role: Role;
    page: string;
    lastSeen: number;
    online: boolean;
  }>;
  liveOnline: number;
  transactions: Array<{
    id: string;
    userId: string;
    userName?: string;
    playerId?: string | null;
    agentId?: string | null;
    agentName?: string | null;
    type: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    reference: string;
    description: string;
    meta?: Record<string, unknown>;
    createdAt: number | null;
  }>;
};

export const getOperationsHub = call<
  { type?: string; limit?: number },
  OperationsHubResponse
>("getOperationsHub");

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object") {
    const err = e as { code?: string; message?: unknown; details?: unknown };
    const msg = err.message != null ? String(err.message) : "";
    const cleaned = msg.replace(/^(functions\/[\w-]+:?\s*)/i, "").trim();
    if (cleaned && cleaned.toUpperCase() !== "INTERNAL") return cleaned;
    if (err.code?.includes("internal")) {
      return "Server error — please try again in a moment.";
    }
    if (err.code?.includes("failed-precondition")) {
      return cleaned || "That action is not available right now.";
    }
    if (err.code?.includes("already-exists")) {
      return cleaned || "This phone number is already registered.";
    }
    if (cleaned) return cleaned;
  }
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong. Please try again.";
}
