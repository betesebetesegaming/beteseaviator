import type { Game } from "@/lib/types";

/** Map game type → play route (extend when adding slots etc.). */
export function gamePlayPath(game: Pick<Game, "id" | "type">): string {
  return `/play/game/${game.id}`;
}

export function gameDemoPath(game: Pick<Game, "id" | "type">): string {
  return `/play/game/${game.id}?mode=demo`;
}
