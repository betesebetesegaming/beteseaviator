import { logger } from "firebase-functions/v2";
import { db } from "./helpers";

export const NATIVE_LOBBY_GAMES = [
  {
    id: "aviator",
    name: "Aviator",
    lobbyCategory: "aviator" as const,
    imageUrl: "/promotions/aviator-ad.png",
    settings: { maxMultiplier: 100, growthRate: 0.06 },
    rtp: 97,
  },
  {
    id: "aviator-turbo",
    name: "Aviator Turbo",
    lobbyCategory: "aviator" as const,
    imageUrl: "/promotions/aviator-ad.png",
    settings: { maxMultiplier: 200, growthRate: 0.09 },
    rtp: 96,
  },
];

/** Ensures native Aviator games exist and are active on the lobby. */
export async function ensureNativeLobbyGames(): Promise<string[]> {
  const touched: string[] = [];
  for (const game of NATIVE_LOBBY_GAMES) {
    const ref = db.doc(`games/${game.id}`);
    const snap = await ref.get();
    const patch = {
      name: game.name,
      type: "crash",
      provider: "BETESE",
      engine: "native",
      lobbyCategory: game.lobbyCategory,
      imageUrl: game.imageUrl,
      rtp: game.rtp,
      status: "active",
      settings: game.settings,
    };
    if (snap.exists) {
      await ref.set(patch, { merge: true });
    } else {
      await ref.set(patch);
    }
    touched.push(game.id);
  }
  return touched;
}

/** Seed native lobby games only when none are active (safe for cold starts). */
export async function ensureNativeLobbyGamesIfEmpty(): Promise<boolean> {
  const active = await db.collection("games").where("status", "==", "active").limit(1).get();
  const { ensureQTechGameDocs } = await import("./qtech/games");
  await ensureQTechGameDocs();
  if (!active.empty) return false;
  logger.info("No active lobby games — seeding native Aviator games");
  await ensureNativeLobbyGames();
  return true;
}
