"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageSquare, ShieldCheck } from "lucide-react";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { markPhoneOtpVerified } from "@/lib/api";
import { sendSignupOtp, verifySignupOtp, isOtpGatewayUnavailableError } from "@/lib/otpClient";
import { formatPhoneDisplay, type PhoneCountry } from "@/lib/phone";
import { Button, Input } from "@/components/ui";

const OTP_RESEND_SECONDS = 60;

function phoneToE164(phoneKey: string, country: PhoneCountry = "GM"): string | null {
  const digits = phoneKey.replace(/\D/g, "");
  if (!digits) return null;
  if (country === "GM") {
    const local = digits.startsWith("220") ? digits.slice(3) : digits;
    return local.length === 7 ? `+220${local}` : null;
  }
  if (digits.startsWith("221") && digits.length === 12) return `+${digits}`;
  if (digits.length === 9) return `+221${digits}`;
  return null;
}

export type UsePhoneOtpOptions = {
  phoneCountry?: PhoneCountry;
  /** Fallback to Firebase Phone Auth when Africell gateway is unreachable. */
  firebaseRecaptchaId?: string;
};

export function usePhoneOtp(phone: string, opts: UsePhoneOtpOptions = {}) {
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [firebaseMode, setFirebaseMode] = useState(false);
  const firebaseConfirmRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    setOtpCode("");
    setOtpSent(false);
    setOtpVerified(false);
    setOtpCooldown(0);
    setError("");
    setInfo("");
    setFirebaseMode(false);
    firebaseConfirmRef.current = null;
  }, [phone]);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpCooldown]);

  const sendViaFirebase = useCallback(async (): Promise<boolean> => {
    const recaptchaId = opts.firebaseRecaptchaId;
    if (!recaptchaId) return false;
    const e164 = phoneToE164(phone, opts.phoneCountry ?? "GM");
    if (!e164) {
      setError("Enter a valid mobile number before requesting a code.");
      return false;
    }
    try {
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, recaptchaId, { size: "invisible" });
      }
      firebaseConfirmRef.current = await signInWithPhoneNumber(auth, e164, recaptchaRef.current);
      setFirebaseMode(true);
      setOtpSent(true);
      setOtpVerified(false);
      setOtpCooldown(OTP_RESEND_SECONDS);
      setInfo("Code sent via backup SMS. Enter the 6-digit code below.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send SMS code. Try again.");
      return false;
    }
  }, [opts.firebaseRecaptchaId, opts.phoneCountry, phone]);

  const send = useCallback(async (): Promise<boolean> => {
    setError("");
    setInfo("");
    if (!phone.trim()) {
      setError("Phone number is required for SMS verification.");
      return false;
    }
    setIsSending(true);
    try {
      const result = await sendSignupOtp(phone);
      if (result.ok) {
        setFirebaseMode(false);
        firebaseConfirmRef.current = null;
        setOtpSent(true);
        setOtpVerified(false);
        setOtpCooldown(OTP_RESEND_SECONDS);
        setInfo(`Code sent to your phone. It expires in ${Math.round((result.expirySeconds || 300) / 60)} minutes.`);
        return true;
      }

      if (isOtpGatewayUnavailableError(result.error) && opts.firebaseRecaptchaId) {
        return sendViaFirebase();
      }

      setError(result.error || "Failed to send verification code.");
      return false;
    } finally {
      setIsSending(false);
    }
  }, [phone, opts.firebaseRecaptchaId, sendViaFirebase]);

  const verify = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (otpVerified) return { ok: true };
    if (!otpSent) {
      return { ok: false, error: "Wait for the SMS code to arrive first." };
    }
    if (!otpCode.trim() || otpCode.trim().length < 6) {
      return { ok: false, error: "Enter the 6-digit SMS verification code." };
    }
    setIsVerifying(true);
    setError("");
    try {
      if (firebaseMode && firebaseConfirmRef.current) {
        await firebaseConfirmRef.current.confirm(otpCode.trim());
        await markPhoneOtpVerified({});
        setOtpVerified(true);
        setInfo("Phone verified. You can continue.");
        return { ok: true };
      }

      const result = await verifySignupOtp(phone, otpCode);
      if (result.ok) {
        setOtpVerified(true);
        setInfo("Phone verified. You can continue.");
      } else {
        setError(result.error || "Invalid verification code.");
      }
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid verification code.";
      setError(msg);
      return { ok: false, error: msg };
    } finally {
      setIsVerifying(false);
    }
  }, [otpVerified, otpSent, otpCode, phone, firebaseMode]);

  return {
    otpCode,
    setOtpCode,
    otpSent,
    otpVerified,
    otpCooldown,
    isSending,
    isVerifying,
    error,
    info,
    send,
    verify,
    setError,
    setInfo,
    firebaseMode,
  };
}

