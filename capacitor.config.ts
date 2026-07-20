import type { CapacitorConfig } from "@capacitor/cli";

/**
 * BETESE Aviator iOS shell — loads the live website so UI matches Safari exactly.
 * Compile/sign on a Mac with Xcode (`npx cap open ios`).
 */
const config: CapacitorConfig = {
  appId: "com.betese.aviator",
  appName: "BETESE Aviator",
  webDir: "www",
  server: {
    url: "https://www.beteseaviator.com/play",
    cleartext: false,
    // Keep deposits / games / auth inside the WebView (same hosts Safari uses).
    allowNavigation: [
      "beteseaviator.com",
      "*.beteseaviator.com",
      "api.modempay.com",
      "*.modempay.com",
      "checkout.modempay.com",
      "pay.modempay.com",
      "pay.wave.com",
      "*.wave.com",
      "client.qtlauncher.com",
      "*.qtlauncher.com",
      "*.qtplatform.com",
      "gl.qtplatform.com",
      "ps.qtplatform.com",
      "api.qtplatform.com",
      "*.googleapis.com",
      "*.firebaseapp.com",
      "*.firebaseio.com",
      "*.cloudfunctions.net",
      "accounts.google.com",
    ],
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#0b0b0b",
    scheme: "BETESE Aviator",
    limitsNavigationsToAppBoundDomains: false,
    preferredContentMode: "mobile",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      backgroundColor: "#0b0b0b",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
      iosSpinnerStyle: "small",
      spinnerColor: "#ffffff",
    },
  },
};

export default config;
