"use client";

/**
 * Top-of-homepage banner (Option 1).
 * Sits above the promo carousel in the lobby. Adapts to the visitor's device:
 *   • Android  → red "Download App" button (direct APK download).
 *   • iOS      → "Add to Home Screen" hint.
 *   • Desktop  → QR code to scan and install on a phone.
 *   • In-app   → renders nothing (they already have the app).
 * Dismissible; the choice is remembered in localStorage.
 */
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import toast from "react-hot-toast";
import { Plane, Download, Smartphone, X } from "lucide-react";
import {
  useAppPlatform,
  APP_DOWNLOAD,
  apkAbsoluteUrl,
  IOS_ADD_TO_HOME_HINT,
} from "./platform";

const DISMISS_KEY = "betese_app_banner_dismissed";

export function DownloadAppBanner() {
  const platform = useAppPlatform();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  // Hide inside the app, before hydration, or once dismissed.
  if (platform === "in-app" || platform === "unknown" || dismissed) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-950 via-black to-black">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 z-10 rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
      >
        <X size={16} />
      </button>

      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-600 shadow-lg shadow-red-600/30">
            <Plane size={22} className="text-white" />
          </span>
          <div>
            <p className="text-sm font-black text-white sm:text-base">BETESE Aviator App</p>
            <p className="text-[11px] text-slate-300 sm:text-xs">
              {platform === "ios"
                ? "Add to your Home Screen for full-screen play."
                : "Play faster — full screen, no browser bar."}
            </p>
          </div>
        </div>

        {/* Right-hand call to action, per platform */}
        {platform === "android" ? (
          <a
            href={APP_DOWNLOAD.apkUrl}
            download={APP_DOWNLOAD.fileName}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-lg shadow-red-600/30 transition-colors hover:bg-red-500 sm:text-sm"
          >
            <Download size={16} /> Download App
          </a>
        ) : platform === "ios" ? (
          <button
            type="button"
            onClick={() => {
              if (APP_DOWNLOAD.iosAppStoreUrl) window.location.href = APP_DOWNLOAD.iosAppStoreUrl;
              else toast(IOS_ADD_TO_HOME_HINT, { icon: "📲", duration: 6000 });
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2.5 text-xs font-bold text-white ring-1 ring-white/20 transition-colors hover:bg-white/15 sm:text-sm"
          >
            <Smartphone size={16} /> Add to Home
          </button>
        ) : (
          // Desktop → QR to install on a phone.
          <div className="flex shrink-0 items-center gap-2 pr-6">
            <p className="hidden text-right text-[11px] leading-tight text-slate-300 sm:block">
              Scan to install
              <br />
              on your Android
            </p>
            <span className="rounded-lg bg-white p-1.5">
              <QRCode value={apkAbsoluteUrl()} size={56} level="M" />
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
