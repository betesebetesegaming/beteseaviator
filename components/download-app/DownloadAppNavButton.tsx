"use client";

/**
 * "Get App" pill for the lobby category bar (sits after Instant Win).
 * A high-visibility, always-there download entry point.
 *   • Android → downloads the APK.
 *   • iOS     → "Add to Home Screen" hint.
 *   • Desktop / in-app → hidden (desktop uses the banner QR; the app needs no prompt).
 */
import toast from "react-hot-toast";
import { Download, Smartphone } from "lucide-react";
import { useAppPlatform, APP_DOWNLOAD, IOS_ADD_TO_HOME_HINT } from "./platform";

const PILL =
  "flex shrink-0 items-center gap-2 rounded-full bg-red-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-red-600/30 transition-colors hover:bg-red-500 sm:px-4 sm:text-sm";

export function DownloadAppNavButton() {
  const platform = useAppPlatform();

  if (platform === "android") {
    return (
      <a href={APP_DOWNLOAD.apkUrl} download={APP_DOWNLOAD.fileName} className={PILL}>
        <Download size={16} strokeWidth={2} />
        <span>Get App</span>
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
        className={PILL}
      >
        <Smartphone size={16} strokeWidth={2} />
        <span>Get App</span>
      </button>
    );
  }

  if (platform === "desktop") {
    // Can't install an APK on a computer — point them to their phone.
    return (
      <button
        type="button"
        onClick={() =>
          toast("Open beteseaviator.com on your Android phone, or scan the QR at the top of the page to install the app.", {
            icon: "📱",
            duration: 6000,
          })
        }
        className={PILL}
      >
        <Download size={16} strokeWidth={2} />
        <span>Get App</span>
      </button>
    );
  }

  // Inside the app (or before hydration) → nothing here.
  return null;
}
