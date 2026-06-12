"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Copy, LogIn, UserCircle2, ExternalLink } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useAuthModal } from "@/lib/auth-modal-context";
import { errorMessage } from "@/lib/api";
import { phoneToEmail } from "@/lib/format";
import { DEMO_ACCOUNTS, type DemoAccount } from "@/lib/games/lobbyMeta";

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Could not copy");
  }
}

export function DemoAccountsPanel() {
  const { openAuth } = useAuthModal();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function quickLogin(account: DemoAccount) {
    setBusyId(account.id);
    try {
      await signInWithEmailAndPassword(auth, phoneToEmail(account.login), account.password);
      toast.success(`Welcome, ${account.label}! Pick a game to bet.`);
    } catch (e) {
      toast.error(errorMessage(e));
      openAuth("login");
    } finally {
      setBusyId(null);
    }
  }

  const customers = DEMO_ACCOUNTS.filter((a) => a.role === "Customer");

  return (
    <section className="rounded-2xl border border-[color-mix(in_srgb,var(--lobby-accent)_15%,transparent)] bg-[#111] p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-emerald-400">
            Customer demo
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">Try betting like a real player</h2>
          <p className="mt-1 max-w-xl text-sm text-slate-400">
            One-click demo login or sign in manually with phone + password. All demo wallets use
            play money (GMD).
          </p>
        </div>
        <button
          type="button"
          onClick={() => openAuth("login")}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          <LogIn size={16} /> Manual sign in
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {customers.map((account) => (
          <div
            key={account.id}
            className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"
          >
            <div className="flex items-center gap-2">
              <UserCircle2 size={20} className="text-emerald-400" />
              <div>
                <p className="font-bold text-white">{account.label}</p>
                <p className="text-xs text-slate-400">{account.description}</p>
              </div>
            </div>

            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/60 px-3 py-2">
                <div>
                  <dt className="text-[10px] uppercase text-slate-500">{account.loginHint}</dt>
                  <dd className="font-mono font-bold text-white">{account.login}</dd>
                </div>
                <button
                  type="button"
                  onClick={() => copyText(account.login, "Phone")}
                  className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
                  aria-label="Copy login"
                >
                  <Copy size={14} />
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-950/60 px-3 py-2">
                <div>
                  <dt className="text-[10px] uppercase text-slate-500">Password</dt>
                  <dd className="font-mono font-bold text-white">{account.password}</dd>
                </div>
                <button
                  type="button"
                  onClick={() => copyText(account.password, "Password")}
                  className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
                  aria-label="Copy password"
                >
                  <Copy size={14} />
                </button>
              </div>
              {account.balance && (
                <p className="text-xs font-semibold text-emerald-300">Balance: {account.balance}</p>
              )}
            </dl>

            <button
              type="button"
              disabled={busyId === account.id}
              onClick={() => quickLogin(account)}
              className="mt-3 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-black uppercase tracking-wide text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-60"
            >
              {busyId === account.id ? "Signing in…" : "One-click demo login"}
            </button>
          </div>
        ))}
      </div>

      <details className="mt-4 rounded-xl border border-white/5 bg-slate-950/40 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-300">
          Agent demo accounts (separate login)
        </summary>
        <p className="mt-2 text-xs text-slate-500">
          Agents sign in on their own dashboard — not from the player lobby.
        </p>
        <ul className="mt-3 space-y-2 text-sm text-slate-400">
          {DEMO_ACCOUNTS.filter((a) => a.role.includes("agent")).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong className="text-slate-200">{a.label}</strong> — login{" "}
                <code className="rounded bg-slate-800 px-1.5 py-0.5 text-emerald-300">{a.login}</code>{" "}
                / password <code className="rounded bg-slate-800 px-1.5 py-0.5">password</code>
              </span>
            </li>
          ))}
        </ul>
        <Link
          href="/admin/login"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-sky-400 hover:text-sky-300"
        >
          Open staff sign in <ExternalLink size={12} />
        </Link>
      </details>
    </section>
  );
}
