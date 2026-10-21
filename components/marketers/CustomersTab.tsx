"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  mk,
  mkError,
  dateTime,
  PRODUCT_LABEL,
  type AccountState,
  type ApprovedLink,
  type Contact,
  type Cursor,
  type MkState,
  type Product,
} from "@/lib/marketersApi";
import { SignupActions } from "./SignupActions";
import { Btn, Choice, Empty, ErrorLine, Field, H2, Loading, Notice, Panel, Tag, TextInput } from "./ui";

export interface CustomerDraft {
  name: string;
  phone: string;
  products: Product[];
  adult: boolean;
  consent: "" | "yes" | "no";
  marketerId: string;
}

export const emptyDraft = (): CustomerDraft => ({ name: "", phone: "", products: [], adult: false, consent: "", marketerId: "" });

/** Signup actions for each product the customer is recorded for (approved links only). */
function ProductSignupActions({ links, products, phone }: { links: ApprovedLink[]; products: Product[]; phone: string }) {
  const shown = links.filter((l) => products.includes(l.product));
  if (!shown.length) return <p className="text-sm text-slate-500">No approved signup link for this product yet.</p>;
  return (
    <div className="space-y-3">
      {shown.map((l) => (
        <div key={l.id} className="space-y-1">
          <p className="text-sm font-semibold text-[#0b2a5b]">{l.label}</p>
          <SignupActions link={l} phone={phone} />
        </div>
      ))}
    </div>
  );
}

function statusTag(a: AccountState | undefined) {
  if (!a) return null;
  if (a.state === "matched") {
    if (a.counted) return <Tag tone="green">Verified</Tag>;
    if (a.decision === "rejected") return <Tag tone="red">Not credited</Tag>;
    return <Tag tone="amber">Owner review needed</Tag>;
  }
  if (a.state === "not_found") return <Tag tone="slate">Not registered yet</Tag>;
  if (a.state === "ambiguous") return <Tag tone="amber">Needs owner check</Tag>;
  if (a.state === "unavailable") return <Tag tone="amber">Not connected</Tag>;
  return <Tag tone="slate">Pending check</Tag>;
}

function AddCustomer({
  state,
  draft,
  setDraft,
  onSaved,
  onClose,
}: {
  state: MkState;
  draft: CustomerDraft;
  setDraft: (fn: (d: CustomerDraft) => CustomerDraft) => void;
  onSaved: (c: Contact) => void;
  onClose: () => void;
}) {
  const owner = state.me.role === "owner";
  const { name, phone, products, adult, consent, marketerId } = draft;
  const set = <K extends keyof CustomerDraft>(k: K) => (v: CustomerDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setName = set("name");
  const setPhone = set("phone");
  const setAdult = set("adult");
  const setConsent = set("consent");
  const setMarketerId = set("marketerId");
  const [marketers, setMarketers] = useState<{ uid: string; name: string; status: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (owner) void mk<{ rows: typeof marketers }>("listMarketers").then((r) => setMarketers(r.rows.filter((m) => m.status === "active")));
  }, [owner]);

  const toggle = (p: Product) => setDraft((d) => ({ ...d, products: d.products.includes(p) ? d.products.filter((x) => x !== p) : [...d.products, p] }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!products.length) return setError("Choose Football, Aviator, or both.");
    if (!consent) return setError("Record the customer's SMS choice.");
    setBusy(true);
    try {
      const res = await mk<{ contact: Contact }>("createContact", {
        name,
        phone,
        products,
        adultConfirmed: adult,
        smsConsent: consent === "yes",
        marketerId: owner ? marketerId : undefined,
      });
      onSaved(res.contact);
    } catch (err) {
      setError(mkError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <form onSubmit={submit} className="space-y-3">
        <H2>Add customer</H2>
        <Notice>
          Record the number <strong>before</strong> the customer signs up — then their registration is verified as yours automatically.
          If they already have an account, the owner reviews it. Never ask for their password or code.
        </Notice>
        <Field label="Customer name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="off" />
        </Field>
        <Field label="Phone number" hint="Gambian mobile, e.g. 3XXXXXX or +220 87X XXX XXX">
          <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" autoComplete="off" />
        </Field>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-slate-700">Product they signed up for</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["football", "aviator"] as Product[]).map((p) => (
              <label
                key={p}
                className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 ${products.includes(p) ? "border-emerald-600 bg-emerald-50" : "border-slate-300 bg-white"}`}
              >
                <input type="checkbox" checked={products.includes(p)} onChange={() => toggle(p)} className="h-5 w-5 accent-emerald-600" />
                <span className="font-semibold">{PRODUCT_LABEL[p]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {owner && (
          <Field label="Marketer">
            <Choice value={marketerId} onChange={(e) => setMarketerId(e.target.value)} required>
              <option value="">Choose marketer…</option>
              {marketers.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.name}
                </option>
              ))}
            </Choice>
          </Field>
        )}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 h-5 w-5 accent-emerald-600" />
          <span>The customer confirmed they are 18 or older.</span>
        </label>
        <fieldset className="space-y-1 rounded-lg border border-slate-200 p-3 text-sm">
          <legend className="px-1 font-medium text-slate-700">SMS consent — read this to the customer</legend>
          <p className="italic text-slate-700">&ldquo;{state.consentWording}&rdquo;</p>
          <label className="flex items-center gap-2">
            <input type="radio" name="consent" checked={consent === "yes"} onChange={() => setConsent("yes")} className="h-5 w-5 accent-emerald-600" />
            Customer agreed
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="consent" checked={consent === "no"} onChange={() => setConsent("no")} className="h-5 w-5 accent-emerald-600" />
            Customer said no
          </label>
        </fieldset>
        <ErrorLine message={error} />
        <div className="flex gap-2">
          <Btn type="submit" disabled={busy} className="flex-1">
            {busy ? "Saving…" : "Save customer"}
          </Btn>
          <Btn variant="secondary" onClick={onClose}>
            Cancel
          </Btn>
        </div>
        <p className="text-center text-xs text-slate-500">Registration and deposits are verified from the betting systems, not entered here.</p>
      </form>
    </Panel>
  );
}

function ContactRow({ c, owner, links, onChange }: { c: Contact; owner: boolean; links: ApprovedLink[]; onChange: (c: Contact) => void }) {
  const [busy, setBusy] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: string, data: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      onChange((await mk<{ contact: Contact }>(action, { id: c.id, ...data })).contact);
    } catch (e) {
      setError(mkError(e));
    } finally {
      setBusy(false);
    }
  };
  const missing = (["football", "aviator"] as Product[]).filter((p) => !c.products.includes(p));
  return (
    <li className="space-y-2 border-t border-slate-100 py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{c.name}</p>
        <p className="text-sm tabular-nums text-slate-600">{c.phone}</p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {c.products.map((p) => (
          <span key={p} className="inline-flex items-center gap-1">
            <span className="text-slate-600">{PRODUCT_LABEL[p]}:</span> {statusTag(c.accounts[p])}
          </span>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Recorded {dateTime(c.recordedAtMs)}
        {owner && c.marketerName ? ` by ${c.marketerName}` : ""} · SMS {c.smsConsent ? "consent given" : c.consentRevokedAtMs ? "consent withdrawn" : "no consent"}
      </p>
      <div className="flex flex-wrap gap-2">
        <Btn variant="secondary" disabled={busy} onClick={() => void run("checkContact", {})}>
          Check now
        </Btn>
        <Btn variant="secondary" aria-expanded={sendOpen} onClick={() => setSendOpen((v) => !v)}>
          {sendOpen ? "Hide signup link" : "Signup link"}
        </Btn>
        {missing.map((p) => (
          <Btn key={p} variant="secondary" disabled={busy} onClick={() => void run("addProduct", { product: p })}>
            Also uses {PRODUCT_LABEL[p]}
          </Btn>
        ))}
        {c.smsConsent && (
          <Btn
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Stop all SMS to ${c.name}? This cannot be undone here.`)) void run("revokeConsent", {});
            }}
          >
            Stop SMS
          </Btn>
        )}
      </div>
      {sendOpen && <ProductSignupActions links={links} products={c.products} phone={c.phone} />}
      <ErrorLine message={error} />
    </li>
  );
}

