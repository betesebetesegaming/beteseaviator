import type { Game } from "@/lib/types";

/** Crash-style native games plus any QTech / categorised game appear in the lobby. */
export function isLobbyGame(game: Pick<Game, "type" | "engine" | "lobbyCategory">): boolean {
  return game.type === "crash" || game.engine === "qtech" || Boolean(game.lobbyCategory);
}

export function filterLobbyGames(games: Game[]): Game[] {
  return games.filter(isLobbyGame);
}
