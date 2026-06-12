"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

type Props = {
  badge: string;
  badgeColor?: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function StaffLoginShell({
  badge,
  badgeColor = "text-emerald-400",
  title,
  subtitle,
  children,
  footer,
}: Props) {
  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(16,185,129,0.15),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_75%,rgba(56,189,248,0.06),transparent_40%)]"
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo height={36} />
          <p className={`mt-4 text-xs font-black uppercase tracking-[0.25em] ${badgeColor}`}>
            {badge}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white">{title}</h1>
          <p className="mt-2 max-w-sm text-sm text-slate-400">{subtitle}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
          {children}
        </div>

        <div className="mt-6 space-y-3 text-center text-xs text-slate-500">
          {footer}
          <p>
            Players register and bet at{" "}
            <Link href="/play" className="font-semibold text-emerald-400 hover:text-emerald-300">
              beteseaviator.com/play
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
