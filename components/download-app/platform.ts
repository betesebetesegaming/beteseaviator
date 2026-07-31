"use client";

/**
 * Device / environment detection for the "Download the app" prompts.
 *
 * The same website is shown in three places:
 *   1. A normal mobile/desktop browser  → offer the app download.
 *   2. Inside the BETESE Aviator Android app (Capacitor WebView) — its user-agent
 *      is tagged "BeteseAviatorApp".                     → never show a download prompt.
 *   3. Inside the BETESE Aviator iOS app (Capacitor)     → never show a download prompt.
 *
 * Keeping this in one place means every prompt (banner, floating button, login
 * button) makes the same decision.
 */
import { useEffect, useState } from "react";

/** Where the release APK lives on the web server (drop the file at public/downloads/). */
export const APP_DOWNLOAD = {
  apkUrl: "/downloads/BeteseAviator.apk",
  apkVersion: "1.0.2",
  fileName: "BeteseAviator.apk",
  /** Set this once the iOS app is published; until then iOS users get "Add to Home Screen". */
  iosAppStoreUrl: null as string | null,
  /** Fallback origin for building absolute links (QR codes) during SSR. */
  siteOrigin: "https://www.beteseaviator.com",
};

export type AppPlatform = "android" | "ios" | "desktop" | "in-app" | "unknown";

/** Detect the platform. Returns "unknown" on the server / before hydration. */
export function detectPlatform(): AppPlatform {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "unknown";

  const ua = navigator.userAgent || "";
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;

  // Already running inside one of our native apps → no download prompt.
  if (/BeteseAviatorApp/i.test(ua) || cap?.isNativePlatform?.()) return "in-app";

  if (/android/i.test(ua)) return "android";

  // iPhone/iPad (iPadOS 13+ masquerades as "Macintosh" but reports touch).
  const isIOS =
    /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && typeof document !== "undefined" && "ontouchend" in document);
  if (isIOS) return "ios";

  return "desktop";
}

/** React hook: resolves to the real platform after mount (avoids hydration mismatch). */
export function useAppPlatform(): AppPlatform {
  const [platform, setPlatform] = useState<AppPlatform>("unknown");
  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);
  return platform;
}

/** Absolute URL to the APK — used for QR codes so a phone can open it directly. */
export function apkAbsoluteUrl(): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : APP_DOWNLOAD.siteOrigin;
  return origin + APP_DOWNLOAD.apkUrl;
}

/** Short instruction toast for iOS users (they can't install an APK). */
export const IOS_ADD_TO_HOME_HINT =
  "In Safari: tap the Share icon, then 'Add to Home Screen' to install BETESE Aviator.";
