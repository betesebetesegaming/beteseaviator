"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { LogIn } from "lucide-react";
import { auth } from "@/lib/firebase";
import { errorMessage } from "@/lib/api";
import { loginStaffAccount } from "@/lib/auth-login";
import { Button, Input } from "@/components/ui";

export function StaffLoginForm() {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id.trim() || !password) {
      return toast.error("Enter your username or email and password.");
    }
    setBusy(true);
    try {
      await loginStaffAccount(id, password);
      await auth.currentUser?.getIdToken(true);
      toast.success("Welcome back!");
    } catch (e) {
      const msg = errorMessage(e);
      toast.error(msg.includes("auth/") ? "Invalid credentials." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Username or email"
        autoComplete="username"
        placeholder="admin, john, or admin@betese.com"
        value={id}
        onChange={(e) => setId(e.target.value)}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" className="w-full gap-2" disabled={busy}>
        <LogIn size={16} />
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
