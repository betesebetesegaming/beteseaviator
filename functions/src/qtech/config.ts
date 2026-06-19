import { db, DEFAULT_SETTINGS } from "../helpers";

export type QTechSettings = {
  enabled: boolean;
  passKey: string;
  apiBaseUrl: string;
  operatorId: string;
  apiPassword: string;
  currency: string;
  lobbyUrl: string;
  gameLaunchPath: string;
};

/** Optional env fallbacks — primary source is Admin → QTech & Games (Firestore). */
function env(name: string): string {
  return String(process.env[name] ?? "").trim();
}

export async function getQTechSettings(): Promise<QTechSettings> {
  const snap = await db.doc("settings/platform").get();
  const stored = snap.exists ? (snap.data()?.qtech as Partial<QTechSettings> | undefined) : undefined;
  const defaults = DEFAULT_SETTINGS.qtech!;

  return {
    enabled: stored?.enabled === true,
    passKey: String(stored?.passKey || env("QT_PASS_KEY") || defaults.passKey || "").trim(),
    apiBaseUrl: String(stored?.apiBaseUrl || env("QT_API_BASE_URL") || defaults.apiBaseUrl || "")
      .trim()
      .replace(/\/+$/, ""),
    operatorId: String(stored?.operatorId || env("QT_OPERATOR_ID") || defaults.operatorId || "").trim(),
    apiPassword: String(stored?.apiPassword || env("QT_API_PASSWORD") || defaults.apiPassword || "").trim(),
    currency: String(stored?.currency || defaults.currency || "GMD").trim().toUpperCase(),
    lobbyUrl: String(stored?.lobbyUrl || defaults.lobbyUrl || "https://www.beteseaviator.com/play").trim(),
    gameLaunchPath: String(stored?.gameLaunchPath || defaults.gameLaunchPath || "/v1/games/launch").trim(),
  };
}
