import { NextResponse } from "next/server";
import { getApiBaseUrl, isSmsOtpSupportedPhone } from "@/lib/env/publicConfig";
import { normalizePhone, toWaveAccountNumber } from "@/lib/phone";

export const runtime = "nodejs";

async function ping(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; ms: number; error?: string }> {
  const started = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
    return { ok: res.ok, status: res.status, ms: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function phoneCheck(raw: string) {
  const canonical = normalizePhone(raw);
  return {
    input: raw,
    canonical,
    wave: toWaveAccountNumber(raw),
    otpRequired: isSmsOtpSupportedPhone(canonical || raw),
    withdrawReady: Boolean(canonical),
  };
}

export async function GET() {
  const base = getApiBaseUrl();
  const [otp, modempay, qtech] = await Promise.all([
    ping(`${base}/sendOtp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ probe: true }),
    }),
    ping(`${base}/modempayApi/health`),
    ping(`${base}/qtcwApi/health`),
  ]);

  const phones = {
    africell9: phoneCheck("874571989"),
    africell7: phoneCheck("4571989"),
    qcell9: phoneCheck("835551234"),
  };

  const withdrawalPhonesOk =
    phones.africell9.withdrawReady &&
    phones.africell9.otpRequired &&
    phones.africell9.wave === "874571989" &&
    phones.africell7.wave === "874571989";

  const ok = otp.ok && withdrawalPhonesOk;
  return NextResponse.json(
    {
      ok,
      service: "betese-aviator",
      withdrawal: {
        phonesOk: withdrawalPhonesOk,
        otpGateway: otp.ok ? "up" : "down",
        modempay: modempay.ok ? "up" : "down",
      },
      checks: { otp, modempay, qtech, phones },
    },
    { status: ok ? 200 : 503 }
  );
}
