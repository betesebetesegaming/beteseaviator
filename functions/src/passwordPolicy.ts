import { HttpsError } from "firebase-functions/v2/https";

export const PASSWORD_MIN = 4;
export const PASSWORD_MAX = 8;

export function assertValidPassword(password: string, field = "Password"): void {
  const result = validatePassword(password, field);
  if (!result.ok) {
    throw new HttpsError("invalid-argument", result.message);
  }
}

export function validatePassword(
  password: string,
  field = "Password",
): { ok: true } | { ok: false; message: string } {
  const len = String(password ?? "").length;
  if (len < PASSWORD_MIN) {
    return {
      ok: false,
      message: `${field} must be at least ${PASSWORD_MIN} characters.`,
    };
  }
  if (len > PASSWORD_MAX) {
    return {
      ok: false,
      message: `${field} must be ${PASSWORD_MAX} characters or fewer.`,
    };
  }
  return { ok: true };
}
