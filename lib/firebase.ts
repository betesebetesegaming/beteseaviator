import { getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  initializeAuth,
} from "firebase/auth";
import { getPublicFirebaseConfig } from "./env/publicConfig";

const firebaseConfig = getPublicFirebaseConfig();

export const app = getApps()[0] ?? initializeApp(firebaseConfig);

/** Explicit local persistence — keeps sign-in on beteseaviator.com (custom domain). */
export const auth =
  typeof window === "undefined"
    ? getAuth(app)
    : (() => {
        try {
          return initializeAuth(app, {
            persistence: browserLocalPersistence,
            // getAuth() bundles this automatically; initializeAuth does NOT —
            // without it signInWithPopup/Redirect throw auth/argument-error.
            popupRedirectResolver: browserPopupRedirectResolver,
          });
        } catch {
          return getAuth(app);
        }
      })();

/** Analytics only works in the browser; load lazily and ignore failures (ad blockers etc.). */
export async function initAnalytics() {
  if (typeof window === "undefined") return null;
  try {
    const { getAnalytics, isSupported } = await import("firebase/analytics");
    if (await isSupported()) return getAnalytics(app);
  } catch {
    // analytics is non-essential
  }
  return null;
}
