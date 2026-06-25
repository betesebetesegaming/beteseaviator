/** QTech launcher CDN — official game artwork. */
const QTECH_CDN = "https://client.qtlauncher.com/images/";

function qtechImageLocale(lang?: string): string {
  const raw = String(lang ?? "en_US").trim().replace("-", "_");
  if (raw.includes("_")) return raw;
  if (raw.length === 2) return raw === "en" ? "en_US" : `${raw}_${raw.toUpperCase()}`;
  return "en_US";
}

/** Full-color square character artwork for portrait lobby cards. */
export function qtechCdnLobbyImage(qtechGameId: string, lang = "en_US"): string {
  const gameId = qtechGameId.trim();
  const imageKey = `${gameId}_${qtechImageLocale(lang)}`;
  const params = new URLSearchParams({
    id: imageKey,
    type: "logo-square",
    width: "640",
  });
  return `${QTECH_CDN}?${params.toString()}`;
}

/** Wide banner fallback. */
export function qtechCdnBannerImage(qtechGameId: string, lang = "en_US"): string {
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

/** Normalize any QTech CDN URL to portrait lobby artwork. */
export function upgradeQTechLobbyImageUrl(url: string, qtechGameId?: string): string {
  const id = String(qtechGameId ?? "").trim();
  if (id) return qtechCdnLobbyImage(id);

  const u = url.trim();
  if (!u.includes("client.qtlauncher.com")) return u;
  try {
    const parsed = new URL(u);
    parsed.searchParams.set("type", "logo-square");
    parsed.searchParams.set("width", "640");
    parsed.searchParams.delete("showIcon");
    parsed.searchParams.delete("theme");
    return parsed.toString();
  } catch {
    return u;
  }
}
