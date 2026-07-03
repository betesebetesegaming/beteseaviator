"use client";

import Link from "next/link";
import { QrCode, UserPlus, Users, Wallet } from "lucide-react";
import { Card } from "@/components/ui";

const STEPS = [
  {
    icon: QrCode,
    title: "1. Share your link",
    body: "Share beteseaviator.com/agent/yourname (first name or full name) — your customers earn you GGR commission.",
    color: "text-emerald-300",
  },
  {
    icon: UserPlus,
    title: "2. Customers join",
    body: "They register from your marketing link, or you add them under My Customers after admin opened your account.",
    color: "text-sky-300",
  },
  {
    icon: Wallet,
    title: "3. Fund & support",
    body: "Deposit from your float or use Cash desk (if admin enabled) when they pay at the shop.",
    color: "text-amber-300",
  },
] as const;

/** Three-step guide for agent marketers on the dashboard. */
export function AgentQuickStart() {
  return (
    <Card className="border-white/10 bg-slate-900/50 p-4">
      <div className="mb-4 flex items-center gap-2">
        <Users size={18} className="text-emerald-400" />
        <h2 className="font-semibold text-white">Your marketing workflow</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {STEPS.map((step) => (
          <div
            key={step.title}
            className="rounded-xl border border-white/10 bg-slate-950/50 p-3"
          >
            <step.icon size={20} className={`mb-2 ${step.color}`} />
            <p className="text-sm font-semibold text-white">{step.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{step.body}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">
        Need help?{" "}
        <Link href="/admin/customers" className="text-emerald-400 hover:underline">
          My Customers
        </Link>
        {" · "}
        <Link href="/admin/operations" className="text-emerald-400 hover:underline">
          Operations
        </Link>
      </p>
    </Card>
  );
}
