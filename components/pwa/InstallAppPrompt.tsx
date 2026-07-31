"use client";

/**
 * PWA install experience (replaces the old native APK download prompts).
 *
 * - Registers the service worker so the site is installable.
 * - Android / Chrome: captures `beforeinstallprompt` and shows an "Install app"
 *   button that opens the browser's native install dialog.
 * - iPhone / iPad (Safari): can't auto-prompt, so we show short "Add to Home
 *   Screen" instructions instead.
 * - Hides itself once the app is installed (running standalone), on desktop, or
 *   after the user dismisses it for the session.
 */
import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "betese_pwa_prompt_dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes this legacy flag when launched from the home screen.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function InstallAppPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<"android" | "ios" | "other">("other");
  const [visible, setVisible] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  // Register the service worker (site-wide once this mounts).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        /* install prompt still works via manifest even if SW registration fails */
      });
  }, []);

  useEffect(() => {
    if (isStandalone()) return; // already installed — nothing to show
    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;

    const ua = navigator.userAgent || "";
    // Never nag inside the legacy native wrapper (old APK installs still out there).
    if (/BeteseAviatorApp/i.test(ua)) return;

    const isIOS =
      /iphone|ipad|ipod/i.test(ua) ||
      (/macintosh/i.test(ua) && typeof document !== "undefined" && "ontouchend" in document);
    const isAndroid = /android/i.test(ua);

    if (isIOS) {
      setPlatform("ios");
      setVisible(true); // iOS never fires beforeinstallprompt — show help pill
    } else if (isAndroid) {
      setPlatform("android");
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const onInstalled = () => setVisible(false);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  const install = async () => {
    if (platform === "ios") {
      setShowIosHelp((v) => !v);
      return;
    }
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
    setVisible(false);
  };

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md sm:left-auto sm:right-4 sm:mx-0">
      <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/95 p-3 shadow-xl backdrop-blur">
        <div className="flex items-center gap-3">
          <img src="/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">Install BETESE Aviator</p>
            <p className="truncate text-xs text-slate-400">
              Full screen, no browser bar — right on your home screen.
            </p>
          </div>
          <button
            onClick={install}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
          >
            {platform === "ios" ? <Share size={14} /> : <Download size={14} />}
            Install
          </button>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="rounded-md p-1 text-slate-500 hover:text-slate-300"
          >
            <X size={16} />
          </button>
        </div>

        {platform === "ios" && showIosHelp && (
          <p className="mt-2 border-t border-white/10 pt-2 text-xs text-slate-300">
            In Safari: tap the <span className="font-semibold">Share</span> icon{" "}
            <Share size={12} className="inline align-text-bottom" />, then{" "}
            <span className="font-semibold">“Add to Home Screen.”</span>
          </p>
        )}
      </div>
    </div>
  );
}
