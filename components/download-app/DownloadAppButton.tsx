"use client";

/**
 * Inline download button (Option 3) — placed under the login form in the auth modal.
 * Android → direct APK download. iOS → "Add to Home Screen" hint.
 * Desktop and in-app → renders nothing (nothing to install there).
 */
import toast from "react-hot-toast";
import { Download, Smartphone } from "lucide-react";
import { useAppPlatform, APP_DOWNLOAD, IOS_ADD_TO_HOME_HINT } from "./platform";

export function DownloadAppButton() {
  const platform = useAppPlatform();

  if (platform === "android") {
    return (
      <a
        href={APP_DOWNLOAD.apkUrl}
        download={APP_DOWNLOAD.fileName}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-600/15 py-2.5 text-sm font-bold text-red-200 transition-colors hover:bg-red-600/25"
      >
        <Download size={16} /> Download Android App
      </a>
    );
  }

  if (platform === "ios") {
    return (
      <button
        type="button"
        onClick={() => {
          if (APP_DOWNLOAD.iosAppStoreUrl) window.location.href = APP_DOWNLOAD.iosAppStoreUrl;
          else toast(IOS_ADD_TO_HOME_HINT, { icon: "📲", duration: 6000 });
        }}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 py-2.5 text-sm font-bold text-slate-200 transition-colors hover:bg-white/10"
      >
        <Smartphone size={16} /> Add BETESE Aviator to Home Screen
      </button>
    );
  }

  // Desktop or inside the app → nothing to install.
  return null;
}
