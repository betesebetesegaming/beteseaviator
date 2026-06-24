/**
 * BETESE Aviator — Firebase Cloud Functions backend.
 */
import { setGlobalOptions } from "firebase-functions/v2";

// cpu "gcf_gen1" = fractional vCPU (~1/6 at 256MiB) so all functions fit the
// project's regional Cloud Run CPU quota; requires concurrency 1.
setGlobalOptions({
  region: "us-central1",
  maxInstances: 10,
  memory: "256MiB",
  cpu: "gcf_gen1",
  concurrency: 1,
});

export { completeRegistration, agentLogin, seedPlatform, ensurePrimaryAdmin } from "./auth";
export { placeBet, cashout, pokeRound, gameTick } from "./game";
export { adminResolvePayment } from "./payments";
export {
  agentCreateCustomer,
  agentDepositToCustomer,
  agentCreateSubAgent,
  agentTransferToSubAgent,
} from "./agent";
export {
  adminCreateUser,
  adminSetUserStatus,
  adminAdjustWallet,
  adminFreezeWallet,
  adminSaveSettings,
  adminSaveLobbyPromos,
  adminRefreshDailyDemos,
  adminRebuildPlatformStats,
  adminSetGameStatus,
  adminAddQTechGame,
  adminDeleteGame,
  adminSeedQTechGames,
  adminEnsureLobbyGames,
  adminGetQTechSetup,
  adminSaveQTechSettings,
} from "./admin";
export { processCommissions, adminRunCommissions } from "./commissions";

export { getOperationsHub } from "./operations";
export { getPlayerReferralDashboard } from "./referrals";

/** ModemPay — same handlers as betesepmu (single Cloud Function to save quota). */
export { modempayApi } from "./modempayApi";

/** QTech Common Wallet API + game launch. */
export { qtcwApi } from "./qtechApi";
export { launchQTechGame } from "./qtech/launch";
