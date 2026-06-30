import { db, FieldValue } from "./helpers";

/** Game doc ids the admin removed — never re-seeded by Restore lobby games. */
export async function getExcludedLobbyGameIds(): Promise<Set<string>> {
  const snap = await db.doc("settings/platform").get();
  const raw = snap.data()?.excludedLobbyGameIds;
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.map((id) => String(id).trim()).filter(Boolean));
}

export async function excludeLobbyGameId(gameId: string): Promise<void> {
  const id = gameId.trim();
  if (!id) return;
  await db.doc("settings/platform").set(
    { excludedLobbyGameIds: FieldValue.arrayUnion(id) },
    { merge: true }
  );
}

/** Drop a game from top-picks / manual order after delete or hide. */
export async function removeGameFromLobbyLayout(gameId: string): Promise<void> {
  const ref = db.doc("settings/lobbyLayout");
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() ?? {};
  const featured = ((data.featuredGameIds as string[] | undefined) ?? []).filter((id) => id !== gameId);
  const manual = ((data.manualOrder as string[] | undefined) ?? []).filter((id) => id !== gameId);
  const prevFeatured = (data.featuredGameIds as string[] | undefined) ?? [];
  const prevManual = (data.manualOrder as string[] | undefined) ?? [];
  if (featured.length === prevFeatured.length && manual.length === prevManual.length) return;
  await ref.set({ featuredGameIds: featured, manualOrder: manual }, { merge: true });
}
