/** A player counts as live if a heartbeat arrived within this window. */
export const PRESENCE_ONLINE_MS = 10 * 60 * 1000;

/** How often the play app writes presence/{uid}. */
export const PRESENCE_HEARTBEAT_MS = 25_000;

export type PresenceRow = {
  uid: string;
  name: string;
  role: string;
  page: string;
  lastSeen: number;
  online: boolean;
};

export function isPresenceOnline(lastSeen: number, now = Date.now()): boolean {
  if (!Number.isFinite(lastSeen) || lastSeen <= 0) return false;
  return now - lastSeen <= PRESENCE_ONLINE_MS;
}

export function presenceAgo(lastSeen: number, now = Date.now()): string {
  const sec = Math.max(0, Math.round((now - lastSeen) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  return `${hr}h ago`;
}

export function parsePresenceTree(
  val: Record<string, { lastSeen?: unknown; name?: unknown; role?: unknown; page?: unknown }> | null,
  now = Date.now(),
): PresenceRow[] {
  if (!val) return [];
  const rows: PresenceRow[] = [];
  for (const [uid, data] of Object.entries(val)) {
    const lastSeen = Number(data?.lastSeen ?? 0);
    rows.push({
      uid,
      name: String(data?.name ?? "Unknown"),
      role: String(data?.role ?? "player"),
      page: String(data?.page ?? "/"),
      lastSeen,
      online: isPresenceOnline(lastSeen, now),
    });
  }
  rows.sort((a, b) => b.lastSeen - a.lastSeen);
  return rows;
}
