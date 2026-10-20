"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { dateTime, mk, mkError, money, type Contact, type Cursor, type MkState, type Revision, type Template } from "@/lib/marketersApi";
import { Btn, Choice, Empty, ErrorLine, Field, H2, Loading, Notice, Panel, Tag, TextArea } from "./ui";

const STATUS: Record<Revision["status"], { label: string; tone: "green" | "amber" | "red" | "slate" | "blue" }> = {
  pending_review: { label: "Waiting for owner", tone: "amber" },
  needs_draft: { label: "Owner to write wording", tone: "blue" },
  approved: { label: "Approved · not sent", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  superseded: { label: "Replaced by new revision", tone: "slate" },
  invalidated: { label: "Needs re-review", tone: "red" },
};

function RequestForm({ state, onDone }: { state: MkState; onDone: () => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [linkId, setLinkId] = useState(state.links[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [next, setNext] = useState<Cursor>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const link = state.links.find((l) => l.id === linkId);
  const template = templates.find((t) => t.id === templateId);

  const loadCustomers = useCallback(
    (cursor: Cursor) =>
      mk<{ rows: Contact[]; next: Cursor }>("listContacts", { cursor }).then((res) => {
        setCustomers((cur) => (cursor ? [...cur, ...res.rows] : res.rows));
        setNext(res.next);
      }),
    [],
  );

  useEffect(() => {
    void mk<{ rows: Template[] }>("listTemplates").then((r) => setTemplates(r.rows));
    void loadCustomers(null).catch((e) => setError(mkError(e)));
  }, [loadCustomers]);

  const eligible = useMemo(
    () => customers.filter((c) => c.smsConsent && link && c.products.includes(link.product)),
    [customers, link],
  );

  const togglePick = (id: string) =>
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const recipients = [...picked].filter((id) => eligible.some((c) => c.id === id));
    if (!recipients.length) return setError("Choose at least one customer.");
    setBusy(true);
    try {
      await mk("requestCampaign", { templateId: templateId || undefined, linkId, note, recipients });
      onDone();
    } catch (err) {
      setError(mkError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <form onSubmit={submit} className="space-y-3">
        <H2>Request an SMS</H2>
        <Field label="Message">
          <Choice value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Ask the owner to write it</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Choice>
        </Field>
        <Field label="Approved link">
          <Choice value={linkId} onChange={(e) => setLinkId(e.target.value)}>
            {state.links.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label} — {l.url}
              </option>
            ))}
          </Choice>
        </Field>
        {template && link && (
          <div className="rounded-lg bg-blue-50 p-3 text-sm text-slate-800">
            <p className="text-xs font-medium text-slate-500">Preview</p>
            <p className="whitespace-pre-wrap">
              {template.body}
              {"\n"}
              {link.url}
            </p>
          </div>
        )}
        <Field label={templateId ? "Note to owner (optional)" : "What should the message say?"} hint="Not sent to customers. No links — choose one above.">
          <TextArea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} />
        </Field>
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">
            Customers ({picked.size} chosen) — only those with SMS consent who use {link ? link.label : "this product"}
          </legend>
          {eligible.length === 0 ? (
            <Empty>No eligible customers loaded.</Empty>
          ) : (
            <>
              <Btn variant="ghost" onClick={() => setPicked(new Set(eligible.map((c) => c.id)))}>
                Select all shown
              </Btn>
              <ul className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                {eligible.map((c) => (
                  <li key={c.id} className="border-t border-slate-100 first:border-t-0">
                    <label className="flex min-h-11 items-center gap-2 px-3">
                      <input type="checkbox" checked={picked.has(c.id)} onChange={() => togglePick(c.id)} className="h-5 w-5 accent-emerald-600" />
                      <span className="flex-1">{c.name}</span>
                      <span className="text-xs tabular-nums text-slate-500">{c.phone}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          {next && (
            <Btn variant="secondary" className="mt-2 w-full" onClick={() => void loadCustomers(next)}>
              Load more customers
            </Btn>
          )}
        </fieldset>
        <ErrorLine message={error} />
        <Btn type="submit" disabled={busy} className="w-full">
          {busy ? "Sending request…" : "Send request to owner"}
        </Btn>
        <p className="text-center text-xs text-slate-500">No SMS is sent without owner approval.</p>
      </form>
    </Panel>
  );
}

function ReviewPanel({ state, id, onChanged }: { state: MkState; id: string; onChanged: () => void }) {
  const owner = state.me.role === "owner";
  const [data, setData] = useState<{ campaign: Revision; recipients: { id: string; name: string; phone: string | null; eligible: boolean }[] } | null>(null);
  const [note, setNote] = useState("");
  const [body, setBody] = useState("");
  const [linkId, setLinkId] = useState("");
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void mk<NonNullable<typeof data>>("getCampaign", { id })
      .then((d) => {
        setData(d);
        setBody(d.campaign.body);
        setLinkId(d.campaign.linkId);
        setKeep(new Set(d.recipients.map((r) => r.id)));
      })
      .catch((e) => setError(mkError(e)));
  }, [id]);

  if (!data) return error ? <ErrorLine message={error} /> : <Loading />;
  const c = data.campaign;
  const editable = owner && ["pending_review", "needs_draft", "rejected", "invalidated"].includes(c.status);

  const act = async (action: string, payload: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await mk<{ status: string; reason?: string }>(action, { id: c.id, ...payload });
      if (res.status === "invalidated") {
        setError(`Not approved: ${res.reason}. Revise the list or wording to create a new revision.`);
        setData({ ...data, campaign: { ...c, status: "invalidated", invalidReason: res.reason ?? null } });
        return;
      }
      onChanged();
    } catch (e) {
      setError(mkError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
      <div>
        <p className="text-xs font-medium text-slate-500">Exact message (revision {c.revision})</p>
        <p className="whitespace-pre-wrap rounded bg-white p-2 font-mono text-slate-900">{c.message || "— wording not written yet —"}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        <dt className="text-slate-500">Destination link</dt>
        <dd className="break-all">{c.linkUrl}</dd>
        <dt className="text-slate-500">Sender ID</dt>
        <dd>{c.senderId ?? "Not configured"}</dd>
        <dt className="text-slate-500">Schedule</dt>
        <dd>{c.scheduleAtMs ? dateTime(c.scheduleAtMs) : "Not set"}</dd>
        <dt className="text-slate-500">Recipients</dt>
        <dd>{c.recipientCount}</dd>
        <dt className="text-slate-500">SMS segments</dt>
        <dd>
          {c.segments} ({c.encoding})
        </dd>
        <dt className="text-slate-500">Estimated cost</dt>
        <dd>{c.estimatedCost.totalMinor == null ? "Price per SMS not set" : money(c.estimatedCost.totalMinor, c.estimatedCost.currency)}</dd>
      </dl>
      {c.requestNote && (
        <p>
          <span className="text-slate-500">Marketer note:</span> {c.requestNote}
        </p>
      )}
      {c.invalidReason && <Notice tone="red">Invalidated: {c.invalidReason}</Notice>}
      <details open={owner}>
        <summary className="cursor-pointer font-medium">Recipient list</summary>
        <ul className="mt-1 max-h-56 overflow-y-auto rounded border border-slate-200 bg-white">
          {data.recipients.map((r) => (
            <li key={r.id} className="flex items-center gap-2 border-t border-slate-100 px-2 py-1 first:border-t-0">
              {editable && (
                <input
                  type="checkbox"
                  aria-label={`Keep ${r.name}`}
                  checked={keep.has(r.id)}
                  onChange={() =>
                    setKeep((cur) => {
                      const n = new Set(cur);
                      if (n.has(r.id)) n.delete(r.id);
                      else n.add(r.id);
                      return n;
                    })
                  }
                  className="h-4 w-4"
                />
              )}
              <span className="flex-1">{r.name}</span>
              <span className="text-xs tabular-nums text-slate-500">{r.phone}</span>
              {!r.eligible && <Tag tone="red">not eligible now</Tag>}
            </li>
          ))}
        </ul>
      </details>
      {editable && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <Field label="Final wording (link is added on its own line)" hint="Any change creates a new revision that needs approval.">
            <TextArea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={459} />
          </Field>
          <Field label="Approved link">
            <Choice value={linkId} onChange={(e) => setLinkId(e.target.value)}>
              {state.links.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label} — {l.url}
                </option>
              ))}
            </Choice>
          </Field>
          <Btn
            variant="secondary"
            disabled={busy || !body.trim() || keep.size === 0}
            onClick={() => void act("reviseCampaign", { body, linkId, recipients: [...keep] })}
          >
            Save as new revision
          </Btn>
        </div>
      )}
      {owner && c.status === "pending_review" && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <Notice tone="amber">Approving records your decision only. Sending is not connected yet — nothing goes out.</Notice>
          <Field label="Review note (optional)">
            <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Btn disabled={busy} onClick={() => void act("reviewCampaign", { decision: "approve", note })}>
              Approve
            </Btn>
            <Btn variant="danger" disabled={busy} onClick={() => void act("reviewCampaign", { decision: "reject", note })}>
              Reject
            </Btn>
          </div>
        </div>
      )}
      <ErrorLine message={error} />
    </div>
  );
}

