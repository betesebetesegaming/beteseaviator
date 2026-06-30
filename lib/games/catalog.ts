import type { Game } from "@/lib/types";
import { isAllowedLobbyGame } from "@/lib/lobbyGamePolicy";

/** Player lobby: active QTech games with a real catalog game ID only. */
export function isPlayerLobbyGame(
  game: Pick<Game, "engine" | "status" | "qtechGameId" | "name" | "id">,
): boolean {
  if (game.engine !== "qtech" || game.status !== "active") return false;
  if (!String(game.qtechGameId ?? "").trim()) return false;
  return isAllowedLobbyGame({
    qtechGameId: game.qtechGameId,
    name: game.name,
    id: game.id,
  });
}

/** Admin dashboard + promos: QTech catalog games only. */
export function isLobbyGame(game: Pick<Game, "engine" | "qtechGameId">): boolean {
  return game.engine === "qtech" && String(game.qtechGameId ?? "").trim().length > 0;
}

export function filterPlayerLobbyGames(games: Game[]): Game[] {
  return games.filter(isPlayerLobbyGame);
}

export function filterLobbyGames(games: Game[]): Game[] {
  return games.filter(isLobbyGame);
}
