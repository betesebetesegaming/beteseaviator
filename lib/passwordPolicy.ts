/** Player & agent customer passwords — 4 (low) through 8 (strongest) characters. */

export const PASSWORD_MIN = 4;
export const PASSWORD_MAX = 8;

export type PasswordStrength = "low" | "strong" | "strongest";

export function passwordStrength(length: number): PasswordStrength | null {
  if (length < PASSWORD_MIN) return null;
  if (length === 4) return "low";
  if (length === 5) return "strong";
  return "strongest";
}

export function passwordStrengthLabel(strength: PasswordStrength): string {
  if (strength === "low") return "Low";
  if (strength === "strong") return "Strong";
  return "Strongest";
}

export function passwordStrengthHint(length: number): string {
  const s = passwordStrength(length);
  if (!s) return "At least 4 letters or numbers";
  if (s === "low") return "OK to sign up · longer is stronger";
  if (s === "strong") return "Strong password";
  return "Strongest (8 characters)";
}

export function validatePassword(password: string): { ok: true } | { ok: false; message: string } {
  const len = password.length;
  if (len < PASSWORD_MIN) {
    return {
      ok: false,
      message: `Use at least ${PASSWORD_MIN} letters or numbers.`,
    };
  }
  if (len > PASSWORD_MAX) {
    return {
      ok: false,
      message: `Maximum ${PASSWORD_MAX} characters.`,
    };
  }
  return { ok: true };
}

export const PASSWORD_FIELD_LABEL = "Password (4–8 letters or numbers)";

export const PASSWORD_HELP = "4 minimum · 8 = strongest";
