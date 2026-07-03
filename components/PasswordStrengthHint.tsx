"use client";

import { passwordStrength, passwordStrengthHint, PASSWORD_HELP } from "@/lib/passwordPolicy";

type Props = {
  length: number;
  className?: string;
};

export function PasswordStrengthHint({ length, className = "" }: Props) {
  const strength = passwordStrength(length);
  const color =
    strength === "low"
      ? "text-amber-300"
      : strength === "strong"
        ? "text-emerald-300"
        : strength === "strongest"
          ? "text-sky-300"
          : "text-slate-500";

  return (
    <p className={`text-xs ${color} ${className}`}>
      {length > 0 ? passwordStrengthHint(length) : PASSWORD_HELP}
    </p>
  );
}