export interface OtpConfirmPanelProps {
  phone: string;
  otp: ReturnType<typeof usePhoneOtp>;
  onBack: () => void;
  onVerified?: () => void;
  disabled?: boolean;
  autoSend?: boolean;
  headline?: string;
  subline?: string;
}

/** Full-step OTP confirmation UI — used inside auth popup and withdrawal flow. */
export function OtpConfirmPanel({
  phone,
  otp,
  onBack,
  onVerified,
  disabled = false,
  autoSend = true,
  headline = "Confirm your mobile number",
  subline = "Enter the 6-digit code we send to your Africell phone.",
}: OtpConfirmPanelProps) {
  const {
    otpCode,
    setOtpCode,
    otpSent,
    otpVerified,
    otpCooldown,
    isSending,
    isVerifying,
    error,
    info,
    send,
    verify,
  } = otp;

  const autoSentRef = useRef("");

  useEffect(() => {
    autoSentRef.current = "";
  }, [phone]);

  useEffect(() => {
    if (!autoSend || otpVerified || otpSent || isSending || !phone.trim()) return;
    if (autoSentRef.current === phone) return;
    autoSentRef.current = phone;
    void send();
  }, [autoSend, phone, otpVerified, otpSent, isSending, send]);

  useEffect(() => {
    if (otpVerified) onVerified?.();
  }, [otpVerified, onVerified]);

  const displayPhone = formatPhoneDisplay(phone) || phone;

  async function handleVerify() {
    const result = await verify();
    if (result.ok) onVerified?.();
  }

  return (
    <div className="space-y-5 py-1">
      <button
        type="button"
        onClick={onBack}
        disabled={disabled || isVerifying}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-white"
      >
        <ArrowLeft size={14} /> Change phone number
      </button>

      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
          {otpVerified ? <ShieldCheck size={22} /> : <MessageSquare size={22} />}
        </div>
        <p className="text-base font-semibold text-white">{headline}</p>
        <p className="mt-1 text-sm text-emerald-100">{displayPhone}</p>
        <p className="mt-2 text-xs text-slate-300">{subline}</p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>
      )}
      {info && !error && (
        <p className="rounded-lg border border-emerald-500/20 bg-slate-950/40 p-3 text-sm text-emerald-100">{info}</p>
      )}

      {!otpVerified && (
        <>
          <Input
            label="Verification code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit SMS code"
            disabled={disabled || isVerifying}
            className="text-center text-lg tracking-[0.35em] font-semibold"
          />

          <Button
            type="button"
            className="w-full"
            onClick={() => {
              void handleVerify();
            }}
            disabled={disabled || isVerifying || otpCode.trim().length < 6}
          >
            {isVerifying ? "Confirming…" : "Confirm code"}
          </Button>

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
                  ? "Resend SMS code"
                  : "Send SMS code"}
          </Button>
        </>
      )}

      {otpVerified && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center text-sm font-semibold text-emerald-300">
          Phone verified — continuing…
        </div>
      )}
    </div>
  );
}

export interface PhoneOtpVerificationProps {
  phone: string;
  purposeLabel?: string;
  otp: ReturnType<typeof usePhoneOtp>;
  disabled?: boolean;
  morphOnComplete?: boolean;
  phoneComplete?: boolean;
  onMorphBack?: () => void;
  onVerified?: () => void;
}

/** Inline or morphing OTP block — morphOnComplete swaps to full OtpConfirmPanel. */
export function PhoneOtpVerification({
  phone,
  purposeLabel = "Verify your mobile number",
  otp,
  disabled = false,
  morphOnComplete = false,
  phoneComplete = false,
  onMorphBack,
  onVerified,
}: PhoneOtpVerificationProps) {
  if (morphOnComplete && phoneComplete && !otp.otpVerified) {
    return (
      <OtpConfirmPanel
        phone={phone}
        otp={otp}
        disabled={disabled}
        onBack={onMorphBack || (() => undefined)}
        onVerified={onVerified}
        headline={purposeLabel}
      />
    );
  }

  if (morphOnComplete && otp.otpVerified) {
    return (
      <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300">
        {formatPhoneDisplay(phone) || phone} verified
      </p>
    );
  }

  return (
    <OtpConfirmPanel
      phone={phone}
      otp={otp}
      disabled={disabled}
      onBack={onMorphBack || (() => undefined)}
      onVerified={onVerified}
      headline={purposeLabel}
      autoSend={false}
    />
  );
}
