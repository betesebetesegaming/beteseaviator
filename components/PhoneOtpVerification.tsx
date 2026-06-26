"use client";

import { useEffect, useState } from "react";
import { sendSignupOtp, verifySignupOtp } from "@/lib/otpClient";
import { Button, Input } from "@/components/ui";

const OTP_RESEND_SECONDS = 60;

export function usePhoneOtp(phone: string) {
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    setOtpCode("");
    setOtpSent(false);
    setOtpVerified(false);
    setOtpCooldown(0);
    setError("");
    setInfo("");
  }, [phone]);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpCooldown]);

  const send = async (): Promise<boolean> => {
    setError("");
    setInfo("");
    if (!phone.trim()) {
      setError("Phone number is required for SMS verification.");
      return false;
    }
    setIsSending(true);
    try {
      const result = await sendSignupOtp(phone);
      if (!result.ok) {
        setError(result.error || "Failed to send verification code.");
        return false;
      }
      setOtpSent(true);
      setOtpVerified(false);
      setOtpCooldown(OTP_RESEND_SECONDS);
      setInfo(
        `Verification code sent. It expires in ${Math.round((result.expirySeconds || 300) / 60)} minutes.`,
      );
      return true;
    } finally {
      setIsSending(false);
    }
  };

  const verify = async (): Promise<{ ok: boolean; error?: string }> => {
    if (otpVerified) return { ok: true };
    if (!otpSent) {
      return { ok: false, error: 'Tap "Send verification code" first.' };
    }
    if (!otpCode.trim()) {
      return { ok: false, error: "Enter the 6-digit SMS verification code." };
    }
    const result = await verifySignupOtp(phone, otpCode);
    if (result.ok) setOtpVerified(true);
    return result;
  };

  return {
    otpCode,
    setOtpCode,
    otpSent,
    otpVerified,
    otpCooldown,
    isSending,
    error,
    info,
    send,
    verify,
    setError,
    setInfo,
  };
}

export interface PhoneOtpVerificationProps {
  phone: string;
  purposeLabel?: string;
  otp: ReturnType<typeof usePhoneOtp>;
  disabled?: boolean;
}

export function PhoneOtpVerification({
  phone,
  purposeLabel = "Verify your mobile number",
  otp,
  disabled = false,
}: PhoneOtpVerificationProps) {
  const { otpCode, setOtpCode, otpSent, otpVerified, otpCooldown, isSending, error, info, send } = otp;

  return (
    <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
      <p className="text-xs font-semibold text-emerald-100">{purposeLabel}</p>
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-200">{error}</p>
      )}
      {info && (
        <p className="rounded-lg border border-emerald-500/20 bg-slate-950/40 p-2 text-xs text-emerald-100">
          {info}
        </p>
      )}
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={() => {
          void send();
        }}
        disabled={disabled || isSending || otpCooldown > 0 || !phone.trim()}
      >
        {isSending
          ? "Sending code…"
          : otpCooldown > 0
            ? `Resend code in ${otpCooldown}s`
            : otpSent
              ? "Resend verification code"
              : "Send verification code"}
      </Button>
      {otpSent && (
        <Input
          label="SMS verification code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={otpCode}
          onChange={(e) => {
            setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6));
          }}
          placeholder="6-digit code"
          disabled={disabled}
        />
      )}
      {otpVerified && <p className="text-xs font-semibold text-emerald-300">Phone number verified.</p>}
      {!otpVerified && otpSent && (
        <p className="text-[11px] text-slate-400">Enter the code from SMS to continue.</p>
      )}
    </div>
  );
}
