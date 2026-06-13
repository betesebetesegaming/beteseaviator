/**
 * Unified client API for all Betese games (crash, slots, …).
 * Subscriptions are split out so the lobby does not pull Cloud Functions.
 */
export type { CrashHistoryItem } from "./subscriptions";
export {
  fetchGame,
  subscribeGame,
  subscribeActiveGames,
  subscribePlatformSettings,
  subscribeGameRound,
  subscribeServerTimeOffset,
  subscribeCrashHistory,
  subscribePlayerSession,
  subscribeSessionUpdates,
} from "./subscriptions";
export { gamePlayPath } from "./paths";
export { placeGameBet, cashoutGameBet } from "./actions";
