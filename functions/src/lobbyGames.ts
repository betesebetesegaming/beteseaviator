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

/** Seed native + QTech game docs when lobby is empty or core games are missing. */
export async function ensureNativeLobbyGamesIfEmpty(): Promise<{
  seeded: boolean;
  nativeGameIds: string[];
  qtechGameIds: string[];
}> {
  const { ensureQTechGameDocs } = await import("./qtech/games");
  const qtechGameIds = await ensureQTechGameDocs();

  const aviatorSnap = await db.doc("games/aviator").get();
  const active = await db.collection("games").where("status", "==", "active").limit(1).get();

  if (aviatorSnap.exists && !active.empty) {
    return { seeded: false, nativeGameIds: [], qtechGameIds };
  }

  logger.info("Seeding native Aviator lobby games");
  const nativeGameIds = await ensureNativeLobbyGames();
  return { seeded: true, nativeGameIds, qtechGameIds };
}

/** Force-create all lobby game documents (admin / bootstrap). */
export async function seedAllLobbyGames(): Promise<{
  nativeGameIds: string[];
  qtechGameIds: string[];
}> {
  const { ensureQTechGameDocs } = await import("./qtech/games");
  const qtechGameIds = await ensureQTechGameDocs();
  const nativeGameIds = await ensureNativeLobbyGames();
  return { nativeGameIds, qtechGameIds };
}
