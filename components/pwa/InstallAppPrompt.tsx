"use client";

/**
 * PWA install experience (replaces the old native APK download prompts).
 *
 * - Registers the service worker so the site is installable.
 * - Android / Chrome: captures `beforeinstallprompt` and shows a one-tap
 *   "Install" button that opens the browser's native install dialog.
 * - iPhone / iPad: Apple has no auto-prompt, so we show clear step-by-step
 *   "Add to Home Screen" instructions with the Share icon. If the page is open
 *   inside an in-app browser (WhatsApp / Facebook / Instagram) — where iOS hides
 *   "Add to Home Screen" — we tell the user to open it in Safari first.
 * - Hides itself once installed (running standalone), on desktop, or after the
 *   user dismisses it for the session.
 */
import { useEffect, useState } from "react";
import { Download, Share, X, PlusSquare, Compass } from "lucide-react";

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

/** iOS in-app browsers (WhatsApp, Facebook, Instagram, Messenger, TikTok, Line…)
 *  can't "Add to Home Screen" — the user must reopen the page in Safari. */
function isInAppBrowser(ua: string): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Twitter|TikTok|Snapchat|Messenger/i.test(
    ua,
  );
}

export function InstallAppPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<"android" | "ios" | "other">("other");
  const [visible, setVisible] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [inApp, setInApp] = useState(false);

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
      setInApp(isInAppBrowser(ua));
      setVisible(true); // iOS never fires beforeinstallprompt — show help card
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

  const onButton = async () => {
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
            onClick={onButton}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
          >
            {platform === "ios" ? <Share size={14} /> : <Download size={14} />}
            {platform === "ios" ? "How?" : "Install"}
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
          <div className="mt-3 border-t border-white/10 pt-3">
            {inApp ? (
              // Opened from WhatsApp/Facebook etc. — Add to Home Screen is hidden here.
              <div className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">
                <p className="font-semibold">First, open this page in Safari 🧭</p>
                <p className="mt-1 text-amber-200/90">
                  You opened the link inside another app. Tap the{" "}
                  <span className="font-semibold">•••</span> or{" "}
                  <Compass size={13} className="inline align-text-bottom" /> menu and choose{" "}
                  <span className="font-semibold">“Open in Safari”</span>, then come back and tap
                  “How?” again.
                </p>
              </div>
            ) : (
              <ol className="space-y-3 text-sm text-slate-200">
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-slate-950">
                    1
                  </span>
                  <span className="flex flex-wrap items-center gap-1">
                    Tap the <span className="font-semibold">Share</span> button
                    <Share size={16} className="text-emerald-400" />
                    at the bottom of Safari.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-slate-950">
                    2
                  </span>
                  <span className="flex flex-wrap items-center gap-1">
                    Scroll down and tap{" "}
                    <span className="font-semibold">Add to Home Screen</span>
                    <PlusSquare size={16} className="text-emerald-400" />.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-slate-950">
                    3
                  </span>
                  <span>
                    Tap <span className="font-semibold">Add</span> — BETESE Aviator appears on your
                    home screen. ✈️
                  </span>
                </li>
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
