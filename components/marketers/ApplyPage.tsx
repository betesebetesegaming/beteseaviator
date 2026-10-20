"use client";

import { useEffect, useState, type FormEvent } from "react";
import { mk, mkError, money, type Tier } from "@/lib/marketersApi";
import { emptyProposal, proposalPayload, ProposalFields, QUALIFYING_SUMMARY, type ProposalDraft } from "./ProposalFields";
import { Btn, ErrorLine, Field, H2, Loading, Notice, Panel, TextArea, TextInput } from "./ui";

interface Info {
  open: boolean;
  tiers: Tier[];
  tiersConfigured: boolean;
  inviteValid: boolean | null;
}

/** Public "Become a Marketer" application. Submitting only creates a pending proposal for the owner. */
export function ApplyPage() {
  const [invite, setInvite] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [draft, setDraft] = useState<ProposalDraft>(emptyProposal);
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ reference: string; estimatePerPeriodMinor: number; conditions: string[] } | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("invite");
    let live = true;
    mk<Info>("applicationInfo", { invite: code || undefined }).then(
      (i) => {
        if (!live) return;
        setInvite(code);
        setInfo(i);
      },
      (e) => live && setError(mkError(e)),
    );
    return () => {
      live = false;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!draft.products.length) return setError("Choose Football, Aviator or both.");
    setBusy(true);
    try {
      setDone(await mk("apply", { name, phone, note, consent, invite: invite || undefined, ...proposalPayload(draft) }));
    } catch (err) {
      setError(mkError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 overflow-y-auto bg-slate-100 text-slate-900">
      <header className="bg-[#0b2a5b] px-4 py-3 text-white">
        <p className="mx-auto max-w-xl text-sm font-extrabold tracking-wide">BETESE MARKETERS</p>
      </header>
      <main className="mx-auto max-w-xl space-y-4 px-4 py-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0b2a5b]">Become a Marketer</h1>
          <p className="text-sm text-slate-600">Propose your target and the commission you would like. The owner reviews every application.</p>
        </div>
        {!info ? (
          error ? <ErrorLine message={error} /> : <Loading />
        ) : done ? (
          <Panel className="space-y-3">
            <H2>Application sent</H2>
            <p>
              Your reference is <strong className="font-mono">{done.reference}</strong>. The owner will contact you on the phone number you gave.
            </p>
            <Notice>
              Your application is <strong>pending</strong>. Nothing is active yet: if it is approved you will receive a sign-in, then you read and accept the
              final agreement before any earning starts.
            </Notice>
            <p className="text-sm text-slate-600">Estimate per period at your requested rate: {money(done.estimatePerPeriodMinor)} (estimate only).</p>
          </Panel>
        ) : !info.open ? (
          <Notice tone="amber">Applications are closed at the moment. Please check back later.</Notice>
        ) : (
          <Panel>
            <form onSubmit={submit} className="space-y-3">
              {info.inviteValid === true && <Notice tone="green">You were invited by a Betese marketer.</Notice>}
              {info.inviteValid === false && <Notice tone="amber">This invitation link is not recognised. You can still apply.</Notice>}
              <Field label="Full name">
                <TextInput value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} autoComplete="name" />
              </Field>
              <Field label="Phone number" hint="Gambian mobile. The owner will contact you on this number.">
                <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" autoComplete="tel" />
              </Field>
              <ProposalFields value={draft} onChange={setDraft} tiers={info.tiers} />
              <details className="rounded-lg border border-slate-200 p-3 text-sm" open>
                <summary className="cursor-pointer font-semibold">Which customers and deposits qualify</summary>
                <ul className="ml-5 mt-2 list-disc space-y-1 text-slate-700">
                  {QUALIFYING_SUMMARY.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </details>
              <Field label="Anything else? (optional)">
                <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-emerald-600" />
                <span>I agree that Betese may contact me about this application and keep these details to review it.</span>
              </label>
              <ErrorLine message={error} />
              <Btn type="submit" disabled={busy} className="w-full">
                {busy ? "Sending…" : "Send application"}
              </Btn>
              <p className="text-center text-xs text-slate-500">Sending does not create an account or a betting wallet. Never share passwords or codes.</p>
            </form>
          </Panel>
        )}
      </main>
    </div>
  );
}
