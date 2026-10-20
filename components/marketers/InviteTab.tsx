"use client";

import { useRef, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { PRODUCT_LABEL, type ApprovedLink, type MkState } from "@/lib/marketersApi";
import { Btn, H2, Notice, Panel } from "./ui";

function LinkCard({ link }: { link: ApprovedLink }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<"" | "ok" | "manual">("");

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

  return (
    <Panel className="space-y-3">
      <div>
        <p className="font-bold text-[#0b2a5b]">{link.label}</p>
        <p className="text-xs text-slate-500">{PRODUCT_LABEL[link.product]} sign-up website</p>
      </div>
      <input
        ref={inputRef}
        readOnly
        value={link.url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label={`${link.label} link`}
        className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900"
      />
      <div className="grid grid-cols-2 gap-2">
        <Btn onClick={() => void copy()}>
          <Copy className="h-4 w-4" aria-hidden /> Copy link
        </Btn>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          <ExternalLink className="h-4 w-4" aria-hidden /> Open website
        </a>
      </div>
      <p aria-live="polite" className="text-xs text-emerald-700">
        {copied === "ok" ? "Copied. Paste it in the chat you choose." : copied === "manual" ? "Link selected — copy it from your keyboard menu." : ""}
      </p>
    </Panel>
  );
}

export function InviteTab({ state }: { state: MkState }) {
  return (
    <div className="space-y-4">
      <H2>Invite customers</H2>
      <div className="grid gap-3 sm:grid-cols-2">
        {state.links.map((l) => (
          <LinkCard key={l.id} link={l} />
        ))}
      </div>
      <Notice>
        Share the link any way you like, or help the customer open it on their own phone. Copying never sends a message or creates an
        account. The customer sets their own password and codes — never ask for them.
      </Notice>
      <Notice tone="amber">
        These standard links do not track who referred the customer. After they sign up, add them under Customers so the system can
        verify the registration.
      </Notice>
    </div>
  );
}
