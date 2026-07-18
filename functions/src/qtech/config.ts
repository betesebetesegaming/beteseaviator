import { db, DEFAULT_SETTINGS } from "../helpers";

export type QTechSettings = {
  enabled: boolean;
  passKey: string;
  apiBaseUrl: string;
  operatorId: string;
  apiPassword: string;
  currency: string;
  country: string;
  lang: string;
  lobbyUrl: string;
};

let settingsCache: { at: number; value: QTechSettings; fingerprint: string } | null = null;
/** Short TTL so Firestore credential changes (even outside adminSave) pick up quickly. */
const SETTINGS_CACHE_MS = 15_000;

function settingsFingerprint(value: QTechSettings): string {
  return [
    value.enabled ? "1" : "0",
    value.apiBaseUrl,
    value.operatorId,
    value.apiPassword,
    value.passKey,
  ].join("|");
}

/** Drop cached settings after Admin credential changes (INT ↔ production). */
export function clearQTechSettingsCache(): void {
  settingsCache = null;
}

/** Optional env fallbacks — primary source is Admin → QTech & Games (Firestore). */
function env(name: string): string {
  return String(process.env[name] ?? "").trim();
}

export async function getQTechSettings(): Promise<QTechSettings> {
  if (settingsCache && Date.now() - settingsCache.at < SETTINGS_CACHE_MS) {
    return settingsCache.value;
  }

  const snap = await db.doc("settings/platform").get();
  const stored = snap.exists ? (snap.data()?.qtech as Partial<QTechSettings> | undefined) : undefined;
  const defaults = DEFAULT_SETTINGS.qtech!;

  const value: QTechSettings = {
    enabled: stored?.enabled === true,
    passKey: String(stored?.passKey || env("QT_PASS_KEY") || defaults.passKey || "").trim(),
    apiBaseUrl: String(stored?.apiBaseUrl || env("QT_API_BASE_URL") || defaults.apiBaseUrl || "")
      .trim()
      .replace(/\/+$/, ""),
    operatorId: String(stored?.operatorId || env("QT_OPERATOR_ID") || defaults.operatorId || "").trim(),
    apiPassword: String(stored?.apiPassword || env("QT_API_PASSWORD") || defaults.apiPassword || "").trim(),
    currency: String(stored?.currency || defaults.currency || "GMD").trim().toUpperCase(),
    country: String(stored?.country || defaults.country || "GM").trim().toUpperCase().slice(0, 2),
    lang: String(stored?.lang || defaults.lang || "en_GM").trim(),
    lobbyUrl: String(stored?.lobbyUrl || defaults.lobbyUrl || "https://www.beteseaviator.com/play").trim(),
  };

  const fingerprint = settingsFingerprint(value);
  // If credentials changed under us (gcloud / Admin / another instance write), drop auth+demo caches.
  if (settingsCache && settingsCache.fingerprint !== fingerprint) {
    try {
      const { clearQTechAccessTokenCache } = await import("./auth");
      const { clearDemoLaunchCache } = await import("./runtimeCache");
      clearQTechAccessTokenCache();
      clearDemoLaunchCache();
    } catch {
      /* ignore circular warm-path failures */
    }
  }

  settingsCache = { at: Date.now(), value, fingerprint };
  return value;
}
