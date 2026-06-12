import { cashout, placeBet } from "@/lib/api";

/** Place a bet on any crash-style game (same backend callable for all game ids). */
export async function placeGameBet(input: {
  gameId: string;
  betAmount: number;
  autoCashoutAt?: number | null;
}) {
  return placeBet(input);
}

/** Cash out an active game session. */
export async function cashoutGameBet(sessionId: string) {
  return cashout({ sessionId });
}
