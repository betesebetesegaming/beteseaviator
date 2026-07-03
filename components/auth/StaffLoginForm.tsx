"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { LogIn } from "lucide-react";
import { auth } from "@/lib/firebase";
import type { User } from "firebase/auth";
import { errorMessage, resolveStaffSession } from "@/lib/api";
import { homeFor } from "@/lib/auth-context";
import { hardRedirect, withTimeout } from "@/lib/hardRedirect";
import { loginStaffAccount } from "@/lib/auth-login";
import { Button, Input } from "@/components/ui";

async function waitForAuthUser(timeoutMs = 8000): Promise<User> {
  if (auth.currentUser) return auth.currentUser;
  return new Promise<User>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Sign-in timed out. Try again.")), timeoutMs);
    const unsub = auth.onAuthStateChanged((user) => {
      if (!user) return;
      window.clearTimeout(timer);
      unsub();
      resolve(user);
    });
  });
}

export function StaffLoginForm() {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id.trim() || !password) {
      return toast.error("Enter your name, username, or email and password.");
    }
    setBusy(true);
    try {
      await loginStaffAccount(id, password);
      const user = await waitForAuthUser();
      await user.getIdToken(true);
      const session = await withTimeout(
        resolveStaffSession({}),
        8000,
        "Staff profile sync timed out",
      );
      await user.getIdToken(true);
      toast.success("Welcome back!");
      hardRedirect(homeFor(session.role));
    } catch (e) {
      const msg = errorMessage(e);
      if (msg.toLowerCase().includes("invalid credential") || msg.includes("auth/")) {
        toast.error("Wrong username or password.");
      } else {
        toast.error(msg);
      }
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Name, username, or email"
        autoComplete="username"
        placeholder="e.g. john or john@betese.com"
        value={id}
        onChange={(e) => setId(e.target.value)}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        placeholder="Enter your password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" className="w-full gap-2" disabled={busy}>
        <LogIn size={16} />
        {busy ? "Opening dashboard…" : "Sign in"}
      </Button>
      <p className="rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-center text-xs text-slate-400">
        Need an agent account? Contact BETESE admin — only admin can create staff logins.
      </p>
    </form>
  );
}
