import { getApiBaseUrl } from "@/lib/env/publicConfig";
import type { QTechPlayDevice } from "@/lib/games/qtechLaunchCache";

export async function fetchDemoLaunchUrlHttp(
  gameId: string,
  device: QTechPlayDevice,
): Promise<string> {
  const base = getApiBaseUrl().replace(/\/+$/, "");
  const url = `${base}/qtcwApi/player/demo-launch?gameId=${encodeURIComponent(gameId)}&device=${encodeURIComponent(device)}`;
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { launchUrl?: string; message?: string; error?: string };
  if (!res.ok) {
    throw new Error(String(body.message || body.error || `Demo launch failed (${res.status})`));
  }
  const launchUrl = String(body.launchUrl ?? "").trim();
  if (!launchUrl) throw new Error("Demo launch did not return a game URL.");
  return launchUrl;
}
