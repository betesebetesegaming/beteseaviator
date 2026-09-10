import { createdAtIso } from "@/lib/format";
import { agentIdsForPlayer } from "@/lib/platformFinancials";
import type { UserProfile } from "@/lib/types";

/** Customers who joined a marketer's link in a date window (inclusive YYYY-MM-DD). */
export function openedViaLinkInRange(
  players: UserProfile[] | null | undefined,
  agentId: string | undefined,
  from: string,
  to: string
): UserProfile[] {
  if (!players?.length || !agentId || !from || !to) return [];
  return players
    .filter((p) => {
      if (!agentIdsForPlayer(p).includes(agentId)) return false;
      const iso = createdAtIso(p.createdAt);
      return Boolean(iso) && iso >= from && iso <= to;
    })
    .sort((a, b) => createdAtIso(b.createdAt).localeCompare(createdAtIso(a.createdAt)));
}

/** September (or any month) account opens per marketer from live player docs. */
export function openedViaLinkByAgent(
  players: UserProfile[] | null | undefined,
  from: string,
  to: string
): Map<string, number> {
  const map = new Map<string, number>();
  if (!players?.length || !from || !to) return map;
  for (const p of players) {
    const iso = createdAtIso(p.createdAt);
    if (!iso || iso < from || iso > to) continue;
    for (const agentId of agentIdsForPlayer(p)) {
      map.set(agentId, (map.get(agentId) ?? 0) + 1);
    }
  }
  return map;
}
