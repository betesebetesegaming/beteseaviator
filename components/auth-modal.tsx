"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  createUserWithEmailAndPassword,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  type ConfirmationResult,
} from "firebase/auth";
import { LogIn, UserPlus, Briefcase } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useAuth, homeFor } from "@/lib/auth-context";
import { agentLogin, completeRegistration, errorMessage } from "@/lib/api";
import { normalizePhone, phoneToEmail } from "@/lib/format";
import { Button, Input, Modal } from "@/components/ui";
import { Logo } from "@/components/logo";

export type AuthModalMode = "login" | "register" | "complete" | "agent";
type CustomerAuth = "password" | "otp";

export function AuthModal({
  open,
  onClose,
  onSuccess,
  initialMode = "register",
  refCode = null,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialMode?: AuthModalMode;
  refCode?: string | null;
}) {
  const { fbUser, profile, loading } = useAuth();
  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [customerAuth, setCustomerAuth] = useState<CustomerAuth>("password");
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [countryCode, setCountryCode] = useState("+221");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [agentId, setAgentId] = useState("");
  const [agentPassword, setAgentPassword] = useState("");

  const confirmRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setCustomerAuth("password");
    setOtpSent(false);
    setOtpCode("");
  }, [open, initialMode]);

  useEffect(() => {
    if (!open || loading) return;
    if (fbUser && !profile) {
      setMode("complete");
      if (fbUser.displayName && !name) setName(fbUser.displayName);
    } else if (fbUser && profile?.status === "active") {
      onSuccess?.();
      onClose();
      if (profile.role !== "player" && typeof window !== "undefined") {
        window.location.href = homeFor(profile.role);
      }
    }
  }, [open, loading, fbUser, profile, onSuccess, onClose, name]);

  async function loginWithPassword() {
    const normalized = normalizePhone(phone);
    if (!normalized) return toast.error("Enter your phone number.");
    if (!password) return toast.error("Enter your password.");
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, phoneToEmail(normalized), password);
      toast.success("Welcome back!");
    } catch {
      toast.error("Invalid credentials.");
    } finally {
      setBusy(false);
    }
  }

  async function registerWithPhone() {
    const normalized = normalizePhone(phone);
    if (!name.trim()) return toast.error("Enter your full name.");
    if (!normalized) return toast.error("Enter your phone number.");
    if (password.length < 8) return toast.error("Password must be at least 8 characters.");
    if (password !== confirm) return toast.error("Passwords do not match.");
    setBusy(true);
    try {
      await createUserWithEmailAndPassword(auth, phoneToEmail(normalized), password);
      await completeRegistration({
        name: name.trim(),
        phone: normalized,
        ref: refCode,
        ...(email.trim() ? { email: email.trim().toLowerCase() } : {}),
      });
      await auth.currentUser?.getIdToken(true);
      toast.success("Account created!");
    } catch (e) {
      const msg = errorMessage(e);
      if (msg.includes("email-already-in-use")) {
        toast.error("This phone number is already registered.");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp() {
    const normalized = normalizePhone(phone);
    if (!normalized) return toast.error("Enter your phone number.");
    setBusy(true);
    try {
      if (!recaptchaRef.current) {
        recaptchaRef.current = new RecaptchaVerifier(auth, "auth-modal-recaptcha", {
          size: "invisible",
        });
      }
      confirmRef.current = await signInWithPhoneNumber(
        auth,
        `${countryCode}${normalized}`,
        recaptchaRef.current
      );
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

  async function loginAgent() {
    if (!agentId || !agentPassword) {
      return toast.error("Enter your username/email and password.");
    }
    setBusy(true);
    try {
      await loginAgentAccount(agentId, agentPassword);
      toast.success("Signed in.");
    } catch (e) {
      const msg = errorMessage(e);
      toast.error(msg.includes("auth/") ? "Invalid credentials." : msg);
    } finally {
      setBusy(false);
    }
  }

  async function completeProfile() {
    if (!name.trim()) return toast.error("Enter your full name.");
    const normalized = normalizePhone(phone);
    if (!normalized) return toast.error("Enter your phone number.");
    setBusy(true);
    try {
      await completeRegistration({ name: name.trim(), phone: normalized, ref: refCode });
      await auth.currentUser?.getIdToken(true);
      toast.success("You're all set!");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        mode === "complete"
          ? "Finish your profile"
          : mode === "agent"
            ? "Agent sign in"
            : mode === "register"
              ? "Create account to play"
              : "Sign in to place bets"
      }
    >
      <div className="mb-3 flex justify-center sm:mb-4">
        <Logo height={28} showWordmark={false} className="sm:hidden" />
        <Logo height={32} showWordmark={false} className="hidden sm:inline-flex" />
      </div>
      <p className="mb-3 text-center text-sm text-slate-400 sm:mb-4">
        {mode === "complete"
          ? "Add your phone number to deposit, bet and withdraw with real GMD."
          : "Watch the game for free — sign up when you're ready to bet for real money."}
      </p>

      {mode !== "complete" && mode !== "agent" && (
        <div className="mb-3 grid grid-cols-2 rounded-lg bg-slate-950/70 p-1 text-sm font-medium sm:mb-4">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex items-center justify-center gap-1.5 rounded-md py-2 ${
              mode === "login" ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-white"
            }`}
          >
            <LogIn size={14} /> Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
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

      {mode === "agent" ? (
        <div className="space-y-4">
          <Input
            label="Agent username or email"
            placeholder="john or john@betese.com"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
          />
          <Input
            label="Password"
            type="password"
            value={agentPassword}
            onChange={(e) => setAgentPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loginAgent()}
          />
          <Button className="w-full" onClick={loginAgent} disabled={busy}>
            {busy ? "Signing in…" : "Agent sign in"}
          </Button>
          <button
            type="button"
            onClick={() => setMode("login")}
            className="block w-full text-center text-xs text-slate-400 hover:text-emerald-300"
          >
            Back to player sign in
          </button>
        </div>
      ) : mode === "complete" ? (
        <div className="space-y-4">
          <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Phone Number"
            type="tel"
            placeholder="77 000 0001"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button className="w-full" onClick={completeProfile} disabled={busy}>
            {busy ? "Saving…" : "Start playing for real"}
          </Button>
        </div>
      ) : mode === "register" ? (
        <div className="space-y-3">
          <Input label="Full Name" placeholder="Awa Diop" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Phone Number"
            type="tel"
            placeholder="77 000 0001"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
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
          <Button className="w-full" onClick={registerWithPhone} disabled={busy}>
            {busy ? "Creating account…" : "Create account"}
          </Button>
        </div>
      ) : customerAuth === "password" ? (
        <div className="space-y-3">
          <Input
            label="Phone Number"
            type="tel"
            placeholder="77 000 0001"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
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
          <button
            type="button"
            onClick={() => setCustomerAuth("otp")}
            className="block w-full text-center text-xs text-slate-400 hover:text-emerald-300"
          >
            Sign in with SMS code instead
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="w-24">
              <Input label="Code" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} />
            </div>
            <div className="flex-1">
              <Input
                label="Phone Number"
                type="tel"
                placeholder="77 000 0001"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
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

      {mode !== "complete" && mode !== "agent" && (
        <>
          <div className="my-4 flex items-center gap-3 text-xs text-slate-500">
            <div className="h-px flex-1 bg-white/10" />
            or
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <Button variant="secondary" className="w-full" onClick={loginGoogle} disabled={busy}>
            Continue with Google
          </Button>
          <button
            type="button"
            onClick={() => setMode("agent")}
            className="mt-4 flex w-full items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-emerald-300"
          >
            <Briefcase size={13} /> Agent sign in
          </button>
        </>
      )}

      <div id="auth-modal-recaptcha" />
    </Modal>
  );
}

export async function loginAgentAccount(agentId: string, agentPassword: string) {
  if (agentId.includes("@")) {
    await signInWithEmailAndPassword(auth, agentId.trim().toLowerCase(), agentPassword);
  } else {
    const { token } = await agentLogin({
      username: agentId.trim().toLowerCase(),
      password: agentPassword,
    });
    await signInWithCustomToken(auth, token);
  }
}
