"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { dateTime, mk, mkError, PRODUCT_LABEL, type ApprovedLink, type Cursor, type MkState, type Template } from "@/lib/marketersApi";
import { ApplicationsReview, GrowthSettings } from "./OwnerGrowth";
import { EarningsDisputes, PaymentRequests } from "./GrowthSections";
import { Btn, Choice, Empty, ErrorLine, Field, H2, Loading, Notice, Panel, Tag, TextArea, TextInput } from "./ui";

type Section = "team" | "applications" | "money" | "disputes" | "templates" | "settings" | "audit";

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(mkError(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

interface MarketerRow {
  uid: string;
  name: string;
  phone: string;
  status: string;
  signIn: string;
}

function Team() {
  const [rows, setRows] = useState<MarketerRow[] | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const a = useAction();

  const load = useCallback(() => mk<{ rows: MarketerRow[] }>("listMarketers").then((r) => setRows(r.rows)), []);
  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const res = await a.run(() => mk<{ signIn: string[] }>("createMarketer", { name, phone, password }));
    if (res) {
      setCreated(`${name} can sign in at /s with "${res.signIn[0]}" or their phone, plus the password you set.`);
      setName("");
      setPhone("");
      setPassword("");
      void load();
    }
  };

  return (
    <div className="space-y-4">
      <Panel>
        <form onSubmit={create} className="space-y-3">
          <H2>Create marketer login</H2>
          <Field label="Full name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} required autoComplete="off" />
          </Field>
          <Field label="Phone">
            <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" autoComplete="off" />
          </Field>
          <Field label="Password" hint="10+ characters, not only numbers. Give it to them privately.">
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="new-password" />
          </Field>
          <ErrorLine message={a.error} />
          <Btn type="submit" disabled={a.busy}>
            Create login
          </Btn>
          {created && <Notice tone="green">{created}</Notice>}
        </form>
      </Panel>
      <Panel>
        <H2>Marketers</H2>
        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No marketers yet.</Empty>
        ) : (
          <ul>
            {rows.map((m) => (
              <li key={m.uid} className="space-y-2 border-t border-slate-100 py-3 first:border-t-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {m.name} {m.status === "active" ? <Tag tone="green">active</Tag> : <Tag tone="red">disabled</Tag>}
                  </p>
                  <p className="text-xs text-slate-500">
                    sign-in: {m.signIn} · {m.phone}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {m.status === "active" ? (
                    <Btn
                      variant="danger"
                      disabled={a.busy}
                      onClick={() => {
                        if (window.confirm(`Disable ${m.name}? They are signed out immediately.`))
                          void a.run(() => mk("setMarketerStatus", { uid: m.uid, status: "suspended" })).then(load);
                      }}
                    >
                      Disable
                    </Btn>
                  ) : (
                    <Btn variant="secondary" disabled={a.busy} onClick={() => void a.run(() => mk("setMarketerStatus", { uid: m.uid, status: "active" })).then(load)}>
                      Re-enable
                    </Btn>
                  )}
                  <Btn variant="secondary" onClick={() => setResetFor(resetFor === m.uid ? null : m.uid)}>
                    Reset password
                  </Btn>
                </div>
                {resetFor === m.uid && (
                  <div className="flex gap-2">
                    <TextInput type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" autoComplete="new-password" />
                    <Btn
                      disabled={a.busy}
                      onClick={() =>
                        void a.run(() => mk("resetMarketerPassword", { uid: m.uid, password: newPassword })).then((r) => {
                          if (r) {
                            setResetFor(null);
                            setNewPassword("");
                          }
                        })
                      }
                    >
                      Save
                    </Btn>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

interface DisputeRow {
  id: string;
  product: "aviator" | "football";
  accountId: string;
  registeredAtMs: number | null;
  recordedAtMs: number;
  reviewHint: "registered_shortly_before" | "registered_long_before" | "registration_time_unknown" | null;
  hadPriorDeposits: boolean | null;
  contactName: string | null;
  phone: string | null;
  marketerName: string | null;
}

function Disputes() {
  const [rows, setRows] = useState<DisputeRow[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const a = useAction();
  const load = useCallback(() => mk<{ rows: DisputeRow[] }>("listDisputes").then((r) => setRows(r.rows)), []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Panel className="space-y-3">
      <H2>Registrations needing your review</H2>
      <p className="text-sm text-slate-600">
        These accounts were registered before the marketer recorded the number, so the system cannot prove who brought them in. They
        earn nothing until you decide. When crediting, choose whether the marketer gets the customer from their registration (they
        signed them up) or only from when the number was recorded (an existing customer they reactivated).
      </p>
      <ErrorLine message={a.error} />
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>No decisions waiting.</Empty>
      ) : (
        <ul className="space-y-3">
          {rows.map((d) => (
            <li key={d.id} className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
              <p className="font-semibold">
                {d.contactName} · {d.phone} · {PRODUCT_LABEL[d.product]}
              </p>
              <p className="text-slate-600">
                Marketer: {d.marketerName} · Registered {dateTime(d.registeredAtMs)} · Recorded {dateTime(d.recordedAtMs)}
                {d.hadPriorDeposits ? " · had deposits before referral" : ""}
              </p>
              <p>
                {d.reviewHint === "registered_shortly_before" ? (
                  <Tag tone="amber">Registered shortly before recording — check with the marketer</Tag>
                ) : d.reviewHint === "registration_time_unknown" ? (
                  <Tag tone="red">Registration time unknown</Tag>
                ) : (
                  <Tag>Long-standing account</Tag>
                )}
              </p>
              <TextInput
                value={notes[d.id] ?? ""}
                onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })}
                placeholder="Reason (required, saved in audit)"
                aria-label="Reason"
              />
              <div className="grid gap-2">
                {d.registeredAtMs != null && (
                  <Btn disabled={a.busy} onClick={() => void a.run(() => mk("resolveAttribution", { id: d.id, decision: "accept", countFrom: "registration", note: notes[d.id] })).then((r) => r && load())}>
                    Credit from registration (marketer signed them up)
                  </Btn>
                )}
                <Btn variant="secondary" disabled={a.busy} onClick={() => void a.run(() => mk("resolveAttribution", { id: d.id, decision: "accept", countFrom: "recorded", note: notes[d.id] })).then((r) => r && load())}>
                  Credit from recording only (reactivated customer)
                </Btn>
                <Btn variant="danger" disabled={a.busy} onClick={() => void a.run(() => mk("resolveAttribution", { id: d.id, decision: "reject", note: notes[d.id] })).then((r) => r && load())}>
                  Do not credit
                </Btn>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Templates() {
  const [rows, setRows] = useState<Template[] | null>(null);
  const [edit, setEdit] = useState<{ id?: string; title: string; body: string; active: boolean } | null>(null);
  const a = useAction();
  const load = useCallback(() => mk<{ rows: Template[] }>("listTemplates").then((r) => setRows(r.rows)), []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Panel className="space-y-3">
      <div className="flex items-center justify-between">
        <H2>Message templates</H2>
        <Btn variant="secondary" onClick={() => setEdit({ title: "", body: "", active: true })}>
          New template
        </Btn>
      </div>
      <p className="text-sm text-slate-600">Marketers pick from active templates. The link is added separately from your approved list.</p>
      {edit && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <Field label="Title">
            <TextInput value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
          </Field>
          <Field label="Text (no links)">
            <TextArea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} rows={3} maxLength={419} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} className="h-5 w-5" /> Active
          </label>
          <ErrorLine message={a.error} />
          <div className="flex gap-2">
            <Btn disabled={a.busy} onClick={() => void a.run(() => mk("saveTemplate", edit)).then((r) => r && (setEdit(null), load()))}>
              Save
            </Btn>
            <Btn variant="secondary" onClick={() => setEdit(null)}>
              Cancel
            </Btn>
          </div>
        </div>
      )}
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>No templates yet.</Empty>
      ) : (
        <ul>
          {rows.map((t) => (
            <li key={t.id} className="space-y-1 border-t border-slate-100 py-2 first:border-t-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">
                  {t.title} <span className="text-xs text-slate-500">v{t.version}</span> {!t.active && <Tag>inactive</Tag>}
                </p>
                <Btn variant="ghost" onClick={() => setEdit({ id: t.id, title: t.title, body: t.body, active: t.active })}>
                  Edit
                </Btn>
              </div>
              <p className="text-sm text-slate-600">{t.body}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Settings({ state, reloadState }: { state: MkState; reloadState: () => Promise<void> }) {
  const [links, setLinks] = useState<ApprovedLink[]>(state.links);
  const [windowHours, setWindowHours] = useState(String(state.settings?.reviewHintHours ?? 24));
  const [price, setPrice] = useState(state.settings?.smsPricePerSegmentMinor == null ? "" : String(state.settings.smsPricePerSegmentMinor));
  const [sender, setSender] = useState(state.settings?.senderId ?? "");
  const [saved, setSaved] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const a = useAction();

  const save = async () => {
    setSaved(false);
    const r = await a.run(() =>
      mk("saveSettings", {
        links,
        reviewHintHours: Number(windowHours),
        smsPricePerSegmentMinor: price === "" ? null : Number(price),
        senderId: sender.trim() || null,
      }),
    );
    if (r) {
      setSaved(true);
      await reloadState();
    }
  };

  const i = state.integrations;
  return (
    <div className="space-y-4">
      <Panel className="space-y-3">
        <H2>Approved links</H2>
        <p className="text-sm text-slate-600">
          Exact https links on beteseaviator.com or betesegaming.com. Used for Invite buttons and SMS. Changing a link invalidates
          campaigns waiting for approval that use it.
        </p>
        {links.map((l, idx) => (
          <div key={idx} className="grid gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[6rem_1fr_7rem_2fr]">
            <TextInput aria-label="Id" value={l.id} onChange={(e) => setLinks(links.map((x, j) => (j === idx ? { ...x, id: e.target.value } : x)))} />
            <TextInput aria-label="Label" value={l.label} onChange={(e) => setLinks(links.map((x, j) => (j === idx ? { ...x, label: e.target.value } : x)))} />
            <Choice aria-label="Product" value={l.product} onChange={(e) => setLinks(links.map((x, j) => (j === idx ? { ...x, product: e.target.value as ApprovedLink["product"] } : x)))}>
              <option value="aviator">Aviator</option>
              <option value="football">Football</option>
            </Choice>
            <TextInput aria-label="URL" value={l.url} onChange={(e) => setLinks(links.map((x, j) => (j === idx ? { ...x, url: e.target.value } : x)))} />
          </div>
        ))}
        <Btn variant="ghost" onClick={() => setLinks([...links, { id: "", label: "", product: "aviator", url: "https://beteseaviator.com/" }])}>
          + Add link
        </Btn>
      </Panel>
      <Panel className="space-y-3">
        <H2>Rules and SMS settings</H2>
        <Field
          label="Review hint window (hours)"
          hint="Never credits anyone automatically. A registration made up to this long before the marketer recorded the number is labelled “registered shortly before recording” in Disputes to help your decision."
        >
          <TextInput type="number" min={0} max={168} value={windowHours} onChange={(e) => setWindowHours(e.target.value)} />
        </Field>
        <Field label="Price per SMS segment (bututs)" hint="Used only for cost estimates.">
          <TextInput type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Sender ID" hint="Shown on each revision. Stays on the server.">
          <TextInput value={sender} onChange={(e) => setSender(e.target.value)} maxLength={11} />
        </Field>
        <ErrorLine message={a.error} />
        <Btn disabled={a.busy} onClick={() => void save()}>
          Save settings
        </Btn>
        {saved && <Notice tone="green">Saved.</Notice>}
      </Panel>
      <Panel className="space-y-3">
        <H2>Connections</H2>
        <p className="text-sm">
          Aviator: {i.aviator.connected ? <Tag tone="green">Connected (read-only)</Tag> : <Tag tone="amber">Not connected</Tag>} · last sync{" "}
          {dateTime(i.aviator.lastSync?.lastRunAtMs)}
        </p>
        <Btn
          variant="secondary"
          disabled={a.busy}
          onClick={() =>
            void a.run(() => mk<{ processed: number; errors: number; complete: boolean }>("syncNow")).then((r) => {
              if (r) setSyncResult(`Checked ${r.processed} customers, ${r.errors} errors${r.complete ? "" : " — continues next run"}.`);
            })
          }
        >
          Sync Aviator now
        </Btn>
        {syncResult && <Notice tone="green">{syncResult}</Notice>}
        {[
          { label: "Football", info: i.football },
          { label: "SMS sending", info: i.sms },
        ].map(({ label, info }) => (
          <div key={label} className="text-sm">
            <p>
              {label}: <Tag tone="amber">Not connected</Tag>
            </p>
            <p className="mt-1 text-slate-600">Needed before it can be connected:</p>
            <ul className="ml-5 list-disc text-slate-600">
              {info.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        ))}
      </Panel>
    </div>
  );
}

interface AuditRow {
  id: string;
  actorId: string;
  actorRole: string;
  action: string;
  target: string;
  atMs: number;
}

function Audit() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [next, setNext] = useState<Cursor>(null);
  const load = useCallback(
    (cursor: Cursor) =>
      mk<{ rows: AuditRow[]; next: Cursor }>("listAudit", { cursor }).then((r) => {
        setRows((cur) => (cursor && cur ? [...cur, ...r.rows] : r.rows));
        setNext(r.next);
      }),
    [],
  );
  useEffect(() => {
    void load(null);
  }, [load]);
  return (
    <Panel>
      <H2>Audit trail</H2>
      {!rows ? (
        <Loading />
      ) : (
        <ul className="mt-2 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap justify-between gap-2 border-t border-slate-100 py-2 first:border-t-0">
              <span className="font-mono text-xs">{r.action}</span>
              <span className="text-xs text-slate-500">
                {r.actorRole} · {r.target} · {dateTime(r.atMs)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {next && (
        <Btn variant="secondary" className="mt-2 w-full" onClick={() => void load(next)}>
          Load more
        </Btn>
      )}
    </Panel>
  );
}

export function OwnerTab({ state, reloadState }: { state: MkState; reloadState: () => Promise<void> }) {
  const [section, setSection] = useState<Section>("team");
  const sections: { id: Section; label: string }[] = [
    { id: "team", label: "Team & access" },
    { id: "applications", label: "Applications" },
    { id: "money", label: "Payment requests" },
    { id: "disputes", label: "Registration reviews" },
    { id: "templates", label: "Templates" },
    { id: "settings", label: "Links & settings" },
    { id: "audit", label: "Audit" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            onClick={() => setSection(s.id)}
            className={`min-h-9 rounded-full border px-3 text-sm ${section === s.id ? "border-[#0b2a5b] bg-[#0b2a5b] text-white" : "border-slate-300 bg-white text-slate-700"}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {section === "team" && <Team />}
      {section === "applications" && <ApplicationsReview />}
      {section === "money" && (
        <>
          <PaymentRequests owner />
          <EarningsDisputes owner />
        </>
      )}
      {section === "disputes" && <Disputes />}
      {section === "templates" && <Templates />}
      {section === "settings" && (
        <>
          <GrowthSettings state={state} reloadState={reloadState} />
          <Settings state={state} reloadState={reloadState} />
        </>
      )}
      {section === "audit" && <Audit />}
    </div>
  );
}
