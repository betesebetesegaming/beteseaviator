/**
 * Public (browser-safe) environment variables.
 *
 * Firebase web config is not secret — defaults match beteseaviator-a05ae so
 * Vercel builds work even before env vars are added. Override via
 * NEXT_PUBLIC_* in Vercel or .env.local when needed.
 *
 * We also inject vars at runtime via app/layout.tsx (window.__BETESE_ENV__)
 * so production picks up env changes without a full client rebuild when possible.
 */

export type PublicClientEnv = {
  NEXT_PUBLIC_FIREBASE_API_KEY: string;
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: string;
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: string;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: string;
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: string;
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: string;
  NEXT_PUBLIC_FIREBASE_APP_ID: string;
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?: string;
  NEXT_PUBLIC_API_BASE_URL?: string;
  NEXT_PUBLIC_SIGNUP_OTP_ENABLED?: string;
  NEXT_PUBLIC_SIGNUP_OTP_GATEWAY_OK?: string;
};

declare global {
  interface Window {
    __BETESE_ENV__?: Partial<PublicClientEnv>;
  }
}

/** Default Firebase web app config for beteseaviator-a05ae (public, not secret). */
export const DEFAULT_PUBLIC_ENV: PublicClientEnv = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "AIzaSyCfG9tVqFxcqmOvsR9jI_cyJXi4LLPgFyA",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "beteseaviator-a05ae.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: "https://beteseaviator-a05ae-default-rtdb.firebaseio.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "beteseaviator-a05ae",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "beteseaviator-a05ae.firebasestorage.app",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "866081872707",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:866081872707:web:54248cbdef8d405f106df6",
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: "G-R5PH4J1K6S",
  NEXT_PUBLIC_API_BASE_URL:
    "https://us-central1-beteseaviator-a05ae.cloudfunctions.net",
};

const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_DATABASE_URL",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_SIGNUP_OTP_ENABLED",
  "NEXT_PUBLIC_SIGNUP_OTP_GATEWAY_OK",
] as const;

function readPublicEnv(name: (typeof PUBLIC_ENV_KEYS)[number]): string {
  if (typeof window !== "undefined") {
    const fromWindow = window.__BETESE_ENV__?.[name as keyof PublicClientEnv];
    if (fromWindow && String(fromWindow).trim()) {
      return String(fromWindow).trim();
    }
  }
  const fromProcess = String(process.env[name] || "").trim();
  if (fromProcess) return fromProcess;
  const fallback = DEFAULT_PUBLIC_ENV[name as keyof PublicClientEnv];
  return fallback ? String(fallback).trim() : "";
}

/** Build the env object injected by the server layout into the HTML page. */
export function getPublicEnvForInjection(): PublicClientEnv {
  return {
    NEXT_PUBLIC_FIREBASE_API_KEY:
      readPublicEnv("NEXT_PUBLIC_FIREBASE_API_KEY") ||
      DEFAULT_PUBLIC_ENV.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
      readPublicEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN") ||
      DEFAULT_PUBLIC_ENV.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_DATABASE_URL:
      readPublicEnv("NEXT_PUBLIC_FIREBASE_DATABASE_URL") ||
      DEFAULT_PUBLIC_ENV.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      readPublicEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID") ||
      DEFAULT_PUBLIC_ENV.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
      readPublicEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET") ||
      DEFAULT_PUBLIC_ENV.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
      readPublicEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID") ||
      DEFAULT_PUBLIC_ENV.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID:
      readPublicEnv("NEXT_PUBLIC_FIREBASE_APP_ID") ||
      DEFAULT_PUBLIC_ENV.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:
      readPublicEnv("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID") ||
      DEFAULT_PUBLIC_ENV.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    NEXT_PUBLIC_API_BASE_URL:
      readPublicEnv("NEXT_PUBLIC_API_BASE_URL") ||
      DEFAULT_PUBLIC_ENV.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_SIGNUP_OTP_ENABLED: readPublicEnv("NEXT_PUBLIC_SIGNUP_OTP_ENABLED") || undefined,
    NEXT_PUBLIC_SIGNUP_OTP_GATEWAY_OK:
      readPublicEnv("NEXT_PUBLIC_SIGNUP_OTP_GATEWAY_OK") || undefined,
  };
}

export function getPublicFirebaseConfig() {
  return {
    apiKey: readPublicEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: readPublicEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    databaseURL: readPublicEnv("NEXT_PUBLIC_FIREBASE_DATABASE_URL"),
    projectId: readPublicEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: readPublicEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: readPublicEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    appId: readPublicEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
    measurementId: readPublicEnv("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID") || undefined,
  };
}

/** Firebase project id — used to scope browser caches per project. */
export function getFirebaseProjectId(): string {
  return getPublicFirebaseConfig().projectId;
}

/**
 * Cloud Functions base URL. Prefer explicit NEXT_PUBLIC_API_BASE_URL; otherwise
 * derive from project id (us-central1 default region for this project).
 */
export function getApiBaseUrl(): string {
  const explicit = readPublicEnv("NEXT_PUBLIC_API_BASE_URL");
  if (explicit) {
    return explicit.replace(/\/api\/?$/, "").replace(/\/+$/, "");
  }
  const projectId = getFirebaseProjectId();
  return `https://us-central1-${projectId}.cloudfunctions.net`;
}

/**
 * Gambian (+220) numbers must pass Africell SMS OTP before signup or withdrawal.
 */
export function requiresMandatoryOtpPhone(phone?: string): boolean {
  return isSmsOtpSupportedPhone(phone);
}

/** Gambian (+220) numbers can receive Africell SMS OTP. */
export function isSmsOtpSupportedPhone(phone?: string): boolean {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return false;
  if (digits.startsWith("220") && digits.length >= 10) return true;
  if (digits.length === 7) return true;
  return false;
}

/**
 * Optional legacy flag — Firebase phone-auth login is NOT supported.
 * Gambian signup/withdrawal SMS uses Africell OTP only (see lib/otpPolicy.ts).
 *
 * WARNING: Do NOT wire this to signInWithPhoneNumber or RecaptchaVerifier.
 */
export function isSignupOtpEnabled(): boolean {
  return false;
}
