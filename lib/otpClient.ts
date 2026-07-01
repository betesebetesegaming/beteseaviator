import { apiUrl } from "./apiUrl";

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
      if (isOtpGatewayUnavailableError(err)) {
        return { status: "unavailable", error: err };
      }
      if (res.status === 400 && /phone is required/i.test(err)) {
        return { status: "unknown" };
      }
      return { status: "unavailable", error: err };
    }
    if (data.probe === true) {
      return { status: "available" };
    }
    return { status: "unknown" };
  } catch {
    return { status: "unavailable", error: "Network error. Check your connection and try again." };
  }
}

export async function sendSignupOtp(
  phone: string,
): Promise<{ ok: boolean; expirySeconds?: number; error?: string }> {
  try {
    const res = await fetch(apiUrl("/send-otp"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = String(data.error || data.detail || "Failed to send verification code.");
      return { ok: false, error: err };
    }
    return { ok: true, expirySeconds: Number(data.expirySeconds || 300) };
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
}

export async function verifySignupOtp(phone: string, code: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(apiUrl("/verify-otp"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code: code.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: String(data.error || "Invalid verification code.") };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
}
