"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { Gift } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { completeRegistration, errorMessage } from "@/lib/api";
import { normalizePhone, phoneToEmail } from "@/lib/format";
import { Button, Input, Card, Spinner } from "@/components/ui";
import { Logo } from "@/components/logo";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref")?.toLowerCase().trim() || null;

  const [agentName, setAgentName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ref) return;
    getDoc(doc(db, "slugs", ref))
      .then((snap) => {
        if (snap.exists() && snap.data().active) {
          setAgentName((snap.data().agentName as string) ?? ref);
        }
      })
      .catch(() => {
        /* invalid refs are silently ignored */
      });
  }, [ref]);

  async function submit() {
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
        ref,
        ...(email.trim() ? { email: email.trim().toLowerCase() } : {}),
      });
      await auth.currentUser?.getIdToken(true); // pick up role claim
      toast.success("Welcome to BETESE Aviator!");
      router.replace("/play");
    } catch (e) {
      const msg = errorMessage(e);
      if (msg.includes("email-already-in-use")) {
        toast.error("This phone number is already registered.");
      } else if (msg.includes("weak-password")) {
        toast.error("Password is too weak.");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo height={40} />
        </div>

        <Card>
          <h2 className="mb-1 text-lg font-semibold">Create your account</h2>
          <p className="mb-5 text-sm text-slate-400">
            Sign up with your phone number — deposit, play and win.
          </p>

          {agentName && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              <Gift size={16} />
              You were invited by agent <strong>{agentName}</strong>
            </div>
          )}

          <div className="space-y-4">
            <Input
              label="Full Name"
              placeholder="Awa Diop"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
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
              placeholder="you@example.com"
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
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <Button className="w-full" onClick={submit} disabled={busy}>
              {busy ? "Creating account…" : "Create Account"}
            </Button>
          </div>

          <p className="mt-5 text-center text-sm text-slate-400">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-emerald-400 hover:underline">
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <RegisterForm />
    </Suspense>
  );
}
