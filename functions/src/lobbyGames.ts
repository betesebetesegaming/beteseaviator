import { logger } from "firebase-functions/v2";
import { db } from "./helpers";
import { REMOVED_LOBBY_GAME_IDS } from "./gameCatalog";

/** Pin football + crash titles at the top of the player lobby. */
const FEATURED_FOOTBALL_CRASH_IDS = [
  "qt-spb-aviator",
  "qt-gzx-pilotcup",
  "qt-tad-crashgoal",
  "qt-sms-footballx",
  "qt-sms-worldchampionx",
  "qt-sms-jetx",
  "qt-blc-crash",
  "qt-spb-balloon",
  "qt-sms-balloonx",
  "qt-sms-propelx",
  "qt-sms-cricketx",
  "qt-iog-chickenroad",
];

/** Ensure football/crash picks appear in Top picks (prepend if missing). */
export async function ensureFeaturedFootballCrashGames(): Promise<string[]> {
  const ref = db.doc("settings/lobbyLayout");
  const snap = await ref.get();
  const data = snap.data() ?? {};
  const existing = Array.isArray(data.featuredGameIds)
    ? (data.featuredGameIds as string[]).map(String).filter(Boolean)
    : [];
  const featured = existing.filter((id) => !REMOVED_LOBBY_GAME_IDS.includes(id));
  for (let i = FEATURED_FOOTBALL_CRASH_IDS.length - 1; i >= 0; i -= 1) {
    const id = FEATURED_FOOTBALL_CRASH_IDS[i];
    const at = featured.indexOf(id);
    if (at === -1) featured.unshift(id);
    else if (at > 0) {
      featured.splice(at, 1);
      featured.unshift(id);
    }
  }
  const changed =
    featured.length !== existing.length ||
    featured.some((id, index) => existing[index] !== id);
  if (changed) {
    await ref.set(
      {
        featuredGameIds: featured,
        sortMode: data.sortMode === "manual" ? "manual" : "best_selling",
        manualOrder: Array.isArray(data.manualOrder) ? data.manualOrder : [],
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    logger.info("Pinned football/crash games to lobby top picks", { featured });
  }
  return featured;
}

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
  await ensureFeaturedFootballCrashGames();
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
