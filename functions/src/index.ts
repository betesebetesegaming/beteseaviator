/**
 * BETESE Aviator — Firebase Cloud Functions backend.
 */
import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ region: "us-central1", maxInstances: 10, memory: "256MiB" });

export { completeRegistration, agentLogin, seedPlatform } from "./auth";
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
} from "./admin";
export { processCommissions, adminRunCommissions } from "./commissions";

/** ModemPay — same handlers as betesepmu (single Cloud Function to save quota). */
export { modempayApi } from "./modempayApi";
