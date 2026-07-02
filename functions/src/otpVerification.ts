import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./helpers";

/**
 * Server-side Africell OTP verification (otp_verified collection).
 *
 * WARNING: Do NOT use Firebase Phone Auth. Every BETESE account must verify via
 * Africell sendOtp/verifyOtp before completeRegistration or withdrawal.
 * See lib/otpPolicy.ts.
 */

/** Gambian numbers stored as 7-digit local or 220-prefixed msisdn. */
export function isGambianPhoneKey(phone: string): boolean {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("220") && digits.length >= 10) return true;
  return /^\d{7}$/.test(digits);
}

/** Africell OTP msisdn — same normalization as routes/otp.ts */
export function toOtpMsisdn(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("220") && digits.length >= 10) return digits;
  if (digits.length === 7) return `220${digits}`;
  return null;
}

function otpVerificationError(
  kind: "missing" | "expired",
): HttpsError {
  if (kind === "expired") {
    return new HttpsError(
      "failed-precondition",
      "SMS verification expired. Request a new Africell code and try again.",
    );
  }
  return new HttpsError(
    "failed-precondition",
    "SMS verification required. Request and enter your Africell verification code first.",
  );
}

/** Check that a recent SMS verification exists (does not consume). */
export async function requireOtpVerification(msisdn: string): Promise<void> {
  const ref = db.collection("otp_verified").doc(msisdn);
  const snap = await ref.get();
  if (!snap.exists) {
    throw otpVerificationError("missing");
  }
  const data = snap.data() as { expires_at?: string };
  const expiresAt = data.expires_at ? Date.parse(data.expires_at) : 0;
  if (!expiresAt || Date.now() > expiresAt) {
    await ref.delete().catch(() => undefined);
    throw otpVerificationError("expired");
  }
}

/** One-time consume of a recent successful SMS verification. */
export async function consumeOtpVerification(msisdn: string): Promise<void> {
  await requireOtpVerification(msisdn);
  await db.collection("otp_verified").doc(msisdn).delete();
}

function resolveOtpMsisdn(phone: string): string {
  if (!isGambianPhoneKey(phone)) {
    throw new HttpsError("invalid-argument", "A valid Gambian mobile number is required.");
  }
  const msisdn = toOtpMsisdn(phone);
  if (!msisdn) {
    throw new HttpsError("invalid-argument", "A valid Gambian mobile number is required.");
  }
  return msisdn;
}

/** Ensure Africell OTP was verified recently (keeps verification for retry). */
export async function requireOtpVerifiedForPhone(phone: string): Promise<string> {
  const msisdn = resolveOtpMsisdn(phone);
  await requireOtpVerification(msisdn);
  return msisdn;
}

/** Consume Africell OTP after a sensitive action succeeds. */
export async function consumeOtpVerifiedForPhone(phone: string): Promise<void> {
  const msisdn = resolveOtpMsisdn(phone);
  await consumeOtpVerification(msisdn);
}

/** @deprecated Prefer requireOtpVerifiedForPhone + consumeOtpVerifiedForPhone. */
export async function assertOtpVerifiedForPhone(phone: string): Promise<void> {
  await consumeOtpVerifiedForPhone(phone);
}
