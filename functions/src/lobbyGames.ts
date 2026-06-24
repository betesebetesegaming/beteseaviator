import { logger } from "firebase-functions/v2";
import { db } from "./helpers";
import { REMOVED_LOBBY_GAME_IDS } from "./gameCatalog";

/** Delete legacy native / placeholder game docs from Firestore. Safe to run often. */
export async function purgeLegacyLobbyGames(): Promise<string[]> {
  const removed: string[] = [];
  for (const id of REMOVED_LOBBY_GAME_IDS) {
    const ref = db.doc(`games/${id}`);
    if ((await ref.get()).exists) {
      await ref.delete();
      removed.push(id);
      logger.info("Purged legacy lobby game", { id });
    }
  }
  return removed;
}

/** Seeds QTech lobby docs when the catalog was never initialized. */
export async function ensureLobbyGamesIfEmpty(): Promise<{
  seeded: boolean;
  qtechGameIds: string[];
  removedGameIds: string[];
}> {
  const removedGameIds = await purgeLegacyLobbyGames();
  const { ensureQTechGameDocs } = await import("./qtech/games");
  const qtechGameIds = await ensureQTechGameDocs();

  const firstQtechSnap = await db.doc(`games/${qtechGameIds[0] ?? "qt-spb-aviator"}`).get();
  const wasEmpty = !firstQtechSnap.exists;

  if (wasEmpty) {
    logger.info("Seeding QTech lobby games");
  }

  return { seeded: wasEmpty, qtechGameIds, removedGameIds };
}

/** Force-refresh QTech game docs and purge legacy placeholders (admin / bootstrap). */
export async function seedAllLobbyGames(): Promise<{
  qtechGameIds: string[];
  removedGameIds: string[];
  total: number;
  imageSync?: { updated: string[]; skipped: string[]; missing: string[] };
}> {
  const removedGameIds = await purgeLegacyLobbyGames();
  const { ensureQTechGameDocs } = await import("./qtech/games");
  const qtechGameIds = await ensureQTechGameDocs();
  let imageSync: { updated: string[]; skipped: string[]; missing: string[] } | undefined;
  try {
    const { syncQTechLobbyImages } = await import("./qtech/gameList");
    imageSync = await syncQTechLobbyImages();
  } catch (e) {
    logger.warn("QTech thumbnail sync skipped during lobby seed", e);
  }
  return {
    qtechGameIds,
    removedGameIds,
    total: qtechGameIds.length,
    imageSync,
  };
}

/** @deprecated Use ensureLobbyGamesIfEmpty */
export async function ensureNativeLobbyGamesIfEmpty(): Promise<{
  seeded: boolean;
  nativeGameIds: string[];
  qtechGameIds: string[];
}> {
  const result = await ensureLobbyGamesIfEmpty();
  return { seeded: result.seeded, nativeGameIds: [], qtechGameIds: result.qtechGameIds };
}
