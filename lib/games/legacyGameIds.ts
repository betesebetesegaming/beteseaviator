/** Old native / early-QTech lobby ids → current QTech lobby docs. */
export const LEGACY_GAME_ID_ALIASES: Record<string, string> = {
  aviator: "qt-spb-aviator",
  "aviator-turbo": "qt-spb-aviator",
  "qtech-aviator": "qt-spb-aviator",
  crash: "qt-spb-aviator",
  "crash-turbo": "qt-spb-aviator",
  "qtech-crash": "qt-spb-aviator",
};

export function resolveLobbyGameId(gameId: string): string {
  const id = gameId.trim();
  return LEGACY_GAME_ID_ALIASES[id] ?? id;
}
