"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  type ConfirmationResult,
} from "firebase/auth";
import { LogIn, UserPlus } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useAuth, homeFor, profileMatchesUser } from "@/lib/auth-context";
import { completeRegistration, errorMessage } from "@/lib/api";
import {
  displayLocalFromPhoneKey,
  normalizePhone,
  normalizePhoneLocal,
  phoneCountryFromKey,
  phoneKeyFromAuthEmail,
  phoneToEmail,
} from "@/lib/phone";
import { isSignupOtpEnabled } from "@/lib/env/publicConfig";
import { OtpConfirmPanel, usePhoneOtp } from "@/components/PhoneOtpVerification";
import { getReferralDeviceId } from "@/lib/referrals";
import {
  PHONE_HINT,
  PHONE_LABEL,
  PHONE_PLACEHOLDER,
  PHONE_COUNTRY_OPTIONS,
  getPhoneCountryMeta,
  isActivePhoneCountry,
  normalizePhoneE164,
  type PhoneCountryCode,
} from "@/lib/phone";
import { Button, Input, Modal, Select } from "@/components/ui";
import { Logo } from "@/components/logo";
import { CustomerCareBar } from "@/components/CustomerCareBar";
import { SignupComplianceNotice } from "@/components/SignupComplianceNotice";

export type AuthModalMode = "login" | "register" | "complete";
type CustomerAuth = "password" | "otp";

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
          maxLength={phoneCountry === "GM" ? 12 : 16}
          placeholder={PHONE_PLACEHOLDER[phoneCountry]}
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value.replace(/[^\d+\s]/g, ""))}
          disabled={disabled}
        />
      ) : (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100">
          {meta.label} sign-up is coming soon. Please use Gambia or Senegal for now.
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
  const [customerAuth, setCustomerAuth] = useState<CustomerAuth>("password");
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountryCode>("GM");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [otpDismissed, setOtpDismissed] = useState(false);

  const confirmRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const otpEnabled = isSignupOtpEnabled();
  const requiresSignupOtp = phoneCountry === "GM";
  const requiresCompleteOtp = phoneCountry === "GM";
  const signupPhonePreview = useMemo(
    () => (phoneCountry === "GM" || phoneCountry === "SN" ? normalizePhone(phone, phoneCountry) : ""),
    [phone, phoneCountry],
  );
  const signupOtp = usePhoneOtp(signupPhonePreview);
  const completeOtp = usePhoneOtp(signupPhonePreview);
  const signupPhoneComplete = Boolean(
    phoneCountry === "GM" || phoneCountry === "SN" ? normalizePhoneLocal(phone, phoneCountry) : null,
  );

  const needsOtpStep =
    (mode === "register" && requiresSignupOtp) || (mode === "complete" && requiresCompleteOtp);
  const activeOtp = mode === "complete" ? completeOtp : signupOtp;
  const showOtpScreen =
    needsOtpStep && signupPhoneComplete && !activeOtp.otpVerified && !otpDismissed;

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setCustomerAuth("password");
    setOtpSent(false);
    setOtpCode("");
    setAgeConfirmed(false);
    setOtpDismissed(false);
  }, [open, initialMode]);

  useEffect(() => {
    if (!open || loading) return;
    const matchedProfile = profileMatchesUser(profile, fbUser) ? profile : null;
    if (fbUser && !matchedProfile) {
      setMode("complete");
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
    setOtpDismissed(false);
  }, [phone, phoneCountry, mode]);

  async function loginWithPassword() {
    if (!isActivePhoneCountry(phoneCountry)) {
      return toast.error("Gambia and Senegal are available now. Ghana & Nigeria coming soon.");
    }
    const normalized = normalizePhone(phone, phoneCountry);
    if (!normalized) return toast.error(PHONE_HINT);
    if (!password) return toast.error("Enter your password.");
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, phoneToEmail(normalized), password);
      toast.success("Welcome back!");
      if (!profile) {
        setMode("complete");
      }
    } catch {
      toast.error("Invalid phone or password.");
    } finally {
      setBusy(false);
    }
  }

  function requireAgeConfirmation(): boolean {
    if (ageConfirmed) return true;
    toast.error("You must confirm you are 18 or older to sign up.");
    return false;
  }

  async function registerWithPhone() {
    if (!requireAgeConfirmation()) return;
    if (!isActivePhoneCountry(phoneCountry)) {
      return toast.error("Gambia and Senegal are available now. Ghana & Nigeria coming soon.");
    }
    const normalized = normalizePhone(phone, phoneCountry);
    if (!name.trim()) return toast.error("Enter your full name.");
    if (!normalized) return toast.error(PHONE_HINT);
    if (password.length < 8) return toast.error("Password must be at least 8 characters.");
    if (password !== confirm) return toast.error("Passwords do not match.");

    if (requiresSignupOtp && !signupOtp.otpVerified) {
      setOtpDismissed(false);
      return toast.error("Verify your mobile number with the SMS code first.");
    }

    setBusy(true);
    try {
      const authEmail = phoneToEmail(normalized);
      const registrationPayload = {
        name: name.trim(),
        phone: normalized,
        ref: refCode,
        pref: prefCode,
        deviceId: getReferralDeviceId() || undefined,
        ...(email.trim() ? { email: email.trim().toLowerCase() } : {}),
      };

      try {
        await createUserWithEmailAndPassword(auth, authEmail, password);
      } catch (e: unknown) {
        const code = (e as { code?: string }).code;
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
      } else if (msg.includes("Invalid credentials") || msg.includes("wrong-password")) {
        toast.error("This phone is already registered. Sign in with your password.");
        setMode("login");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp() {
    if (!isActivePhoneCountry(phoneCountry)) {
      return toast.error("Gambia and Senegal are available now. Ghana & Nigeria coming soon.");
    }
    const e164 = normalizePhoneE164(phone, phoneCountry);
    if (!e164) return toast.error(PHONE_HINT);
    setBusy(true);
    try {
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, "auth-modal-recaptcha", {
          size: "invisible",
        });
      }
      confirmRef.current = await signInWithPhoneNumber(auth, e164, recaptchaRef.current);
      setOtpSent(true);
      toast.success("SMS code sent.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmOtp() {
    if (!confirmRef.current || otpCode.length < 6) return toast.error("Enter the 6-digit code.");
    setBusy(true);
    try {
      await confirmRef.current.confirm(otpCode);
      toast.success("Phone verified!");
    } catch {
      toast.error("Invalid code.");
    } finally {
      setBusy(false);
    }
  }

  async function loginGoogle() {
    if (mode === "register" && !requireAgeConfirmation()) return;
    setBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      toast.success("Signed in with Google.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function completeProfile() {
    if (!requireAgeConfirmation()) return;
    if (!name.trim()) return toast.error("Enter your full name.");
    if (!isActivePhoneCountry(phoneCountry)) {
      return toast.error("Gambia and Senegal are available now. Ghana & Nigeria coming soon.");
    }
    const normalized = normalizePhone(phone, phoneCountry);
    if (!normalized) return toast.error(PHONE_HINT);

    if (requiresCompleteOtp && !completeOtp.otpVerified) {
      setOtpDismissed(false);
      return toast.error("Verify your mobile number with the SMS code first.");
    }

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
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  const showCredentials =
    mode === "register" && (!requiresSignupOtp || signupOtp.otpVerified);
  const showCompleteSubmit =
    mode === "complete" && (!requiresCompleteOtp || completeOtp.otpVerified);

  const modalTitle = showOtpScreen
    ? "Verify your number"
    : mode === "complete"
      ? "Finish your profile"
      : mode === "register"
        ? "Create account to play"
        : "Sign in to place bets";

  const modalSubtitle = showOtpScreen
    ? "We sent a 6-digit code to your Africell phone. Enter it below to continue."
    : mode === "complete"
      ? requiresCompleteOtp
        ? "One last step — confirm your name and Gambian mobile number. SMS verification is required before your wallet opens."
        : "Add your phone number to deposit, bet and withdraw with real GMD."
      : mode === "register" && requiresSignupOtp
        ? "Enter your details, then verify your Gambian mobile number by SMS."
        : "Watch the game for free — sign up when you're ready to bet for real money.";

  return (
    <Modal open={open} onClose={onClose} title={modalTitle}>
      <div className="mb-3 flex justify-center sm:mb-4">
        <Logo height={28} showWordmark={false} className="sm:hidden" />
        <Logo height={32} showWordmark={false} className="hidden sm:inline-flex" />
      </div>
      <p className="mb-3 text-center text-sm text-slate-400 sm:mb-4">{modalSubtitle}</p>

      {showOtpScreen ? (
        <OtpConfirmPanel
          phone={signupPhonePreview}
          otp={activeOtp}
          disabled={busy}
          onBack={() => setOtpDismissed(true)}
          headline={
            mode === "complete"
              ? "Confirm your Africell number to finish signup"
              : "Confirm your Africell number"
          }
          subline="Enter the 6-digit SMS code we sent to your phone."
        />
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

          {mode !== "complete" && (
            <div className="mb-3 grid grid-cols-2 rounded-lg bg-slate-950/70 p-1 text-sm font-medium sm:mb-4">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setOtpDismissed(false);
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
                  setOtpDismissed(false);
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
                disabled={completeOtp.otpVerified}
              />
              {requiresCompleteOtp && !signupPhoneComplete && (
                <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  Enter your full 7-digit Gambian mobile number — the popup will switch to SMS
                  verification automatically.
                </p>
              )}
              {requiresCompleteOtp && completeOtp.otpVerified && (
                <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300">
                  Mobile number verified — tap below to activate your wallet
                </p>
              )}
              {showCompleteSubmit && (
                <Button
                  className="w-full"
                  onClick={completeProfile}
                  disabled={busy || !ageConfirmed}
                >
                  {busy ? "Saving…" : "Start playing for real"}
                </Button>
              )}
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
                disabled={signupOtp.otpVerified}
              />
              {requiresSignupOtp && signupOtp.otpVerified && (
                <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300">
                  Mobile number verified — set your password below
                </p>
              )}
              {showCredentials && (
                <>
                  <Input
                    label="Email (optional)"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Input
                    label="Password (min 8 characters)"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <Input
                    label="Confirm Password"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                  <Button className="w-full" onClick={registerWithPhone} disabled={busy || !ageConfirmed}>
                    {busy ? "Creating account…" : "Create account"}
                  </Button>
                </>
              )}
              {requiresSignupOtp && signupPhoneComplete && !signupOtp.otpVerified && (
                <p className="text-center text-xs text-slate-500">
                  Enter your full Gambian mobile number — the popup will ask for your SMS code.
                </p>
              )}
            </div>
          ) : !otpEnabled || customerAuth === "password" ? (
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
                onKeyDown={(e) => e.key === "Enter" && loginWithPassword()}
              />
              <Button className="w-full" onClick={loginWithPassword} disabled={busy}>
                {busy ? "Signing in…" : "Sign in with phone"}
              </Button>
              {otpEnabled && (
                <button
                  type="button"
                  onClick={() => setCustomerAuth("otp")}
                  className="block w-full text-center text-xs text-slate-400 hover:text-emerald-300"
                >
                  Sign in with SMS code instead
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <CustomerPhoneFields
                phoneCountry={phoneCountry}
                onCountryChange={setPhoneCountry}
                phone={phone}
                onPhoneChange={setPhone}
              />
              {otpSent && (
                <Input
                  label="SMS Code"
                  inputMode="numeric"
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                />
              )}
              <Button className="w-full" onClick={otpSent ? confirmOtp : sendOtp} disabled={busy}>
                {busy ? "Please wait…" : otpSent ? "Verify code" : "Send SMS code"}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setCustomerAuth("password");
                  setOtpSent(false);
                }}
                className="block w-full text-center text-xs text-slate-400 hover:text-emerald-300"
              >
                Use password instead
              </button>
            </div>
          )}

          {mode !== "complete" && (
            <>
              <div className="my-4 flex items-center gap-3 text-xs text-slate-500">
                <div className="h-px flex-1 bg-white/10" />
                or
                <div className="h-px flex-1 bg-white/10" />
              </div>
              <Button
                variant="secondary"
                className="w-full"
                onClick={loginGoogle}
                disabled={busy || (mode === "register" && !ageConfirmed)}
              >
                Continue with Google
              </Button>
            </>
          )}

          {mode === "login" ? (
            <div className="mt-4">
              <CustomerCareBar compact />
            </div>
          ) : null}
        </>
      )}

      <div id="auth-modal-recaptcha" />
    </Modal>
  );
}
