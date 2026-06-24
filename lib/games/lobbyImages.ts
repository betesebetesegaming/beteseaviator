import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/storage";

/** Static fallbacks when no custom upload is set in Firestore. */
export const DEFAULT_LOBBY_GAME_IMAGES: Record<string, string> = {};

export function gameLobbyImageUrl(game: { id: string; imageUrl?: string }): string | undefined {
  const custom = game.imageUrl?.trim();
  if (custom) return custom;
  return DEFAULT_LOBBY_GAME_IMAGES[game.id];
}

export async function uploadGameLobbyImage(gameId: string, file: File): Promise<string> {
  const safeId = gameId.replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 48);
  if (!safeId) throw new Error("Invalid game id.");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `games/${safeId}/cover.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || "image/jpeg" });
  return getDownloadURL(storageRef);
}