export function CustomersTab({
  state,
  addOpen,
  setAddOpen,
  draft,
  setDraft,
}: {
  state: MkState;
  addOpen: boolean;
  setAddOpen: (v: boolean) => void;
  draft: CustomerDraft;
  setDraft: (fn: (d: CustomerDraft) => CustomerDraft) => void;
}) {
  const owner = state.me.role === "owner";
  const [justSaved, setJustSaved] = useState<Contact | null>(null);
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [next, setNext] = useState<Cursor>(null);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(
    (cursor: Cursor, append: boolean, search: string) =>
      mk<{ rows: Contact[]; next: Cursor }>("listContacts", { q: search, cursor }).then(
        (res) => {
          setRows((cur) => (append && cur ? [...cur, ...res.rows] : res.rows));
          setNext(res.next);
          setError(null);
        },
        (e) => setError(mkError(e)),
      ),
    [],
  );

  useEffect(() => {
    void load(null, false, query);
  }, [load, query]);

  const replace = (c: Contact) => setRows((cur) => (cur ?? []).map((x) => (x.id === c.id ? c : x)));

  return (
    <div className="space-y-4">
      {addOpen ? (
        <AddCustomer
          state={state}
          draft={draft}
          setDraft={setDraft}
          onClose={() => setAddOpen(false)}
          onSaved={(c) => {
            setAddOpen(false);
            setDraft(emptyDraft);
            setSaved(`${c.name} saved.`);
            setJustSaved(c);
            setRows((cur) => [c, ...(cur ?? []).filter((x) => x.id !== c.id)]);
          }}
        />
      ) : (
        <Btn onClick={() => setAddOpen(true)} className="w-full sm:w-auto">
          + Add customer
        </Btn>
      )}
      {saved && <Notice tone="green">{saved}</Notice>}
      {justSaved && !addOpen && (
        <Panel className="space-y-3">
          <H2>Send {justSaved.name} the signup link</H2>
          <ProductSignupActions links={state.links} products={justSaved.products} phone={justSaved.phone} />
          <p className="text-xs text-slate-500">
            The customer creates their own password and codes. They count as verified only after the betting system confirms the account.
          </p>
        </Panel>
      )}
      <Panel className="space-y-3">
        <H2>{owner ? "All customers" : "My customers"}</H2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(q.trim());
          }}
          className="flex gap-2"
        >
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" aria-label="Search customers" />
          <Btn type="submit" variant="secondary">
            Search
          </Btn>
        </form>
        <ErrorLine message={error} />
        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>{query ? "No matching customers." : "No customers yet. Add your first one."}</Empty>
        ) : (
          <ul>
            {rows.map((c) => (
              <ContactRow key={c.id} c={c} owner={owner} links={state.links} onChange={replace} />
            ))}
          </ul>
        )}
        {next && (
          <Btn variant="secondary" className="w-full" onClick={() => void load(next, true, query)}>
            Load more
          </Btn>
        )}
      </Panel>
    </div>
  );
}
