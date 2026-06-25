/** QTech launcher CDN — colorful square game art (official provider artwork). */
const QTECH_CDN = "https://client.qtlauncher.com/images/";

function qtechImageLocale(lang?: string): string {
  const raw = String(lang ?? "en_US").trim().replace("-", "_");
  if (raw.includes("_")) return raw;
  if (raw.length === 2) return raw === "en" ? "en_US" : `${raw}_${raw.toUpperCase()}`;
  return "en_US";
}

export type QTechLobbyImageType = "logo-square" | "banner" | "logo-round";

/** Full-color square artwork — best for lobby cards. */
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

/** Upgrade old banner CDN links to colorful square artwork. */
export function upgradeQTechLobbyImageUrl(url: string): string {
  const u = url.trim();
  if (!u.includes("client.qtlauncher.com")) return u;
  try {
    const parsed = new URL(u);
    const current = parsed.searchParams.get("type") ?? "";
    if (current === "logo-square" || current === "logo-round") return u;
    parsed.searchParams.set("type", "logo-square");
    if (!parsed.searchParams.has("width")) parsed.searchParams.set("width", "640");
    return parsed.toString();
  } catch {
    return u.replace(/type=banner\b/i, "type=logo-square");
  }
}
