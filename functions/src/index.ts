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

export { completeRegistration, markPhoneOtpVerified, agentLogin, resolveStaffSession, seedPlatform, ensurePrimaryAdmin } from "./auth";
export { placeBet, cashout, pokeRound, gameTick } from "./game";
export { adminResolvePayment } from "./payments";
export {
  agentCreateCustomer,
  agentDepositToCustomer,
} from "./agent";
export {
  adminCreateUser,
  adminSetUserStatus,
  adminAdjustWallet,
  adminFreezeWallet,
  adminResetPlayerPassword,
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
  adminGetQTechSetup,
  adminSaveQTechSettings,
  adminRunQTechCwTest,
} from "./admin";
export { processCommissions, adminRunCommissions } from "./commissions";

export { getOperationsHub } from "./operations";
export {
  getPlayerReferralDashboard,
  claimReferralEarnings,
  releaseReferralBonusesWeekly,
  adminReleaseReferralBonuses,
} from "./referrals";

/** Africell SMS OTP — Africell gateway is only reachable from whitelisted IPs (contact Africell). */
export const sendOtp = createHttpFunction(sendOtpHandler);
export const verifyOtp = createHttpFunction(verifyOtpHandler);

/** ModemPay — same handlers as betesepmu (single Cloud Function to save quota). */
export { modempayApi } from "./modempayApi";

/** QTech Common Wallet API + game launch. */
export { qtcwApi } from "./qtechApi";
export { launchQTechGame, launchQTechGameDemo, adminPreviewQTechGame } from "./qtech/launch";
