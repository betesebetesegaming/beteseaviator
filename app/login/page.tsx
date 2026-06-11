"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  type ConfirmationResult,
} from "firebase/auth";
import { Plane } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { agentLogin, errorMessage } from "@/lib/api";
import { normalizePhone, phoneToEmail } from "@/lib/format";
import { Button, Input, Card } from "@/components/ui";

type Tab = "customer" | "agent";
type CustomerMode = "password" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const { fbUser, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("customer");
  const [mode, setMode] = useState<CustomerMode>("password");
  const [busy, setBusy] = useState(false);

  // customer
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+221");
  const [password, setPassword] = useState("");
  // agent
  const [agentId, setAgentId] = useState("");
  const [agentPassword, setAgentPassword] = useState("");
  // otp
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const confirmRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    if (!loading && fbUser) router.replace("/");
  }, [loading, fbUser, router]);

  async function loginCustomer() {
    const normalized = normalizePhone(phone);
    if (!normalized) return toast.error("Enter your phone number.");
    if (!password) return toast.error("Enter your password.");
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, phoneToEmail(normalized), password);
      router.replace("/");
    } catch {
      toast.error("Invalid credentials.");
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
        recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", {
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
      router.replace("/");
    } catch {
      toast.error("Invalid code.");
    } finally {
      setBusy(false);
    }
  }

  async function loginAgent() {
    if (!agentId || !agentPassword) return toast.error("Enter your username/email and password.");
    setBusy(true);
    try {
      if (agentId.includes("@")) {
        await signInWithEmailAndPassword(auth, agentId.trim().toLowerCase(), agentPassword);
      } else {
        const { token } = await agentLogin({
          username: agentId.trim().toLowerCase(),
          password: agentPassword,
        });
        await signInWithCustomToken(auth, token);
      }
      router.replace("/");
    } catch (e) {
      const msg = errorMessage(e);
      toast.error(msg.includes("auth/") ? "Invalid credentials." : msg);
    } finally {
      setBusy(false);
    }
  }

  async function loginGoogle() {
    setBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      router.replace("/");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Plane className="animate-float text-emerald-400" size={32} />
          <h1 className="text-2xl font-bold tracking-tight">
            BETESE <span className="text-emerald-400">Aviator</span>
          </h1>
        </div>

        <Card>
          <div className="mb-5 grid grid-cols-2 rounded-lg bg-slate-950/70 p-1 text-sm font-medium">
            {(["customer", "agent"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md py-2 capitalize transition-colors ${
                  tab === t ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "customer" ? (
            <div className="space-y-4">
              {mode === "password" ? (
                <>
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
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && loginCustomer()}
                  />
                  <Button className="w-full" onClick={loginCustomer} disabled={busy}>
                    {busy ? "Signing in…" : "Sign In"}
                  </Button>
                  <button
                    onClick={() => setMode("otp")}
                    className="block w-full text-center text-xs text-slate-400 hover:text-emerald-300"
                  >
                    Sign in with SMS code instead
                  </button>
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    <div className="w-24">
                      <Input
                        label="Code"
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                      />
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
                  <Button
                    className="w-full"
                    onClick={otpSent ? confirmOtp : sendOtp}
                    disabled={busy}
                  >
                    {busy ? "Please wait…" : otpSent ? "Verify Code" : "Send SMS Code"}
                  </Button>
                  <button
                    onClick={() => {
                      setMode("password");
                      setOtpSent(false);
                    }}
                    className="block w-full text-center text-xs text-slate-400 hover:text-emerald-300"
                  >
                    Use password instead
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Input
                label="Agent Username or Email"
                placeholder="john or john@betese.com"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              />
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={agentPassword}
                onChange={(e) => setAgentPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loginAgent()}
              />
              <Button className="w-full" onClick={loginAgent} disabled={busy}>
                {busy ? "Signing in…" : "Sign In"}
              </Button>
              <p className="text-center text-xs text-slate-500">
                Agent accounts are created by BETESE or your super agent.
              </p>
            </div>
          )}

          <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
            <div className="h-px flex-1 bg-white/10" />
            or
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <Button variant="secondary" className="w-full" onClick={loginGoogle} disabled={busy}>
            Continue with Google
          </Button>

          {tab === "customer" && (
            <p className="mt-5 text-center text-sm text-slate-400">
              New here?{" "}
              <Link href="/register" className="font-semibold text-emerald-400 hover:underline">
                Create an account with your phone
              </Link>
            </p>
          )}
        </Card>

        <div id="recaptcha-container" />
      </div>
    </main>
  );
}
