/**
 * BETESE OTP policy — read before changing auth or verification flows.
 *
 * WARNING: Do NOT use Firebase Phone Auth (signInWithPhoneNumber, RecaptchaVerifier,
 * Identity Toolkit sendVerificationCode). It is disabled and must not be reintroduced.
 *
 * BETESE is Gambia-only. Every account must verify via Africell SMS before sign-up,
 * profile completion, and withdrawal:
 *   - POST sendOtp / verifyOtp (functions/src/routes/otp.ts)
 *   - Client: lib/otpClient.ts + components/PhoneOtpVerification.tsx
 */
export const OTP_POLICY = {
  country: "GM" as const,
  provider: "africell" as const,
  firebasePhoneAuth: false as const,
  requiredForAllAccounts: true as const,
};

/** @deprecated Firebase phone-auth login is forbidden — always false. */
export function isFirebasePhoneOtpEnabled(): boolean {
  return false;
}
