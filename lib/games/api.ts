/**
 * Unified client API for all Betese games (crash, slots, …).
 * Game pages and the lobby use this layer instead of calling Firebase directly.
 */
import { onValue, ref, type Unsubscribe } from "firebase/database";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  where,
  type Unsubscribe as FsUnsubscribe,
} from "firebase/firestore";
import { db, rtdb } from "@/lib/firebase";
import { cashout, placeBet } from "@/lib/api";
import { DEFAULT_SETTINGS, type Game, type GameSession, type LiveRound, type PlatformSettings } from "@/lib/types";

export type CrashHistoryItem = { roundId: string; crashPoint: number; at: number };

export async function fetchGame(gameId: string): Promise<Game | null> {
  const snap = await getDoc(doc(db, "games", gameId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Game;
}

export function subscribeActiveGames(onGames: (games: Game[]) => void): FsUnsubscribe {
  const q = query(collection(db, "games"), where("status", "==", "active"));
  return onSnapshot(q, (snap) => {
    onGames(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Game));
  });
}

export function subscribePlatformSettings(
  onSettings: (settings: PlatformSettings) => void
): FsUnsubscribe {
  return onSnapshot(doc(db, "settings", "platform"), (snap) => {
    onSettings(snap.exists() ? ({ ...DEFAULT_SETTINGS, ...snap.data() } as PlatformSettings) : DEFAULT_SETTINGS);
  });
}

export function subscribeGameRound(
  gameId: string,
  onRound: (round: LiveRound | null) => void
): Unsubscribe {
  return onValue(ref(rtdb, `rounds/${gameId}/current`), (snap) => {
    onRound(snap.val());
  });
}

export function subscribeServerTimeOffset(onOffset: (ms: number) => void): Unsubscribe {
  return onValue(ref(rtdb, ".info/serverTimeOffset"), (snap) => {
    onOffset(snap.val() ?? 0);
  });
}

export function subscribeCrashHistory(
  gameId: string,
  onHistory: (items: CrashHistoryItem[]) => void,
  maxItems = 12
): Unsubscribe {
  return onValue(ref(rtdb, `rounds/${gameId}/history`), (snap) => {
    const val = (snap.val() ?? {}) as Record<string, { crashPoint: number; at: number }>;
    const items = Object.entries(val)
      .map(([roundId, v]) => ({ roundId, crashPoint: v.crashPoint, at: v.at }))
      .sort((a, b) => b.at - a.at)
      .slice(0, maxItems);
    onHistory(items);
  });
}

export function subscribePlayerSession(
  gameId: string,
  playerId: string,
  onSession: (session: GameSession | null) => void
): FsUnsubscribe {
  const q = query(
    collection(db, "gameSessions"),
    where("playerId", "==", playerId),
    where("gameId", "==", gameId),
    where("status", "==", "active"),
    limit(1)
  );
  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      onSession(null);
      return;
    }
    const d = snap.docs[0];
    onSession({ id: d.id, ...d.data() } as GameSession);
  });
}

export function subscribeSessionUpdates(
  sessionId: string,
  onSession: (session: GameSession) => void
): FsUnsubscribe {
  return onSnapshot(doc(db, "gameSessions", sessionId), (snap) => {
    if (!snap.exists()) return;
    onSession({ id: snap.id, ...snap.data() } as GameSession);
  });
}

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

/** Map game type → play route (extend when adding slots etc.). */
export function gamePlayPath(game: Pick<Game, "id" | "type">): string {
  switch (game.type) {
    case "crash":
      return `/play/game/${game.id}`;
    case "slots":
      return `/play/game/${game.id}`;
    default:
      return `/play/game/${game.id}`;
  }
}
