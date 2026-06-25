/** QTech launcher CDN — official game artwork. */
const QTECH_CDN = "https://client.qtlauncher.com/images/";

/** Small thumbnails load ~10× faster on mobile lobby grids. */
export const LOBBY_THUMB_WIDTH = 320;

function qtechImageLocale(lang?: string): string {
  const raw = String(lang ?? "en_US").trim().replace("-", "_");
  if (raw.includes("_")) return raw;
  if (raw.length === 2) return raw === "en" ? "en_US" : `${raw}_${raw.toUpperCase()}`;
  return "en_US";
}

/** Fast colorful lobby thumbnail — banner art at mobile width. */
export function qtechCdnLobbyImage(qtechGameId: string, lang = "en_US"): string {
  const gameId = qtechGameId.trim();
  const imageKey = `${gameId}_${qtechImageLocale(lang)}`;
  const params = new URLSearchParams({
    id: imageKey,
    type: "banner",
    width: String(LOBBY_THUMB_WIDTH),
    showIcon: "true",
  });
  return `${QTECH_CDN}?${params.toString()}`;
}

/** Larger fallback when the primary thumbnail fails. */
export function qtechCdnBannerImage(qtechGameId: string, lang = "en_US"): string {
  const gameId = qtechGameId.trim();
  const imageKey = `${gameId}_${qtechImageLocale(lang)}`;
  const params = new URLSearchParams({
    id: imageKey,
    type: "logo-square",
    width: String(LOBBY_THUMB_WIDTH),
  });
  return `${QTECH_CDN}?${params.toString()}`;
}

/** Normalize stored URLs to fast lobby thumbnails. */
export function upgradeQTechLobbyImageUrl(url: string, qtechGameId?: string): string {
  const id = String(qtechGameId ?? "").trim();
  if (id) return qtechCdnLobbyImage(id);

  const u = url.trim();
  if (!u.includes("client.qtlauncher.com")) return u;
  try {
    const parsed = new URL(u);
    parsed.searchParams.set("type", "banner");
    parsed.searchParams.set("showIcon", "true");
    parsed.searchParams.set("width", String(LOBBY_THUMB_WIDTH));
    return parsed.toString();
  } catch {
    return u;
  }
}
