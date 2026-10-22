"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, MessageCircle, Share2 } from "lucide-react";
import { mk, mkError, PRODUCT_LABEL, type MkState } from "@/lib/marketersApi";
import { SignupActions } from "./SignupActions";
import { Btn, ErrorLine, Field, H2, Notice, Panel, TextInput } from "./ui";

export function shareMessage(url: string): string {
  return `Join Betese — Football and Aviator. Open my link to sign up: ${url}`;
}

/** The marketer's own link (/join/<first-name>-xxxx). Copy, share or WhatsApp it — nothing is sent automatically. */
function MyShareLink() {
  const [link, setLink] = useState<{ url: string; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    mk<{ url: string; note: string }>("myShareLink").then(
      (x) => live && setLink(x),
      (e) => live && setError(mkError(e)),
    );
    return () => {
      live = false;
    };
  }, []);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setMsg("Copied. Paste it in the chat you choose.");
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      setMsg(ok ? "Copied. Paste it in the chat you choose." : "Link selected — copy it from your keyboard menu.");
    }
  };
  const share = async () => {
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join Betese", text: shareMessage(link.url).replace(` ${link.url}`, ""), url: link.url });
      } catch {
        /* cancelled */
      }
    } else void copy();
  };

  const linkBtn =
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50";

  return (
    <Panel className="space-y-3">
      <div>
        <p className="font-bold text-[#0b2a5b]">My share link</p>
        <p className="text-xs text-slate-500">Your own link with your name. It opens a Betese page with Football and Aviator sign-up buttons.</p>
      </div>
      {link ? (
        <>
          <input
            ref={inputRef}
            readOnly
            value={link.url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="My share link"
            className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900"
          />
          <div className="grid grid-cols-3 gap-2">
            <Btn onClick={() => void copy()}>
              <Copy className="h-4 w-4" aria-hidden /> Copy
            </Btn>
            <Btn variant="secondary" onClick={() => void share()}>
              <Share2 className="h-4 w-4" aria-hidden /> Share
            </Btn>
            <a href={`https://wa.me/?text=${encodeURIComponent(shareMessage(link.url))}`} target="_blank" rel="noopener noreferrer" className={linkBtn}>
              <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
            </a>
          </div>
          <p aria-live="polite" className="text-xs text-emerald-700">
            {msg}
          </p>
          <p className="text-xs text-slate-500">{link.note}</p>
        </>
      ) : error ? (
        <ErrorLine message={error} />
      ) : (
        <p className="text-sm text-slate-500">Loading your link…</p>
      )}
    </Panel>
  );
}

export function InviteTab({ state, phone, setPhone }: { state: MkState; phone: string; setPhone: (v: string) => void }) {
  return (
    <div className="space-y-4">
      <H2>Invite customers</H2>
      {state.me.role === "marketer" && <MyShareLink />}
      <Panel>
        <Field label="Customer phone number" hint="Needed to send the link by WhatsApp or SMS. Gambian mobile, e.g. 3XXXXXX or +220 87X XXX XXX">
          <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="off" />
        </Field>
      </Panel>
      <div className="grid gap-3 sm:grid-cols-2">
        {state.links.map((l) => (
          <Panel key={l.id} className="space-y-3">
            <div>
              <p className="font-bold text-[#0b2a5b]">{l.label}</p>
              <p className="text-xs text-slate-500">{PRODUCT_LABEL[l.product]} sign-up website</p>
            </div>
            <SignupActions link={l} phone={phone} />
          </Panel>
        ))}
      </div>
      <Notice>
        You can help the customer open the website, but they type their own password and verification codes — never ask for them.
        Opening, copying or sending a link does not create an account or mark the customer as verified.
      </Notice>
      <Notice tone="amber">
        Links do not prove who referred the customer — not even your share link. Add the customer under Customers first, then share the
        link: a signup after you record the number is verified as yours. Signups recorded afterwards go to the owner for review.
      </Notice>
    </div>
  );
}
