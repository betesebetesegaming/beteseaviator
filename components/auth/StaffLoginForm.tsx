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
      return toast.error("Enter your name, username, or email and password.");
    }
    setBusy(true);
    try {
      await loginStaffAccount(id, password);
      await auth.currentUser?.getIdToken(true);
      toast.success("Welcome back!");
    } catch (e) {
      const msg = errorMessage(e);
      if (msg.toLowerCase().includes("invalid credential") || msg.includes("auth/")) {
        toast.error("Wrong username or password.");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Name, username, or email"
        autoComplete="username"
        placeholder="e.g. paul or your email"
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
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
