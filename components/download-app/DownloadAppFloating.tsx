"use client";

/**
 * Floating download button (Option 2).
 * Stays fixed at the bottom-right while the user scrolls the lobby.
 * Shows only on Android and iOS phone browsers (desktop uses the banner QR).
 * Hidden inside the app and after the user dismisses it (remembered per browser).
 */
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Download, Smartphone, X } from "lucide-react";
import { useAppPlatform, APP_DOWNLOAD, IOS_ADD_TO_HOME_HINT } from "./platform";

const DISMISS_KEY = "betese_app_float_dismissed";

export function DownloadAppFloating() {
  const platform = useAppPlatform();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  // Phones only; hidden in-app / desktop / before hydration / once dismissed.
  if (platform !== "android" && platform !== "ios") return null;
  if (dismissed) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  const label = platform === "android" ? "Get the App" : "Add to Home";

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center">
      {platform === "android" ? (
        <a
          href={APP_DOWNLOAD.apkUrl}
          download={APP_DOWNLOAD.fileName}
          className="flex items-center gap-2 rounded-full bg-red-600 py-3 pl-4 pr-5 text-sm font-bold text-white shadow-xl shadow-red-600/40 transition-transform active:scale-95"
        >
          <Download size={18} /> {label}
        </a>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (APP_DOWNLOAD.iosAppStoreUrl) window.location.href = APP_DOWNLOAD.iosAppStoreUrl;
            else toast(IOS_ADD_TO_HOME_HINT, { icon: "📲", duration: 6000 });
          }}
          className="flex items-center gap-2 rounded-full bg-red-600 py-3 pl-4 pr-5 text-sm font-bold text-white shadow-xl shadow-red-600/40 transition-transform active:scale-95"
        >
          <Smartphone size={18} /> {label}
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hide"
        className="-ml-2 -mt-6 rounded-full border border-white/20 bg-slate-900 p-1 text-white/70 shadow hover:text-white"
      >
        <X size={12} />
      </button>
    </div>
  );
}
