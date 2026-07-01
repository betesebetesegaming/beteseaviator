/**
 * Maps legacy route paths (e.g. `/modempay-checkout`) to Firebase Cloud Functions.
 *
 * OTP routes sendOtp / verifyOtp use Africell SMS only — never Firebase Phone Auth.
 * See lib/otpPolicy.ts.
 */
import { getApiBaseUrl } from "./env/publicConfig";

const MODEMPAY_PATHS = new Set([
  "/modempay-checkout",
  "/wave-payment",
  "/aps-payment",
  "/afrimoney-payment",
  "/qmoney-payment",
  "/card-payment",
  "/modempay-payout",
  "/modempay-refund",
  "/modempay-balances",
  "/modempay-reconcile-deposit",
]);

const CALLABLE_ALIASES: Record<string, string> = {
  "/send-otp": "sendOtp",
  "/verify-otp": "verifyOtp",
};

export function apiUrl(path: string): string {
  let p = String(path || "").trim();
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.startsWith("/api/")) p = p.slice(4);

  const base = getApiBaseUrl();

  if (p === "/modempay-webhook") {
    return `${base}/modempayApi/modempay-webhook`;
  }

  const txMatch = p.match(/^\/modempay-transactions\/(.+)$/);
  if (txMatch) {
    return `${base}/modempayApi/modempay-transactions/${encodeURIComponent(txMatch[1])}`;
  }

  if (MODEMPAY_PATHS.has(p)) {
    return `${base}/modempayApi${p}`;
  }

  const fn = CALLABLE_ALIASES[p];
  if (fn) return `${base}/${fn}`;

  throw new Error(`Unknown API route: ${p}`);
}
