"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { adminSetUserPassword, errorMessage } from "@/lib/api";
import { isAgentRole } from "@/lib/roles";
import {
  PASSWORD_FIELD_LABEL,
  PASSWORD_MAX,
  validatePassword,
} from "@/lib/passwordPolicy";
import { PasswordStrengthHint } from "@/components/PasswordStrengthHint";
import { staffSignInId } from "@/lib/staffAccount";
import type { UserProfile } from "@/lib/types";
import { Button, Input, Modal } from "@/components/ui";

type Props = {
  user: UserProfile | null;
  onClose: () => void;
};

type SuccessInfo = {
  name: string;
  signInWith: string;
  signInLabel: string;
  password: string;
  role: UserProfile["role"];
};

/** Admin support — set a new password (existing passwords cannot be viewed). */
export function AdminResetPasswordModal({ user, onClose }: Props) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);

  const isPlayer = user?.role === "player";
  const isStaff = !!user && (user.role === "admin" || isAgentRole(user.role));

  const pwCheck = useMemo(() => {
    if (!password) return null;
    if (isPlayer) return validatePassword(password);
    if (isStaff && password.length < 8) {
      return { ok: false as const, message: "Staff password must be at least 8 characters." };
    }
    return { ok: true as const };
  }, [password, isPlayer, isStaff]);

  function closeAll() {
    setPassword("");
    setSuccess(null);
    onClose();
  }

  async function submit() {
    if (!user) return;
    if (isPlayer) {
      const check = validatePassword(password);
      if (!check.ok) return toast.error(check.message);
    } else if (isStaff && password.length < 8) {
      return toast.error("Staff password must be at least 8 characters.");
    } else if (!password) {
      return toast.error("Enter a new password.");
    }

    setBusy(true);
    try {
      const res = await adminSetUserPassword({ uid: user.uid, password });
      setSuccess({
        name: user.name,
        signInWith: res.signInWith,
        signInLabel: res.signInLabel,
        password,
        role: res.role,
      });
      toast.success("Password updated.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  if (success) {
    return (
      <Modal open onClose={closeAll} title="Give these details to the user">
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Passwords are stored securely — BETESE admin cannot view old passwords, only set a new
            one. Share this with <strong className="text-white">{success.name}</strong>:
          </p>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
            <dl className="space-y-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-emerald-300/80">
                  {success.signInLabel}
                </dt>
                <dd className="font-mono text-emerald-50">{success.signInWith}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-emerald-300/80">New password</dt>
                <dd className="font-mono text-emerald-50">{success.password}</dd>
              </div>
            </dl>
          </div>
          <Button className="w-full" onClick={closeAll}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={closeAll} title={`Reset password — ${user.name}`}>
      <div className="space-y-4">
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          You cannot see their current password. Set a new one and tell them — they sign in with{" "}
          {isPlayer ? (
            <>phone <strong>{user.phone ?? "—"}</strong> on /play</>
          ) : (
            <>
              username <strong>{staffSignInId(user) ?? "—"}</strong> at /admin/login
            </>
          )}
          .
        </p>
        <Input
          label={isPlayer ? PASSWORD_FIELD_LABEL : "New password (min 8 characters)"}
          type="password"
          value={password}
          maxLength={isPlayer ? PASSWORD_MAX : undefined}
          onChange={(e) => setPassword(e.target.value)}
        />
        {isPlayer ? <PasswordStrengthHint length={password.length} /> : null}
        {pwCheck && !pwCheck.ok ? (
          <p className="text-xs text-rose-300">{pwCheck.message}</p>
        ) : null}
        <Button className="w-full" onClick={() => void submit()} disabled={busy || !password}>
          {busy ? "Updating…" : "Set new password"}
        </Button>
      </div>
    </Modal>
  );
}
