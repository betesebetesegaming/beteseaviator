/** Office-friendly player reference shown to agents and admin staff. */
export function formatPlayerId(playerNumber: number): string {
  return `BTE-${String(playerNumber).padStart(5, "0")}`;
}

export function playerDisplayId(profile: {
  playerNumber?: number | null;
  uid?: string;
}): string {
  if (profile.playerNumber && profile.playerNumber > 0) {
    return formatPlayerId(profile.playerNumber);
  }
  if (profile.uid) return `${profile.uid.slice(0, 8)}…`;
  return "—";
}