export function SmsTab({ state }: { state: MkState }) {
  const owner = state.me.role === "owner";
  const [rows, setRows] = useState<Revision[] | null>(null);
  const [next, setNext] = useState<Cursor>(null);
  const [status, setStatus] = useState(owner ? "pending_review" : "");
  const [open, setOpen] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (cursor: Cursor) =>
      mk<{ rows: Revision[]; next: Cursor }>("listCampaigns", { status: status || undefined, cursor }).then(
        (res) => {
          setRows((cur) => (cursor && cur ? [...cur, ...res.rows] : res.rows));
          setNext(res.next);
          setError(null);
        },
        (e) => setError(mkError(e)),
      ),
    [status],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  return (
    <div className="space-y-4">
      <Notice tone="amber">
        SMS sending is not connected. Requests and approvals are recorded; no message is sent from this app yet.
      </Notice>
      {!owner &&
        (requesting ? (
          <RequestForm
            state={state}
            onDone={() => {
              setRequesting(false);
              void load(null);
            }}
          />
        ) : (
          <Btn onClick={() => setRequesting(true)} className="w-full sm:w-auto">
            + Request an SMS
          </Btn>
        ))}
      <Panel className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <H2>{owner ? "SMS approval" : "My SMS requests"}</H2>
          {owner && (
            <Choice value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto" aria-label="Filter by status">
              <option value="pending_review">Waiting for approval</option>
              <option value="needs_draft">Needs wording</option>
              <option value="invalidated">Needs re-review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="">All</option>
            </Choice>
          )}
        </div>
        <ErrorLine message={error} />
        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>Nothing here.</Empty>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="rounded-lg border border-slate-200 p-3">
                <button type="button" className="w-full text-left" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      {r.recipientCount} customers · {dateTime(r.createdAtMs)}
                    </span>
                    <Tag tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Tag>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{r.message || r.requestNote}</p>
                </button>
                {open === r.id && (
                  <div className="mt-2">
                    <ReviewPanel
                      state={state}
                      id={r.id}
                      onChanged={() => {
                        setOpen(null);
                        void load(null);
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {next && (
          <Btn variant="secondary" className="w-full" onClick={() => void load(next)}>
            Load more
          </Btn>
        )}
      </Panel>
    </div>
  );
}
