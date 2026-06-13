/**
 * Firestore / RTDB listeners for games — no Cloud Functions SDK (keeps lobby bundle lean).
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
import { db } from "@/lib/firestore";
import { rtdb } from "@/lib/rtdb";
import { filterLobbyGames } from "@/lib/games/catalog";
import { DEFAULT_SETTINGS, type Game, type GameSession, type LiveRound, type PlatformSettings } from "@/lib/types";

export type CrashHistoryItem = { roundId: string; crashPoint: number; at: number };

export async function fetchGame(gameId: string): Promise<Game | null> {
  const ref = doc(db, "games", gameId);
  const timeoutMs = 8_000;

  try {
    const snap = await Promise.race([
      getDoc(ref),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!snap) return null;
    if (!("exists" in snap) || !snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as Game;
  } catch {
    return null;
  }
}

/** Live listener — returns cached data immediately when offline cache is warm. */
export function subscribeGame(
  gameId: string,
  onGame: (game: Game | null) => void
): FsUnsubscribe {
  return onSnapshot(
    doc(db, "games", gameId),
    (snap) => {
      onGame(snap.exists() ? ({ id: snap.id, ...snap.data() } as Game) : null);
    },
    () => onGame(null)
  );
}

export function subscribeActiveGames(onGames: (games: Game[]) => void): FsUnsubscribe {
  const q = query(collection(db, "games"), where("status", "==", "active"));
  return onSnapshot(q, (snap) => {
    const games = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Game);
    onGames(filterLobbyGames(games));
  });
}

export function subscribePlatformSettings(
  onSettings: (settings: PlatformSettings) => void
): FsUnsubscribe {
  return onSnapshot(doc(db, "settings", "platform"), (snap) => {
    const data = (snap.exists() ? snap.data() : {}) as Partial<PlatformSettings>;
    onSettings({
      ...DEFAULT_SETTINGS,
      ...data,
      providers: { ...DEFAULT_SETTINGS.providers, ...(data.providers ?? {}) },
      bonuses: {
        ...DEFAULT_SETTINGS.bonuses!,
        ...(data.bonuses ?? {}),
        firstDeposit: {
          ...DEFAULT_SETTINGS.bonuses!.firstDeposit,
          ...(data.bonuses?.firstDeposit ?? {}),
        },
        weeklyCrash: {
          ...DEFAULT_SETTINGS.bonuses!.weeklyCrash,
          ...(data.bonuses?.weeklyCrash ?? {}),
        },
        weekend: {
          ...DEFAULT_SETTINGS.bonuses!.weekend,
          ...(data.bonuses?.weekend ?? {}),
        },
      },
    });
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
