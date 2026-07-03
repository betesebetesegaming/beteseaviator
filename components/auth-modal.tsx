"use client";

/**
 * Auth modal — phone + password signup/login with Africell SMS OTP (via PMU fallback).
 *
 * WARNING: Do NOT use Firebase Phone Auth — Gambian SMS OTP only (sendOtp/verifyOtp).
 * SMS verification uses sendOtp/verifyOtp only. See lib/otpPolicy.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { LogIn, UserPlus } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useAuth, homeFor, profileMatchesUser } from "@/lib/auth-context";
import { completeRegistration, errorMessage, resetPlayerPassword } from "@/lib/api";
import {
  PASSWORD_FIELD_LABEL,
  PASSWORD_MAX,
  validatePassword,
} from "@/lib/passwordPolicy";
import { PasswordStrengthHint } from "@/components/PasswordStrengthHint";
import {
  displayLocalFromPhoneKey,
  normalizePhone,
  normalizePhoneLocal,
  phoneCountryFromKey,
  phoneKeyFromAuthEmail,
  phoneToEmail,
} from "@/lib/phone";
import { probeSignupOtpGateway, type OtpGatewayStatus } from "@/lib/otpClient";
import { OtpConfirmPanel, usePhoneOtp } from "@/components/PhoneOtpVerification";
import { getReferralDeviceId } from "@/lib/referrals";
import {
  PHONE_HINT,
  PHONE_LABEL,
  PHONE_PLACEHOLDER,
  PHONE_COUNTRY_OPTIONS,
  getPhoneCountryMeta,
  isActivePhoneCountry,
  type PhoneCountryCode,
} from "@/lib/phone";
import { Button, Input, Modal, Select } from "@/components/ui";
import { Logo } from "@/components/logo";
import { CustomerCareBar } from "@/components/CustomerCareBar";
import { SignupComplianceNotice } from "@/components/SignupComplianceNotice";

export type AuthModalMode = "login" | "register" | "complete" | "forgot";
type FormStep = "details" | "otp" | "reset";

function CustomerPhoneFields({
  phoneCountry,
  onCountryChange,
  phone,
  onPhoneChange,
  disabled = false,
}: {
  phoneCountry: PhoneCountryCode;
  onCountryChange: (c: PhoneCountryCode) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  disabled?: boolean;
}) {
  const meta = getPhoneCountryMeta(phoneCountry);
  const active = isActivePhoneCountry(phoneCountry);

  return (
    <>
      <Select
        label="Country"
        value={phoneCountry}
        onChange={(e) => onCountryChange(e.target.value as PhoneCountryCode)}
        disabled={disabled}
      >
        {PHONE_COUNTRY_OPTIONS.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label} ({c.dial}){c.active ? "" : " — coming soon"}
          </option>
        ))}
      </Select>
      {active ? (
        <Input
          label={`${PHONE_LABEL[phoneCountry]} · ${meta.dial}`}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={12}
          placeholder={PHONE_PLACEHOLDER[phoneCountry]}
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value.replace(/[^\d+\s]/g, ""))}
          disabled={disabled}
        />
      ) : (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100">
          {meta.label} sign-up is coming soon. Please use a Gambian mobile number for now.
        </p>
      )}
    </>
  );
}

export function AuthModal({
  open,
  onClose,
  onSuccess,
  initialMode = "register",
  refCode = null,
  prefCode = null,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialMode?: AuthModalMode;
  refCode?: string | null;
  prefCode?: string | null;
}) {
  const { fbUser, profile, loading } = useAuth();
  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [formStep, setFormStep] = useState<FormStep>("details");
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountryCode>("GM");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [otpGatewayStatus, setOtpGatewayStatus] = useState<OtpGatewayStatus>("unknown");

  const signupPhonePreview = useMemo(
    () => (isActivePhoneCountry(phoneCountry) ? normalizePhone(phone, phoneCountry) : ""),
    [phone, phoneCountry],
  );
  const signupOtp = usePhoneOtp(signupPhonePreview);
  const completeOtp = usePhoneOtp(signupPhonePreview);
  const loginOtp = usePhoneOtp(signupPhonePreview);
  const forgotOtp = usePhoneOtp(signupPhonePreview);
  const signupPhoneComplete = Boolean(
    isActivePhoneCountry(phoneCountry) ? normalizePhoneLocal(phone, phoneCountry) : null,
  );

  const activeOtp =
    mode === "complete"
      ? completeOtp
      : mode === "forgot"
        ? forgotOtp
        : mode === "login"
          ? loginOtp
          : signupOtp;
  const showOtpScreen = formStep === "otp" && signupPhoneComplete;
  const showResetScreen = mode === "forgot" && formStep === "reset" && signupPhoneComplete;

  const postOtpActionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setFormStep("details");
    setAgeConfirmed(false);
    setOtpGatewayStatus("unknown");
  }, [open, initialMode]);

  useEffect(() => {
    if (!open || !isActivePhoneCountry(phoneCountry)) return;
    let alive = true;
    void probeSignupOtpGateway().then((result) => {
      if (alive) setOtpGatewayStatus(result.status);
    });
    return () => {
      alive = false;
    };
  }, [open, phoneCountry]);

  useEffect(() => {
    if (!open || loading) return;
    const matchedProfile = profileMatchesUser(profile, fbUser) ? profile : null;
    if (fbUser && !matchedProfile) {
      setMode("complete");
      setFormStep("details");
      if (fbUser.displayName) setName((n) => n || fbUser.displayName || "");
      const key = phoneKeyFromAuthEmail(fbUser.email);
      if (key) {
        const country = phoneCountryFromKey(key);
        setPhoneCountry(country);
        setPhone((p) => p || displayLocalFromPhoneKey(key, country));
      }
    } else if (matchedProfile?.status === "active") {
      onSuccess?.();
      onClose();
      if (matchedProfile.role !== "player" && typeof window !== "undefined") {
        window.location.href = homeFor(matchedProfile.role);
      }
    }
  }, [open, loading, fbUser, profile, onSuccess, onClose]);

  useEffect(() => {
    setFormStep("details");
  }, [phone, phoneCountry, mode]);

  function requireAgeConfirmation(): boolean {
    if (ageConfirmed) return true;
    toast.error("You must confirm you are 18 or older to sign up.");
    return false;
  }

  function validatePhoneFields(): { ok: true; normalized: string } | { ok: false; error: string } {
    if (!isActivePhoneCountry(phoneCountry)) {
      return {
        ok: false,
        error: "Only Gambian mobile numbers are supported. Ghana & Nigeria coming soon.",
      };
    }
    const normalized = normalizePhone(phone, phoneCountry);
    if (!normalized) return { ok: false, error: PHONE_HINT };
    return { ok: true, normalized };
  }

  async function loginWithPassword() {
    const phoneCheck = validatePhoneFields();
    if (!phoneCheck.ok) return toast.error(phoneCheck.error);
    if (!password) return toast.error("Enter your password.");
    const normalized = phoneCheck.normalized;
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, phoneToEmail(normalized), password);
      toast.success("Welcome back!");
      if (!profile) {
        setMode("complete");
        setFormStep("details");
      }
    } catch {
      toast.error("Invalid phone or password.");
    } finally {
      setBusy(false);
    }
  }

  function retryOtpAfterFailure(message: string) {
    activeOtp.reset();
    postOtpActionRef.current = null;
    setFormStep("otp");
    toast.error(message);
  }

  async function registerWithPhone() {
    if (!requireAgeConfirmation()) return;
    const phoneCheck = validatePhoneFields();
    if (!phoneCheck.ok) return toast.error(phoneCheck.error);
    const normalized = phoneCheck.normalized;
    if (!name.trim()) return toast.error("Enter your full name.");
    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) return toast.error(pwCheck.message);
    if (password !== confirm) return toast.error("Passwords do not match.");

    setBusy(true);
    try {
      const authEmail = phoneToEmail(normalized);
      const registrationPayload = {
        name: name.trim(),
        phone: normalized,
        ref: refCode,
        pref: prefCode,
        deviceId: getReferralDeviceId() || undefined,
      };

      try {
        await createUserWithEmailAndPassword(auth, authEmail, password);
      } catch (e: unknown) {
        const code = (e as { code?: string }).code;
        if (code === "auth/weak-password") {
          throw new Error("Use 4–8 letters or numbers. If it still fails, try 6 or more characters.");
        }
        if (code !== "auth/email-already-in-use") throw e;
        await signInWithEmailAndPassword(auth, authEmail, password);
      }

      await completeRegistration(registrationPayload);
      await auth.currentUser?.getIdToken(true);
      toast.success("Account created!");
    } catch (e) {
      const msg = errorMessage(e);
      if (
        msg.includes("email-already-in-use") ||
        msg.includes("already registered") ||
        msg.includes("already-exists")
      ) {
        toast.error("This phone is already registered. Sign in with your password.");
        setMode("login");
        setFormStep("details");
      } else if (msg.includes("Invalid credentials") || msg.includes("wrong-password")) {
        toast.error("This phone is already registered. Sign in with your password.");
        setMode("login");
        setFormStep("details");
      } else if (/sms verification/i.test(msg)) {
        retryOtpAfterFailure(msg);
      } else if (auth.currentUser && !profileMatchesUser(profile, auth.currentUser)) {
        setMode("complete");
        setFormStep("details");
        toast.error(msg || "Almost done — finish your profile below.");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function completeProfile() {
    if (!requireAgeConfirmation()) return;
    if (!name.trim()) return toast.error("Enter your full name.");
    const phoneCheck = validatePhoneFields();
    if (!phoneCheck.ok) return toast.error(phoneCheck.error);
    const normalized = phoneCheck.normalized;
    setBusy(true);
    try {
      await completeRegistration({
        name: name.trim(),
        phone: normalized,
        ref: refCode,
        pref: prefCode,
        deviceId: getReferralDeviceId() || undefined,
      });
      await auth.currentUser?.getIdToken(true);
      toast.success("You're all set!");
    } catch (e) {
      const msg = errorMessage(e);
      if (msg.includes("already registered") || msg.includes("already-exists")) {
        toast.error("This phone is already registered. Sign in with your password instead.");
        setMode("login");
        setFormStep("details");
      } else if (/sms verification/i.test(msg)) {
        retryOtpAfterFailure(msg);
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  function continueRegister() {
    if (!requireAgeConfirmation()) return;
    const phoneCheck = validatePhoneFields();
    if (!phoneCheck.ok) return toast.error(phoneCheck.error);
    if (!name.trim()) return toast.error("Enter your full name.");
    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) return toast.error(pwCheck.message);
    if (password !== confirm) return toast.error("Passwords do not match.");
    postOtpActionRef.current = () => {
      void registerWithPhone();
    };
    setFormStep("otp");
  }

  function continueLogin() {
    const phoneCheck = validatePhoneFields();
    if (!phoneCheck.ok) return toast.error(phoneCheck.error);
    if (!password) return toast.error("Enter your password.");
    void loginWithPassword();
  }

  async function submitPasswordReset() {
    const phoneCheck = validatePhoneFields();
    if (!phoneCheck.ok) return toast.error(phoneCheck.error);
    const pwCheck = validatePassword(password);
    if (!pwCheck.ok) return toast.error(pwCheck.message);
    if (password !== confirm) return toast.error("Passwords do not match.");
    setBusy(true);
    try {
      await resetPlayerPassword({ phone: phoneCheck.normalized, password });
      toast.success("Password updated. Sign in with your new password.");
      setMode("login");
      setFormStep("details");
      setPassword("");
      setConfirm("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function continueForgot() {
    const phoneCheck = validatePhoneFields();
    if (!phoneCheck.ok) return toast.error(phoneCheck.error);
    postOtpActionRef.current = () => {
      setFormStep("reset");
    };
    setFormStep("otp");
  }
  function continueComplete() {
    if (!requireAgeConfirmation()) return;
    if (!name.trim()) return toast.error("Enter your full name.");
    const phoneCheck = validatePhoneFields();
    if (!phoneCheck.ok) return toast.error(phoneCheck.error);
    postOtpActionRef.current = () => {
      void completeProfile();
    };
    setFormStep("otp");
  }

  const handleOtpVerified = useCallback(() => {
    const action = postOtpActionRef.current;
    if (!action) return;
    postOtpActionRef.current = null;
    action();
  }, []);

  const modalTitle = showOtpScreen
    ? "Verify your number"
    : showResetScreen
      ? "Choose a new password"
      : mode === "forgot"
        ? "Reset password"
        : mode === "complete"
          ? "Finish your profile"
          : mode === "register"
            ? "Create account to play"
            : "Sign in to place bets";

  const modalSubtitle = showOtpScreen
    ? "We sent a one-time password to your phone. Enter the 6-digit code below."
    : showResetScreen
      ? "Pick a password (4–8 letters or numbers)."
      : mode === "forgot"
        ? "Enter your registered Gambian mobile number — we'll verify by SMS."
        : mode === "complete"
          ? "Confirm your name and Gambian mobile number to open your wallet."
          : mode === "register"
            ? "Enter your name, phone and password — we'll verify your number by SMS next."
            : "Enter your phone and password to sign in.";

  return (
    <Modal open={open} onClose={onClose} title={modalTitle}>
      <div className="mb-4 flex justify-center sm:mb-5">
        <Logo height={56} showWordmark={false} />
      </div>
      <p className="mb-3 text-center text-sm text-slate-400 sm:mb-4">{modalSubtitle}</p>

      {showOtpScreen ? (
        <>
          {otpGatewayStatus === "unavailable" ? (
            <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              SMS verification is temporarily unavailable. Try again in a few minutes.
            </p>
          ) : null}
          <OtpConfirmPanel
            phone={signupPhonePreview}
            otp={activeOtp}
            disabled={busy || otpGatewayStatus === "unavailable"}
            autoSend={otpGatewayStatus !== "unavailable"}
            onBack={() => setFormStep("details")}
            onVerified={handleOtpVerified}
            headline={
              mode === "complete"
                ? "Confirm your mobile number to finish signup"
                : mode === "forgot"
                  ? "Confirm it's your number"
                  : mode === "login"
                    ? "Confirm it's you"
                    : "Confirm your mobile number"
            }
            subline="Enter the 6-digit SMS code we sent to your phone."
          />
        </>
      ) : showResetScreen ? (
        <div className="space-y-3">
          <Input
            label={PASSWORD_FIELD_LABEL}
            type="password"
            value={password}
            maxLength={PASSWORD_MAX}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordStrengthHint length={password.length} />
          <Input
            label="Confirm new password"
            type="password"
            value={confirm}
            maxLength={PASSWORD_MAX}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button className="w-full" onClick={() => void submitPasswordReset()} disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setFormStep("details");
              setPassword("");
              setConfirm("");
            }}
            className="w-full text-center text-sm font-medium text-emerald-400 hover:text-emerald-300"
          >
            Back to sign in
          </button>
        </div>
      ) : (
        <>
          {refCode && mode === "register" && (
            <p className="mb-3 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-center text-xs text-sky-100 sm:mb-4">
              You&apos;re joining via agent link:{" "}
              <span className="font-bold uppercase text-sky-300">{refCode}</span>
            </p>
          )}
          {prefCode && mode === "register" && (
            <p className="mb-3 rounded-lg border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-center text-xs text-violet-100 sm:mb-4">
              Invited by friend:{" "}
              <span className="font-bold uppercase text-violet-300">{prefCode}</span>
            </p>
          )}

          {mode !== "complete" && mode !== "forgot" && (
            <div className="mb-3 grid grid-cols-2 rounded-lg bg-slate-950/70 p-1 text-sm font-medium sm:mb-4">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setFormStep("details");
                }}
                className={`flex items-center justify-center gap-1.5 rounded-md py-2 ${
                  mode === "login" ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-white"
                }`}
              >
                <LogIn size={14} /> Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setFormStep("details");
                }}
                className={`flex items-center justify-center gap-1.5 rounded-md py-2 ${
                  mode === "register"
                    ? "bg-emerald-500 text-slate-950"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <UserPlus size={14} /> Sign up
              </button>
            </div>
          )}

          {mode === "complete" ? (
            <div className="space-y-4">
              <SignupComplianceNotice
                ageConfirmed={ageConfirmed}
                onAgeConfirmedChange={setAgeConfirmed}
              />
              <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} />
              <CustomerPhoneFields
                phoneCountry={phoneCountry}
                onCountryChange={setPhoneCountry}
                phone={phone}
                onPhoneChange={setPhone}
              />
              <Button className="w-full" onClick={continueComplete} disabled={busy || !ageConfirmed}>
                Continue
              </Button>
            </div>
          ) : mode === "forgot" ? (
            <div className="space-y-3">
              <CustomerPhoneFields
                phoneCountry={phoneCountry}
                onCountryChange={setPhoneCountry}
                phone={phone}
                onPhoneChange={setPhone}
              />
              <Button className="w-full" onClick={continueForgot} disabled={busy}>
                Send verification code
              </Button>
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setFormStep("details");
                }}
                className="w-full text-center text-sm font-medium text-emerald-400 hover:text-emerald-300"
              >
                Back to sign in
              </button>
            </div>
          ) : mode === "register" ? (
            <div className="space-y-3">
              <SignupComplianceNotice
                ageConfirmed={ageConfirmed}
                onAgeConfirmedChange={setAgeConfirmed}
              />
              <Input
                label="Full Name"
                placeholder="Awa Diop"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <CustomerPhoneFields
                phoneCountry={phoneCountry}
                onCountryChange={setPhoneCountry}
                phone={phone}
                onPhoneChange={setPhone}
              />
              <Input
                label={PASSWORD_FIELD_LABEL}
                type="password"
                value={password}
                maxLength={PASSWORD_MAX}
                onChange={(e) => setPassword(e.target.value)}
              />
              <PasswordStrengthHint length={password.length} />
              <Input
                label="Confirm Password"
                type="password"
                value={confirm}
                maxLength={PASSWORD_MAX}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <Button className="w-full" onClick={continueRegister} disabled={busy || !ageConfirmed}>
                Continue
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <CustomerPhoneFields
                phoneCountry={phoneCountry}
                onCountryChange={setPhoneCountry}
                phone={phone}
                onPhoneChange={setPhone}
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && continueLogin()}
              />
              <Button className="w-full" onClick={continueLogin} disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setMode("forgot");
                  setFormStep("details");
                  setPassword("");
                  setConfirm("");
                }}
                className="w-full text-center text-sm font-medium text-emerald-400 hover:text-emerald-300"
              >
                Forgot password?
              </button>
            </div>
          )}

          {mode === "login" ? (
            <div className="mt-4">
              <CustomerCareBar compact />
            </div>
          ) : null}
        </>
      )}
    </Modal>
  );
}
