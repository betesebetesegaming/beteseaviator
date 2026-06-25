/** Public QTech launcher CDN — works without Game List API access. */
const QTECH_CDN = "https://client.qtlauncher.com/images/";

/** Placeholders from CDN are tiny; real banners are usually >8KB. */
export const QTECH_BANNER_MIN_BYTES = 8_000;
export const QTECH_LOGO_SQUARE_MIN_BYTES = 50_000;

export type QTechLobbyImageType = "banner" | "logo-square" | "logo-round";

export function qtechImageLocale(lang?: string): string {
  const raw = String(lang ?? "en_US").trim().replace("-", "_");
  if (raw.includes("_")) return raw;
  if (raw.length === 2) return raw === "en" ? "en_US" : `${raw}_${raw.toUpperCase()}`;
  return "en_US";
}

/** Wide colorful game banner — official QTech lobby artwork. */
export function qtechCdnLobbyImage(qtechGameId: string, lang = "en_US"): string {
  const gameId = qtechGameId.trim();
  const imageKey = `${gameId}_${qtechImageLocale(lang)}`;
  const params = new URLSearchParams({
    id: imageKey,
    type: "banner",
    width: "640",
    showIcon: "true",
  });
  return `${QTECH_CDN}?${params.toString()}`;
}

/** Square logo fallback when banner is unavailable. */
export function qtechCdnLogoImage(qtechGameId: string, lang = "en_US"): string {
  const gameId = qtechGameId.trim();
  const imageKey = `${gameId}_${qtechImageLocale(lang)}`;
  const params = new URLSearchParams({
    id: imageKey,
    type: "logo-square",
    width: "640",
  });
  return `${QTECH_CDN}?${params.toString()}`;
}

export function isLikelyQTechPlaceholder(sizeBytes: number, type: QTechLobbyImageType): boolean {
  if (type === "banner") return sizeBytes < QTECH_BANNER_MIN_BYTES;
  if (type === "logo-square" || type === "logo-round") return sizeBytes < QTECH_LOGO_SQUARE_MIN_BYTES;
  return sizeBytes < QTECH_BANNER_MIN_BYTES;
}
