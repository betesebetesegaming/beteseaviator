"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Gift } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { completeRegistration, errorMessage } from "@/lib/api";
import { normalizePhone } from "@/lib/format";
import { auth } from "@/lib/firebase";
import { Button, Input, Card, Spinner } from "@/components/ui";
import { Logo } from "@/components/logo";

/**
 * Finishes sign-up for accounts created via Google or SMS code:
 * collects the player's name + phone and creates profile + wallet.
 */
function CompleteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref")?.toLowerCase().trim() || null;
  const { fbUser, profile, loading } = useAuth();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!fbUser) {
      router.replace("/login");
      return;
    }
    if (profile) {
      router.replace("/");
      return;
    }
    if (fbUser.displayName && !name) setName(fbUser.displayName);
    if (fbUser.phoneNumber && !phone) setPhone(fbUser.phoneNumber);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, fbUser, profile, router]);

  async function submit() {
    if (!name.trim()) return toast.error("Enter your full name.");
    const normalized = normalizePhone(phone);
    if (!normalized) return toast.error("Enter your phone number.");
    setBusy(true);
    try {
      await completeRegistration({ name: name.trim(), phone: normalized, ref });
      await auth.currentUser?.getIdToken(true);
      toast.success("Welcome to BETESE Aviator!");
      router.replace("/play");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo height={40} />
        </div>
        <Card>
          <h2 className="mb-1 text-lg font-semibold">One last step</h2>
          <p className="mb-5 text-sm text-slate-400">
            Tell us your name and phone number to finish creating your player account.
          </p>
          <div className="space-y-4">
            <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              label="Phone Number"
              type="tel"
              placeholder="77 000 0001"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <Button className="w-full" onClick={submit} disabled={busy}>
              {busy ? "Saving…" : "Start Playing"}
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}

export default function CompleteRegistrationPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <CompleteForm />
    </Suspense>
  );
}
