import type { Game } from "@/lib/types";

/** Only crash-style games (Aviator, Aviator Turbo, …) appear in the lobby. */
export function isLobbyGame(game: Pick<Game, "type">): boolean {
  return game.type === "crash";
}

export function filterLobbyGames(games: Game[]): Game[] {
  return games.filter(isLobbyGame);
}
