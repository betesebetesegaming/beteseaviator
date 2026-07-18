/**
 * In-process demo launch URL cache + INT/production helpers.
 * Cleared together with auth/settings when Admin switches environments.
 */

type DemoCacheEntry = { url: string; expiresAt: number; apiBaseUrl: string };

const demoLaunchCache = new Map<string, DemoCacheEntry>();

export function normalizeApiBase(url: string): string {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function isIntApiBase(apiBaseUrl: string): boolean {
  return /api-int\.|int\.qtplatform|int\.qtlauncher/i.test(normalizeApiBase(apiBaseUrl));
}

export function isIntLauncherUrl(launchUrl: string): boolean {
  try {
    const host = new URL(launchUrl).hostname.toLowerCase();
    return host.includes(".int.") || host.startsWith("int.") || host.includes("-int.");
  } catch {
    return /client\.int\.|gl-int\.|ps-int\./i.test(launchUrl);
  }
}

export function qtechEnvironmentLabel(apiBaseUrl: string): "production" | "integration" {
  return isIntApiBase(apiBaseUrl) ? "integration" : "production";
}

export function demoLaunchCacheGet(key: string, apiBaseUrl: string): string | null {
  const cached = demoLaunchCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    demoLaunchCache.delete(key);
    return null;
  }
  // Never return an INT launcher URL after switching to production API.
  if (normalizeApiBase(cached.apiBaseUrl) !== normalizeApiBase(apiBaseUrl)) {
    demoLaunchCache.delete(key);
    return null;
  }
  if (isIntLauncherUrl(cached.url) && !isIntApiBase(apiBaseUrl)) {
    demoLaunchCache.delete(key);
    return null;
  }
  return cached.url;
}

export function demoLaunchCacheSet(
  key: string,
  url: string,
  apiBaseUrl: string,
  ttlMs: number,
): void {
  demoLaunchCache.set(key, {
    url,
    apiBaseUrl: normalizeApiBase(apiBaseUrl),
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearDemoLaunchCache(): void {
  demoLaunchCache.clear();
}
