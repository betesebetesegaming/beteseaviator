"use client";

import { useRef, useState } from "react";
import { Copy, ExternalLink, MessageCircle, MessageSquare } from "lucide-react";
import { normalizePhoneE164 } from "@/lib/phone";
import { PRODUCT_LABEL, type ApprovedLink } from "@/lib/marketersApi";
import { Btn } from "./ui";

export function signupMessage(url: string): string {
  return `Welcome to Betese! Use this link to create your account: ${url}`;
}

/**
 * Sign up / Copy link / Send to customer for one approved link.
 * Nothing here calls the server: opening or sharing a link never records or verifies a customer,
 * and "Send" only opens WhatsApp or the SMS app with the text filled in — the marketer presses Send there.
 */
export function SignupActions({ link, phone }: { link: ApprovedLink; phone: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<"" | "ok" | "manual">("");
  const e164 = phone.trim() ? normalizePhoneE164(phone) : null;
  const text = signupMessage(link.url);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied("ok");
    } catch {
      // Older phones / http: select the text so the user can copy it by hand.
      inputRef.current?.focus();
      inputRef.current?.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      setCopied(ok ? "ok" : "manual");
    }
  };

  const linkBtn =
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50";
  const off = "pointer-events-none opacity-50";

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        readOnly
        value={link.url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={`${link.label} link`}
        className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900"
      />
      <div className="grid grid-cols-2 gap-2">
        <a href={link.url} target="_blank" rel="noopener noreferrer" className={linkBtn}>
          <ExternalLink className="h-4 w-4" aria-hidden /> Sign up
        </a>
        <Btn variant="secondary" onClick={() => void copy()}>
          <Copy className="h-4 w-4" aria-hidden /> Copy link
        </Btn>
      </div>
      <p className="text-xs font-semibold text-slate-600">Send to customer</p>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={e164 ? `https://wa.me/${e164.slice(1)}?text=${encodeURIComponent(text)}` : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!e164}
          className={`${linkBtn} ${e164 ? "" : off}`}
        >
          <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
        </a>
        <a href={e164 ? `sms:${e164}?body=${encodeURIComponent(text)}` : undefined} aria-disabled={!e164} className={`${linkBtn} ${e164 ? "" : off}`}>
          <MessageSquare className="h-4 w-4" aria-hidden /> SMS
        </a>
      </div>
      <p aria-live="polite" className="text-xs text-slate-500">
        {copied === "ok" ? (
          <span className="text-emerald-700">Copied. Paste it in the chat you choose.</span>
        ) : copied === "manual" ? (
          <span className="text-emerald-700">Link selected — copy it from your keyboard menu.</span>
        ) : !phone.trim() ? (
          "Enter the customer's phone number to send the link."
        ) : !e164 ? (
          <span className="text-red-700">That phone number doesn&apos;t look right.</span>
        ) : (
          `Opens your app with the ${PRODUCT_LABEL[link.product]} invitation ready. Check it, then press Send.`
        )}
      </p>
    </div>
  );
}
