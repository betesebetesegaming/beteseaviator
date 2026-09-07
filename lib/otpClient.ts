import { apiUrl } from "./apiUrl";
import { legacyGambiaLocal, normalizePhone } from "./phone";

/**
 * Africell SMS OTP client (sendOtp / verifyOtp Cloud Functions).
 *
 * WARNING: Do NOT use Firebase Phone Auth here. All SMS codes go through Africell
 * via lib/otpClient → functions/src/routes/otp.ts. See lib/otpPolicy.ts.
 */
export function isOtpGatewayUnavailableError(error?: string): boolean {
  const msg = String(error || "").toLowerCase();
  return (
    msg.includes("not reachable") ||
    msg.includes("gateway") ||
    msg.includes("credentials not configured") ||
    msg.includes("network error") ||
    msg.includes("failed to persist otp") ||
    msg.includes("no tokens") ||
    msg.includes("timed out")
  );
}

export type OtpGatewayStatus = "unknown" | "available" | "unavailable";

export async function probeSignupOtpGateway(): Promise<{ status: OtpGatewayStatus; error?: string }> {
  try {
    const res = await fetch(apiUrl("/send-otp"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ probe: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = String(data.error || "SMS gateway unavailable.");
      // Probe was briefly disabled (404). Don't lock the signup/withdraw OTP UI.
      if (res.status === 404 || res.status === 400) {
        return { status: "unknown" };
      }
      if (isOtpGatewayUnavailableError(err) || res.status >= 500) {
        return { status: "unavailable", error: err };
      }
      return { status: "unknown", error: err };
    }
    if (data.probe === true) {
      return { status: "available" };
    }
    return { status: "unknown" };
  } catch {
    return { status: "unavailable", error: "Network error. Check your connection and try again." };
  }
}

function otpPhoneAttempts(phone: string): string[] {
  const canonical = normalizePhone(phone);
  const legacy = canonical ? legacyGambiaLocal(canonical) : null;
  const attempts: string[] = [];
  const add = (value?: string | null) => {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits && !attempts.includes(digits)) attempts.push(digits);
  };
  add(legacy);
  add(canonical);
  add(phone);
  return attempts;
}

async function postOtp(
  path: "/send-otp" | "/verify-otp",
  body: Record<string, string>,
): Promise<{ ok: boolean; expirySeconds?: number; error?: string }> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: String(data.error || data.detail || "Request failed.") };
  }
  return { ok: true, expirySeconds: Number(data.expirySeconds || 300) };
}

export async function sendSignupOtp(
  phone: string,
): Promise<{ ok: boolean; expirySeconds?: number; error?: string }> {
  try {
    let lastError = "Failed to send verification code.";
    for (const candidate of otpPhoneAttempts(phone)) {
      const result = await postOtp("/send-otp", { phone: candidate });
      if (result.ok) return result;
      lastError = result.error || lastError;
      if (!/invalid|gambian|digit/i.test(lastError)) {
        return { ok: false, error: lastError };
      }
    }
    return { ok: false, error: lastError };
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
}

export async function verifySignupOtp(phone: string, code: string): Promise<{ ok: boolean; error?: string }> {
  try {
    let lastError = "Invalid verification code.";
    const trimmed = code.trim();
    for (const candidate of otpPhoneAttempts(phone)) {
      const result = await postOtp("/verify-otp", { phone: candidate, code: trimmed });
      if (result.ok) return { ok: true };
      lastError = result.error || lastError;
      if (!/invalid gambian|digit/i.test(lastError)) {
        return { ok: false, error: lastError };
      }
    }
    return { ok: false, error: lastError };
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
}
