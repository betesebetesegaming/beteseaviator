"use client";

import { useEffect, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { X } from "lucide-react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-white/10 bg-slate-900/70 p-5 ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-bold text-white">{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </div>
      {icon && <div className="text-emerald-400">{icon}</div>}
    </Card>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "success";

const buttonStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400",
  success:
    "bg-green-500 text-slate-950 hover:bg-green-400 disabled:bg-slate-700 disabled:text-slate-400",
  secondary:
    "bg-slate-800 text-slate-100 hover:bg-slate-700 border border-white/10 disabled:opacity-50",
  danger: "bg-red-500/90 text-white hover:bg-red-500 disabled:opacity-50",
  ghost: "bg-transparent text-slate-300 hover:bg-white/5 disabled:opacity-50",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${buttonStyles[variant]} ${className}`}
    />
  );
}

export function Input({
  label,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const input = (
    <input
      {...props}
      className={`w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none ${className}`}
    />
  );
  if (!label) return input;
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-300">{label}</span>
      {input}
    </label>
  );
}

export function Select({
  label,
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const select = (
    <select
      {...props}
      className={`w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none ${className}`}
    >
      {children}
    </select>
  );
  if (!label) return select;
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-300">{label}</span>
      {select}
    </label>
  );
}

const badgeColors: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-300",
  won: "bg-emerald-500/15 text-emerald-300",
  paid: "bg-emerald-500/15 text-emerald-300",
  completed: "bg-emerald-500/15 text-emerald-300",
  approved: "bg-sky-500/15 text-sky-300",
  pending: "bg-amber-500/15 text-amber-300",
  suspended: "bg-red-500/15 text-red-300",
  rejected: "bg-red-500/15 text-red-300",
  failed: "bg-red-500/15 text-red-300",
  lost: "bg-slate-500/15 text-slate-300",
  cancelled: "bg-slate-500/15 text-slate-300",
  inactive: "bg-slate-500/15 text-slate-300",
  bonus: "bg-violet-500/15 text-violet-300",
};

export function Badge({ value }: { value: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${badgeColors[value] ?? "bg-slate-500/15 text-slate-300"}`}
    >
      {value.replace("_", " ")}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-[1px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="relative z-10 flex w-full max-w-md max-h-[min(92dvh,720px)] flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-2xl sm:max-h-[min(88dvh,680px)]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6 sm:py-4">
          <h3 id="modal-title" className="pr-8 text-base font-semibold leading-snug text-white sm:text-lg">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white sm:right-4 sm:top-4"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

export function Th({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2.5 text-sm text-slate-200 ${className}`}>{children}</td>;
}

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-900/70">
      <table className="w-full divide-y divide-white/10 [&_tbody_tr]:border-t [&_tbody_tr]:border-white/5">
        {children}
      </table>
    </div>
  );
}
