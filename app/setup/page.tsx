"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { signInWithEmailAndPassword } from "firebase/auth";
import { ShieldCheck } from "lucide-react";
import { auth } from "@/lib/firebase";
import { seedPlatform, errorMessage } from "@/lib/api";
import { Button, Card, Input } from "@/components/ui";
import { Logo } from "@/components/logo";

/**
 * One-time bootstrap: creates the first admin account (plus optional demo
 * agents/customers/games). The backend refuses to run once an admin exists.
 */
export default function SetupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@betese.com");
  const [password, setPassword] = useState("");
  const [withDemo, setWithDemo] = useState(true);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!email.includes("@")) return toast.error("Enter a valid admin email.");
    if (password.length < 8) return toast.error("Password must be at least 8 characters.");
    setBusy(true);
    try {
      const res = await seedPlatform({
        adminEmail: email.trim().toLowerCase(),
        adminPassword: password,
        withDemoData: withDemo,
      });
      toast.success(`Platform initialised: ${res.created.join(", ")}`);
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      router.replace("/admin");
    } catch (e) {
      toast.error(errorMessage(e));
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
          <div className="mb-4 flex items-center gap-2 text-emerald-300">
            <ShieldCheck size={18} />
            <h2 className="text-lg font-semibold">Platform setup</h2>
          </div>
          <p className="mb-5 text-sm text-slate-400">
            Creates the BETESE admin account, default settings and the Aviator games. This only
            works once — it is locked as soon as an admin exists.
          </p>
          <div className="space-y-4">
            <Input
              label="Admin email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Admin password (min 8 characters)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={withDemo}
                onChange={(e) => setWithDemo(e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
              Also create demo agents & customers (john / victor / test players)
            </label>
            <Button className="w-full" onClick={run} disabled={busy}>
              {busy ? "Setting up…" : "Initialise Platform"}
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}
