import type { MetadataRoute } from "next";

/**
 * Web App Manifest — makes BETESE Aviator installable as a PWA.
 *
 * `display: standalone` is what gives the "full screen, no browser bar" feel the
 * old APK promised. Once installed (Android: "Install app" / iOS: Share → Add to
 * Home Screen) the site opens in its own window with no address bar.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BETESE Aviator",
    short_name: "BETESE",
    description:
      "BETESE Aviator — crash game platform. Deposit with mobile money, bet, cash out before the crash.",
    id: "/",
    start_url: "/play",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0b0b",
    theme_color: "#0b0b0b",
    categories: ["games", "entertainment"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
