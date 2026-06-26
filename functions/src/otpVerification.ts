import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./helpers";

/** Gambian numbers stored as 7-digit local or 220-prefixed msisdn. */
export function isGambianPhoneKey(phone: string): boolean {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("220") && digits.length >= 10) return true;
  if (/^\d{7}$/.test(digits)) return true;
  return false;
}

/** Africell OTP msisdn — same normalization as routes/otp.ts */
export function toOtpMsisdn(raw: string): string | null {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("220") && digits.length >= 10) return digits;
  if (digits.startsWith("221") && digits.length >= 12) return digits;
  if (digits.length === 7) return `220${digits}`;
  return digits.startsWith("220") ? digits : null;
}

/** One-time consume of a recent successful SMS verification. */
export async function consumeOtpVerification(msisdn: string): Promise<void> {
  const ref = db.collection("otp_verified").doc(msisdn);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "SMS verification required. Request and enter your verification code first.",
    );
  }
  const data = snap.data() as { expires_at?: string };
  const expiresAt = data.expires_at ? Date.parse(data.expires_at) : 0;
  if (!expiresAt || Date.now() > expiresAt) {
    await ref.delete().catch(() => undefined);
    throw new HttpsError(
      "failed-precondition",
      "SMS verification expired. Request a new code and try again.",
    );
  }
  await ref.delete();
}

export async function assertOtpVerifiedForPhone(phone: string): Promise<void> {
  if (!isGambianPhoneKey(phone)) return;
  const msisdn = toOtpMsisdn(phone);
  if (!msisdn) {
    throw new HttpsError("invalid-argument", "A valid Gambian mobile number is required.");
  }
  await consumeOtpVerification(msisdn);
}
