/** Public QTech launcher CDN — works without Game List API access. */
const QTECH_CDN = "https://client.qtlauncher.com/images/";

export const LOBBY_THUMB_WIDTH = 320;
export const QTECH_BANNER_MIN_BYTES = 4_000;
export const QTECH_LOGO_SQUARE_MIN_BYTES = 30_000;

export type QTechLobbyImageType = "banner" | "logo-square" | "logo-round";

export function qtechImageLocale(lang?: string): string {
  const raw = String(lang ?? "en_US").trim().replace("-", "_");
  if (raw.includes("_")) return raw;
  if (raw.length === 2) return raw === "en" ? "en_US" : `${raw}_${raw.toUpperCase()}`;
  return "en_US";
}

/** Fast colorful lobby banner thumbnail. */
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

/** Square artwork fallback. */
export function qtechCdnLogoImage(qtechGameId: string, lang = "en_US"): string {
  const gameId = qtechGameId.trim();
  const imageKey = `${gameId}_${qtechImageLocale(lang)}`;
  const params = new URLSearchParams({
    id: imageKey,
    type: "logo-square",
    width: String(LOBBY_THUMB_WIDTH),
  });
  return `${QTECH_CDN}?${params.toString()}`;
}

export function isLikelyQTechPlaceholder(sizeBytes: number, type: QTechLobbyImageType): boolean {
  if (type === "banner") return sizeBytes < QTECH_BANNER_MIN_BYTES;
  if (type === "logo-square" || type === "logo-round") return sizeBytes < QTECH_LOGO_SQUARE_MIN_BYTES;
  return sizeBytes < QTECH_BANNER_MIN_BYTES;
}
