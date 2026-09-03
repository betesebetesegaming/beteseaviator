import { HttpsError } from "firebase-functions/v2/https";
import { db } from "./helpers";
import { isGambianPhoneKey, otpMsisdnCandidates, toOtpMsisdn } from "./phone";

/**
 * Server-side Africell OTP verification (otp_verified collection).
 *
 * WARNING: Do NOT use Firebase Phone Auth. Every BETESE account must verify via
 * Africell sendOtp/verifyOtp before completeRegistration or withdrawal.
 * See lib/otpPolicy.ts.
 */

export { isGambianPhoneKey, toOtpMsisdn };

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

function resolveOtpCandidates(phone: string): string[] {
  if (!isGambianPhoneKey(phone)) {
    throw new HttpsError("invalid-argument", "A valid Gambian mobile number is required.");
  }
  const candidates = otpMsisdnCandidates(phone);
  if (!candidates.length) {
    throw new HttpsError("invalid-argument", "A valid Gambian mobile number is required.");
  }
  return candidates;
}

async function matchVerifiedMsisdn(phone: string): Promise<string> {
  const candidates = resolveOtpCandidates(phone);
  let expired = false;
  for (const msisdn of candidates) {
    const ref = db.collection("otp_verified").doc(msisdn);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const data = snap.data() as { expires_at?: string };
    const expiresAt = data.expires_at ? Date.parse(data.expires_at) : 0;
    if (expiresAt && Date.now() <= expiresAt) return msisdn;
    expired = true;
    await ref.delete().catch(() => undefined);
  }
  throw otpVerificationError(expired ? "expired" : "missing");
}

/** Ensure Africell OTP was verified recently (keeps verification for retry). */
export async function requireOtpVerifiedForPhone(phone: string): Promise<string> {
  return matchVerifiedMsisdn(phone);
}

/** Consume Africell OTP after a sensitive action succeeds. */
export async function consumeOtpVerifiedForPhone(phone: string): Promise<void> {
  const msisdn = await matchVerifiedMsisdn(phone);
  await db.collection("otp_verified").doc(msisdn).delete().catch(() => undefined);
}

/** @deprecated Prefer requireOtpVerifiedForPhone + consumeOtpVerifiedForPhone. */
export async function assertOtpVerifiedForPhone(phone: string): Promise<void> {
  await consumeOtpVerifiedForPhone(phone);
}
