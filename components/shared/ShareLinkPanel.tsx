"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Copy, ExternalLink, MessageCircle, QrCode, Smartphone } from "lucide-react";
import { smsShareUrl, whatsAppShareUrl } from "@/lib/shareChannels";
import { ReferralQrCode } from "@/components/shared/ReferralQrCode";
import { Card } from "@/components/ui";

type Accent = "emerald" | "violet" | "sky";

const ACCENT: Record<
  Accent,
  { border: string; bg: string; icon: string; title: string; link: string; btn: string }
> = {
  emerald: {
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/5",
    icon: "text-emerald-300",
    title: "text-emerald-300",
    link: "text-emerald-200",
    btn: "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10",
  },
  violet: {
    border: "border-violet-500/30",
    bg: "bg-violet-500/5",
    icon: "text-violet-300",
    title: "text-violet-300",
    link: "text-violet-200",
    btn: "border-violet-500/40 text-violet-300 hover:bg-violet-500/10",
  },
  sky: {
    border: "border-sky-500/30",
    bg: "bg-sky-500/5",
    icon: "text-sky-300",
    title: "text-sky-300",
    link: "text-sky-200",
    btn: "border-sky-500/40 text-sky-300 hover:bg-sky-500/10",
  },
};

export type ShareLinkPanelProps = {
  title: string;
  subtitle: string;
  url: string;
  shareMessage: string;
  qrLabel: string;
  downloadFileName: string;
  examples?: readonly string[];
  code?: string;
  codeLabel?: string;
  compact?: boolean;
  accent?: Accent;
};

export function ShareLinkPanel({
  title,
  subtitle,
  url,
  shareMessage,
  qrLabel,
  downloadFileName,
  examples,
  code,
  codeLabel = "Your code",
  compact,
  accent = "emerald",
}: ShareLinkPanelProps) {
  const theme = ACCENT[accent];
  const [copied, setCopied] = useState<"link" | "msg" | null>(null);

  async function copy(text: string, which: "link" | "msg") {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    toast.success("Copied!");
    setTimeout(() => setCopied(null), 2000);
  }

  if (compact) {
    return (
      <Card className={`${theme.border} ${theme.bg} p-4`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <ReferralQrCode
            value={url}
            label={qrLabel}
            size={120}
            downloadFileName={downloadFileName}
            showDownload
          />
          <div className="min-w-0 flex-1 space-y-2">
            <p className={`text-sm font-semibold ${theme.title}`}>{title}</p>
            <p className="text-xs text-slate-400">{subtitle}</p>
            <ShareButtons
              url={url}
              shareMessage={shareMessage}
              copied={copied}
              onCopy={copy}
              theme={theme}
              size="sm"
            />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`${theme.border} ${theme.bg}`}>
      <div className="mb-4 flex items-start gap-3">
        <div className={`rounded-lg p-2 ${theme.bg}`}>
          <QrCode size={22} className={theme.icon} />
        </div>
        <div>
          <p className={`text-xs font-bold uppercase tracking-widest ${theme.title}`}>{title}</p>
          <p className="mt-1 text-sm text-slate-300">{subtitle}</p>
        </div>
      </div>

      <div className="mb-5 grid gap-6 rounded-xl border border-white/10 bg-slate-950/40 p-4 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-2">
          <ReferralQrCode
            value={url}
            label={qrLabel}
            size={168}
            downloadFileName={downloadFileName}
            showDownload
          />
          {code ? (
            <p className="text-center text-xs text-slate-400">
              {codeLabel}: <span className="font-mono font-semibold text-white">{code}</span>
            </p>
          ) : null}
        </div>

        <div className="space-y-4">
          {examples && examples.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                How to share
              </p>
              <ul className="space-y-2 text-sm text-slate-300">
                {examples.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className={theme.icon}>•</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
              Your link
            </p>
            <code
              className={`mb-3 block overflow-x-auto rounded-lg bg-slate-950/70 px-3 py-2 text-sm ${theme.link}`}
            >
              {url}
            </code>
            <p className="mb-3 rounded-lg bg-slate-900/80 px-3 py-2 text-xs leading-relaxed text-slate-400">
              {shareMessage}
            </p>
            <ShareButtons
              url={url}
              shareMessage={shareMessage}
              copied={copied}
              onCopy={copy}
              theme={theme}
              size="md"
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

function ShareButtons({
  url,
  shareMessage,
  copied,
  onCopy,
  theme,
  size,
}: {
  url: string;
  shareMessage: string;
  copied: "link" | "msg" | null;
  onCopy: (text: string, which: "link" | "msg") => void;
  theme: (typeof ACCENT)[Accent];
  size: "sm" | "md";
}) {
  const pad = size === "sm" ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm";
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={whatsAppShareUrl(shareMessage)}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-2 rounded-lg bg-[#25D366] font-semibold text-white hover:brightness-110 ${pad}`}
      >
        <MessageCircle size={size === "sm" ? 14 : 16} /> WhatsApp
      </a>
      <a
        href={smsShareUrl(shareMessage)}
        className={`inline-flex items-center gap-2 rounded-lg border border-white/15 bg-slate-900 font-semibold text-slate-100 hover:bg-white/5 ${pad}`}
      >
        <Smartphone size={size === "sm" ? 14 : 16} /> SMS
      </a>
      <button
        type="button"
        onClick={() => onCopy(url, "link")}
        className={`inline-flex items-center gap-2 rounded-lg border font-semibold ${theme.btn} ${pad}`}
      >
        <Copy size={size === "sm" ? 14 : 16} /> {copied === "link" ? "Copied" : "Copy link"}
      </button>
      <button
        type="button"
        onClick={() => onCopy(shareMessage, "msg")}
        className={`inline-flex items-center gap-2 rounded-lg border border-white/10 font-semibold text-slate-300 hover:bg-white/5 ${pad}`}
      >
        <Copy size={size === "sm" ? 14 : 16} /> {copied === "msg" ? "Copied" : "Copy message"}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-2 rounded-lg border border-white/10 font-semibold text-slate-400 hover:bg-white/5 ${pad}`}
      >
        <ExternalLink size={size === "sm" ? 14 : 16} /> Open
      </a>
    </div>
  );
}
