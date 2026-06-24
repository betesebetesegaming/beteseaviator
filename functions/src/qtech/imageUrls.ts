/** Public QTech launcher CDN — works without Game List API access. */
const QTECH_CDN = "https://client.qtlauncher.com/images/";

export function qtechImageLocale(lang?: string): string {
  const raw = String(lang ?? "en_US").trim().replace("-", "_");
  if (raw.includes("_")) return raw;
  if (raw.length === 2) return raw === "en" ? "en_US" : `${raw}_${raw.toUpperCase()}`;
  return "en_US";
}

/** Banner image for lobby cards (4:3 crop via object-cover). */
export function qtechCdnLobbyImage(qtechGameId: string, lang = "en_US"): string {
  const gameId = qtechGameId.trim();
  const imageKey = `${gameId}_${qtechImageLocale(lang)}`;
  const params = new URLSearchParams({
    id: imageKey,
    type: "banner",
    width: "640",
  });
  return `${QTECH_CDN}?${params.toString()}`;
}
