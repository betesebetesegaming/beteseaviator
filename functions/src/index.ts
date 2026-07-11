/**
 * BETESE Aviator — Firebase Cloud Functions backend.
 */
import { setGlobalOptions } from "firebase-functions/v2";
import { createHttpFunction } from "./http";
import { sendOtpHandler, verifyOtpHandler } from "./routes/otp";

// cpu "gcf_gen1" = fractional vCPU (~1/6 at 256MiB) so all functions fit the
// project's regional Cloud Run CPU quota; requires concurrency 1.
setGlobalOptions({
  region: "us-central1",
  maxInstances: 10,
  memory: "256MiB",
  cpu: "gcf_gen1",
  concurrency: 1,
});

export {
  completeRegistration,
  resetPlayerPassword,
  resetPlayerPasswordWithOtp,
  agentLogin,
  resolveStaffSession,
  seedPlatform,
  ensurePrimaryAdmin,
} from "./auth";
export { placeBet, cashout, pokeRound, gameTick } from "./game";
export { adminResolvePayment, requestWithdrawal } from "./payments";
export {
  agentCreateCustomer,
  agentDepositToCustomer,
} from "./agent";
export {
  adminSetAgentCashOps,
  agentOtcCashDeposit,
  agentOtcCashWithdraw,
  agentLookupCustomer,
  adminOtcCashDeposit,
  adminOtcCashWithdraw,
} from "./agentCashOps";
export {
  adminCreateUser,
  adminSetUserStatus,
  adminAdjustWallet,
  adminFreezeWallet,
  adminResetPlayerPassword,
  adminSetUserPassword,
  adminSaveSettings,
  adminSaveLobbyPromos,
  adminSaveLobbyLayout,
  adminSyncAgentLogins,
  adminRefreshDailyDemos,
  adminRebuildPlatformStats,
  adminSetGameStatus,
  adminAddQTechGame,
  adminDeleteGame,
  adminDeactivateNativeLobbyGames,
  adminSeedQTechGames,
  adminSyncQTechGameImages,
  adminEnsureLobbyGames,
  adminBackfillPlayerIds,
  adminGetQTechSetup,
  adminSaveQTechSettings,
  adminRunQTechCwTest,
} from "./admin";
export { processCommissions, adminRunCommissions } from "./commissions";
export {
  runSmartBonusAnalysis,
  adminRunSmartBonusAnalysis,
  smartBonusApprove,
  smartBonusEdit,
  smartBonusReject,
  smartBonusSend,
  agentRequestSmartBonus,
} from "./smartBonus";

export { getOperationsHub } from "./operations";
export {
  getPlayerReferralDashboard,
  claimReferralEarnings,
  releaseReferralBonusesWeekly,
  adminReleaseReferralBonuses,
} from "./referrals";

/** Africell SMS OTP — direct internet egress (Africell gateway is not reachable via VPC NAT).
 *
 * WARNING: Do NOT add Firebase Phone Auth callables here. SMS = Africell only.
 */
export const sendOtp = createHttpFunction(sendOtpHandler, { timeoutSeconds: 60 });
export const verifyOtp = createHttpFunction(verifyOtpHandler);

/** ModemPay — same handlers as betesepmu (single Cloud Function to save quota). */
export { modempayApi } from "./modempayApi";

/** QTech Common Wallet API + game launch. */
export { qtcwApi, qtcwApiStg } from "./qtechApi";
export { launchQTechGame, launchQTechGameDemo, adminPreviewQTechGame } from "./qtech/launch";
