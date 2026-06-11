/**
 * Public (browser-safe) environment variables.
 *
 * On Vercel, NEXT_PUBLIC_* vars must exist at build time to be inlined into JS
 * chunks. We also inject them at runtime via app/layout.tsx (window.__BETESE_ENV__)
 * so production works even when env vars were added after the last client build.
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

const PUBLIC_ENV_KEYS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_DATABASE_URL',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
  'NEXT_PUBLIC_API_BASE_URL',
  'NEXT_PUBLIC_SIGNUP_OTP_ENABLED',
  'NEXT_PUBLIC_SIGNUP_OTP_GATEWAY_OK',
] as const;

function readPublicEnv(name: (typeof PUBLIC_ENV_KEYS)[number]): string {
  if (typeof window !== 'undefined') {
    const fromWindow = window.__BETESE_ENV__?.[name as keyof PublicClientEnv];
    if (fromWindow && String(fromWindow).trim()) {
      return String(fromWindow).trim();
    }
  }
  return String(process.env[name] || '').trim();
}

function requirePublicEnv(name: (typeof PUBLIC_ENV_KEYS)[number]): string {
  const value = readPublicEnv(name);
  if (!value) {
    throw new Error(
      `Missing ${name}. Set it in Vercel → Settings → Environment Variables (Production + Preview), then redeploy.`,
    );
  }
  return value;
}

/** Build the env object injected by the server layout into the HTML page. */
export function getPublicEnvForInjection(): PublicClientEnv {
  return {
    NEXT_PUBLIC_FIREBASE_API_KEY: String(process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '').trim(),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: String(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '').trim(),
    NEXT_PUBLIC_FIREBASE_DATABASE_URL: String(process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || '').trim(),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: String(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '').trim(),
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: String(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '').trim(),
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: String(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
    NEXT_PUBLIC_FIREBASE_APP_ID: String(process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '').trim(),
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: String(process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || '').trim() || undefined,
    NEXT_PUBLIC_API_BASE_URL: String(process.env.NEXT_PUBLIC_API_BASE_URL || '').trim() || undefined,
    NEXT_PUBLIC_SIGNUP_OTP_ENABLED: String(process.env.NEXT_PUBLIC_SIGNUP_OTP_ENABLED || '').trim() || undefined,
    NEXT_PUBLIC_SIGNUP_OTP_GATEWAY_OK: String(process.env.NEXT_PUBLIC_SIGNUP_OTP_GATEWAY_OK || '').trim() || undefined,
  };
}

export function getPublicFirebaseConfig() {
  return {
    apiKey: requirePublicEnv('NEXT_PUBLIC_FIREBASE_API_KEY'),
    authDomain: requirePublicEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    databaseURL: requirePublicEnv('NEXT_PUBLIC_FIREBASE_DATABASE_URL'),
    projectId: requirePublicEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: requirePublicEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: requirePublicEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: requirePublicEnv('NEXT_PUBLIC_FIREBASE_APP_ID'),
    measurementId: readPublicEnv('NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID') || undefined,
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
  const explicit = readPublicEnv('NEXT_PUBLIC_API_BASE_URL');
  if (explicit) {
    return explicit.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  }
  const projectId = getFirebaseProjectId();
  return `https://us-central1-${projectId}.cloudfunctions.net`;
}

/**
 * Gambian signup SMS OTP — hard-off until Africell SMS API is reachable from
 * Google Cloud Functions (confirmed 502). Re-enable only after Africell whitelists
 * GCP, then set NEXT_PUBLIC_SIGNUP_OTP_GATEWAY_OK=true on Vercel and redeploy.
 */
export function isSignupOtpEnabled(): boolean {
  return false;
}
