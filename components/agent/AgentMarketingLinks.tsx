"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import {
  Copy,
  ExternalLink,
  Link2,
  LogIn,
  MessageCircle,
  Smartphone,
  QrCode,
} from "lucide-react";
import { buildAgentLinks, staffLoginUrl } from "@/lib/agentLinks";
import {
  AGENT_QR_USE_EXAMPLES,
  agentSignupShareMessage,
  smsShareUrl,
  whatsAppShareUrl,
} from "@/lib/agentShare";
import { ReferralQrCode } from "@/components/shared/ReferralQrCode";
import { Card } from "@/components/ui";

type Props = {
  slug: string;
  agentName?: string;
  compact?: boolean;
  /** Show agent staff login hint (for new sub-agents). */
  showStaffLogin?: boolean;
};

export function AgentMarketingLinks({ slug, agentName, compact, showStaffLogin }: Props) {
  const links = buildAgentLinks(slug);
  const loginUrl = staffLoginUrl();
  const displayName = agentName?.trim() || slug;
  const shareMessage = agentSignupShareMessage({
    agentName: displayName,
    signupUrl: links.signupUrl,
  });
  const [copied, setCopied] = useState<"sub" | "ref" | "login" | "msg" | null>(null);

  async function copy(text: string, which: "sub" | "ref" | "login" | "msg") {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    toast.success("Copied!");
    setTimeout(() => setCopied(null), 2000);
  }

  if (compact) {
    return (
      <Card className="border-emerald-500/25 bg-emerald-500/5 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <ReferralQrCode
            value={links.signupUrl}
            label={`Scan — ${links.slug}`}
            size={120}
            downloadFileName={`betese-${slug}-qr`}
            showDownload
          />
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            <p className="font-medium text-emerald-200">Share your signup QR</p>
            <p className="text-xs text-slate-400">
              Customers scan to register under you — use WhatsApp or SMS below.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={whatsAppShareUrl(shareMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-2 text-xs font-semibold text-white hover:brightness-110"
              >
                <MessageCircle size={14} /> WhatsApp
              </a>
              <a
                href={smsShareUrl(shareMessage)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5"
              >
                <Smartphone size={14} /> SMS
              </a>
              <button
                type="button"
                onClick={() => copy(links.signupUrl, "sub")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10"
              >
                <Copy size={14} /> {copied === "sub" ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-emerald-500/30 bg-emerald-500/5">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-lg bg-emerald-500/15 p-2">
          <QrCode size={22} className="text-emerald-300" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">
            {agentName ? `${agentName}'s signup QR & links` : "Your signup QR & links"}
          </p>
          <p className="mt-1 text-sm text-slate-300">
            Every person who scans or opens your link registers as <strong>your customer</strong>{" "}
            — you earn commission on their play.
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-6 rounded-xl border border-emerald-500/20 bg-slate-950/40 p-4 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-3">
          <ReferralQrCode
            value={links.signupUrl}
            label="Main signup QR (recommended)"
            size={168}
            downloadFileName={`betese-${slug}-signup-qr`}
            showDownload
          />
          <code className="text-center text-xs text-emerald-200">{links.signupUrl.replace(/^https?:\/\//, "")}</code>
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              Why use the QR code?
            </p>
            <ul className="space-y-2 text-sm text-slate-300">
              {AGENT_QR_USE_EXAMPLES.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="text-emerald-400">•</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              Share via WhatsApp or SMS
            </p>
            <p className="mb-3 rounded-lg bg-slate-900/80 px-3 py-2 text-xs leading-relaxed text-slate-400">
              {shareMessage}
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={whatsAppShareUrl(shareMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110"
              >
                <MessageCircle size={16} /> Share on WhatsApp
              </a>
              <a
                href={smsShareUrl(shareMessage)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-white/5"
              >
                <Smartphone size={16} /> Send SMS
              </a>
              <button
                type="button"
                onClick={() => copy(shareMessage, "msg")}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 px-4 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/10"
              >
                <Copy size={16} /> {copied === "msg" ? "Copied message" : "Copy message"}
              </button>
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            <strong className="text-slate-400">Where to find this:</strong> Agent Dashboard (top),
            My Customers page, and Admin → Users when your account is created.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Your signup link (recommended)
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="flex-1 overflow-x-auto rounded-lg bg-slate-950/70 px-3 py-2 text-sm text-emerald-200">
                {links.signupUrl}
              </code>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => copy(links.signupUrl, "sub")}
                  className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  <Copy size={14} /> {copied === "sub" ? "Copied" : "Copy"}
                </button>
                <a
                  href={links.signupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
                >
                  <ExternalLink size={14} /> Open
                </a>
              </div>
            </div>
            <p className="mt-1 text-[10px] text-slate-600">
              Example: customer opens <strong>beteseaviator.com/{slug}</strong> → signs up → you get
              credit.
            </p>
          </div>

          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Legacy subdomain (still works)
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="flex-1 overflow-x-auto rounded-lg bg-slate-950/70 px-3 py-2 text-xs text-slate-400">
                {links.subdomainUrl}
              </code>
              <button
                type="button"
                onClick={() => copy(links.subdomainUrl, "ref")}
                className="flex items-center justify-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 hover:bg-white/5"
              >
                <Copy size={14} /> Copy
              </button>
            </div>
          </div>

          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Referral link (main website)
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="flex-1 overflow-x-auto rounded-lg bg-slate-950/70 px-3 py-2 text-xs text-slate-300 sm:text-sm">
                {links.referralUrl}
              </code>
              <button
                type="button"
                onClick={() => copy(links.referralUrl, "ref")}
                className="flex items-center justify-center gap-1 rounded-lg border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10"
              >
                <Copy size={14} /> {copied === "ref" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {showStaffLogin ? (
            <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-sky-300">
                <LogIn size={12} /> Agent dashboard login
              </p>
              <p className="mb-2 text-[11px] text-slate-400">
                For you to sign in — not for customer signup.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="flex-1 overflow-x-auto rounded-lg bg-slate-950/70 px-3 py-2 text-xs text-sky-200">
                  {loginUrl}
                </code>
                <button
                  type="button"
                  onClick={() => copy(loginUrl, "login")}
                  className="flex items-center justify-center gap-1 rounded-lg border border-sky-500/40 px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/10"
                >
                  <Copy size={14} /> {copied === "login" ? "Copied" : "Copy login"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <ReferralQrCode
          value={links.referralUrl}
          label="Alternate QR — main site link"
          size={120}
          downloadFileName={`betese-${slug}-referral-qr`}
          showDownload
        />
      </div>
    </Card>
  );
}
