import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getPublicFirebaseConfig } from "./env/publicConfig";

const firebaseConfig = getPublicFirebaseConfig();

export const app = getApps()[0] ?? initializeApp(firebaseConfig);
export const auth = getAuth(app);

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
