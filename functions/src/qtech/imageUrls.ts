/** Public QTech launcher CDN — works without Game List API access. */
const QTECH_CDN = "https://client.qtlauncher.com/images/";

export type QTechLobbyImageType = "logo-square" | "banner" | "logo-round";

export function qtechImageLocale(lang?: string): string {
  const raw = String(lang ?? "en_US").trim().replace("-", "_");
  if (raw.includes("_")) return raw;
  if (raw.length === 2) return raw === "en" ? "en_US" : `${raw}_${raw.toUpperCase()}`;
  return "en_US";
}

/** Colorful square game artwork — preferred for lobby cards. */
export function qtechCdnLobbyImage(
  qtechGameId: string,
  lang = "en_US",
  type: QTechLobbyImageType = "logo-square",
): string {
  const gameId = qtechGameId.trim();
  const imageKey = `${gameId}_${qtechImageLocale(lang)}`;
  const params = new URLSearchParams({
    id: imageKey,
    type,
    width: "640",
  });
  return `${QTECH_CDN}?${params.toString()}`;
}

/** Wide marketing banner (fallback). */
export function qtechCdnBannerImage(qtechGameId: string, lang = "en_US"): string {
  return qtechCdnLobbyImage(qtechGameId, lang, "banner");
}
