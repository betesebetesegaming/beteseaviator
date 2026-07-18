"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  MessageCircle,
  Smartphone,
} from "lucide-react";
import { buildAgentLinks, SITE_ORIGIN } from "@/lib/agentLinks";
import {
  agentSignupShareMessage,
  customerAccountReadyMessage,
  customerPlayUrl,
  smsShareUrl,
  whatsAppShareUrl,
} from "@/lib/agentShare";
import { formatPhoneDisplay } from "@/lib/phone";
import { ShareLinkPanel } from "@/components/shared/ShareLinkPanel";
import { Button, Modal } from "@/components/ui";

type Props = {
  open: boolean;
  onClose: () => void;
  customerName: string;
  playerId: string;
  phone: string;
  /** Shown once so the agent can share login details — cleared when modal closes. */
  password?: string;
  agentSlug?: string | null;
  agentName?: string;
};

function DetailRow({
  label,
  value,
  mono,
  secret,
  reveal,
  onToggleReveal,
  onCopy,
}: {
  label: string;
  value: string;
  mono?: boolean;
  secret?: boolean;
  reveal?: boolean;
  onToggleReveal?: () => void;
  onCopy: () => void;
}) {
  const display = secret && !reveal ? "•".repeat(Math.min(value.length, 10)) : value;
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
        <p
          className={`mt-0.5 break-all text-sm font-semibold text-white ${mono ? "font-mono tabular-nums" : ""}`}
        >
          {display}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {secret && onToggleReveal ? (
          <button
            type="button"
            onClick={onToggleReveal}
            className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"
            aria-label={reveal ? "Hide password" : "Show password"}
          >
            {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onCopy}
          className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-emerald-300"
          aria-label={`Copy ${label}`}
        >
          <Copy size={14} />
        </button>
      </div>
    </div>
  );
}

/** Shown after an agent successfully registers a customer — credentials + share. */
export function CustomerCreatedSuccess({
  open,
  onClose,
  customerName,
  playerId,
  phone,
  password = "",
  agentSlug,
  agentName,
}: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const links = agentSlug ? buildAgentLinks(agentSlug) : null;
  const playUrl = customerPlayUrl();
  const phoneDisplay = formatPhoneDisplay(phone);

  const readyMessage = useMemo(
    () =>
      customerAccountReadyMessage({
        phone,
        password,
        playerId,
        playUrl,
        agentLink: links?.signupUrl ?? null,
        agentName: agentName ?? null,
      }),
    [phone, password, playerId, playUrl, links?.signupUrl, agentName]
  );

  async function copyText(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  }

  return (
    <Modal open={open} onClose={onClose} title="Account opened">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={22} />
          <div>
            <p className="font-semibold text-white">{customerName}&apos;s account is ready</p>
            <p className="mt-1 text-xs text-slate-400">
              Share the details below with the customer now. The password is shown only once.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300/90">
            Customer login details
          </p>
          <DetailRow
            label="Login phone"
            value={phoneDisplay}
            mono
            onCopy={() => void copyText(phoneDisplay, "Phone")}
          />
          {password ? (
            <DetailRow
              label="Password"
              value={password}
              mono
              secret
              reveal={showPassword}
              onToggleReveal={() => setShowPassword((v) => !v)}
              onCopy={() => void copyText(password, "Password")}
            />
          ) : null}
          <DetailRow
            label="Player ID"
            value={playerId}
            mono
            onCopy={() => void copyText(playerId, "Player ID")}
          />
          <DetailRow
            label="Play here"
            value={playUrl.replace(/^https?:\/\//, "")}
            onCopy={() => void copyText(playUrl, "Play link")}
          />
          {links ? (
            <DetailRow
              label="Agent link"
              value={links.signupUrl.replace(/^https?:\/\//, "")}
              onCopy={() => void copyText(links.signupUrl, "Agent link")}
            />
          ) : null}
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            Message preview
          </p>
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-black/40 p-3 text-xs leading-relaxed text-slate-200">
            {readyMessage}
          </pre>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <a
              href={whatsAppShareUrl(readyMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-emerald-500"
            >
              <MessageCircle size={14} /> WhatsApp
            </a>
            <a
              href={smsShareUrl(readyMessage, phone)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-white/10"
            >
              <Smartphone size={14} /> SMS
            </a>
            <button
              type="button"
              onClick={() => void copyText(readyMessage, "Account details")}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-white/10"
            >
              <Copy size={14} /> Copy details
            </button>
          </div>
          <a
            href={playUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10"
          >
            <ExternalLink size={14} /> Open play page ({SITE_ORIGIN.replace(/^https?:\/\//, "")})
          </a>
        </div>

        {links ? (
          <ShareLinkPanel
            compact
            accent="emerald"
            title="Share your signup link too"
            subtitle="More customers can still join you online — same as your shop QR."
            url={links.signupUrl}
            shareMessage={agentSignupShareMessage({
              agentName: agentName ?? agentSlug ?? "Agent",
              signupUrl: links.signupUrl,
            })}
            qrLabel={`Scan — ${links.slug}`}
            downloadFileName={`betese-${links.slug}-qr`}
          />
        ) : null}

        <Button className="w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
