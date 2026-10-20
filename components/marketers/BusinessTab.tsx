"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  dateTime,
  METRIC_LABEL,
  mk,
  mkError,
  money,
  PRODUCT_LABEL,
  termText,
  toMinorInput,
  type Agreement,
  type Business,
  type Cursor,
  type Earning,
  type Metric,
  type MkState,
  type Payout,
  type Revision,
  type Target,
  type Term,
} from "@/lib/marketersApi";
import { Btn, Choice, Empty, ErrorLine, Field, H2, Loading, Notice, Panel, Tag, TextInput } from "./ui";

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const lastDay = (ms: number) => day(ms - 1);

const STATUS_TONE: Record<Earning["status"], "amber" | "blue" | "green" | "slate"> = {
  pending: "amber",
  approved: "blue",
  paid: "green",
  void: "slate",
};

function useRun() {
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
  return { busy, error, run };
}

function targetValue(t: Pick<Target, "metric">, v: number | null): string {
  if (v == null) return "—";
  return t.metric === "verified_deposits" ? money(v) : String(v);
}

// ---------- summary ----------

function Summary({ biz }: { biz: Business }) {
  const s = biz.summary;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Pending", v: s.pendingMinor, tone: "text-amber-700" },
          { label: "Approved", v: s.approvedMinor, tone: "text-[#0b2a5b]" },
          { label: "Paid", v: s.paidMinor, tone: "text-emerald-700" },
        ].map((x) => (
          <Panel key={x.label} className="!p-3">
            <p className={`text-lg font-extrabold ${x.tone}`}>{money(x.v, s.currency)}</p>
            <p className="text-xs text-slate-600">{x.label}</p>
          </Panel>
        ))}
      </div>
      <Panel className="grid grid-cols-3 gap-2 text-center text-sm">
        <div>
          <p className="text-xl font-bold">{biz.thisMonth.newCustomers}</p>
          <p className="text-xs text-slate-600">New verified customers this month</p>
        </div>
        <div>
          <p className="text-xl font-bold">{biz.thisMonth.firstDeposits}</p>
          <p className="text-xs text-slate-600">First deposits this month</p>
        </div>
        <div>
          <p className="text-xl font-bold">{money(biz.thisMonth.netDepositsMinor)}</p>
          <p className="text-xs text-slate-600">Net verified deposits this month</p>
        </div>
      </Panel>
      <p className="text-xs text-slate-500">
        {biz.note} Last calculated: {dateTime(biz.lastRecomputeAtMs)}.
      </p>
    </div>
  );
}

function AgreementCard({ a, children }: { a: Agreement; children?: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          {day(a.effectiveFromMs)} → {a.effectiveToMs ? lastDay(a.effectiveToMs) : "open-ended"}
        </p>
        <Tag tone={a.status === "approved" ? "green" : a.status === "draft" ? "amber" : "slate"}>{a.status}</Tag>
      </div>
      <ul className="ml-5 list-disc text-slate-700">
        {a.terms.map((t, i) => (
          <li key={i}>{termText(t)}</li>
        ))}
      </ul>
      {a.note && <p className="text-slate-500">{a.note}</p>}
      {children}
    </div>
  );
}

// ---------- targets ----------

function ProposeTarget({ onDone }: { onDone: () => void }) {
  const [metric, setMetric] = useState<Metric>("new_customers");
  const [product, setProduct] = useState("aviator");
  const [threshold, setThreshold] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const r = useRun();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = metric === "verified_deposits" ? toMinorInput(threshold) : Number(threshold);
    const ok = await r.run(() => mk("proposeTarget", { metric, product, threshold: value, from, to, note }));
    if (ok) onDone();
  };
  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-slate-200 p-3">
      <p className="font-semibold">Propose a target</p>
      <Field label="Measure">
        <Choice value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
          {(Object.keys(METRIC_LABEL) as Metric[]).map((m) => (
            <option key={m} value={m}>
              {METRIC_LABEL[m]}
            </option>
          ))}
        </Choice>
      </Field>
      <Field label="Product">
        <Choice value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="aviator">Aviator</option>
          <option value="football">Football</option>
          <option value="any">Both</option>
        </Choice>
      </Field>
      <Field label={metric === "verified_deposits" ? "Target amount (GMD)" : "Target number of customers"}>
        <TextInput inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} required />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="From">
          <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </Field>
        <Field label="To">
          <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
        </Field>
      </div>
      <Field label="Note (optional)">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </Field>
      <ErrorLine message={r.error} />
      <Btn type="submit" disabled={r.busy}>
        Send to owner
      </Btn>
      <p className="text-xs text-slate-500">The owner decides whether a target is accepted and any bonus for reaching it.</p>
    </form>
  );
}

function TargetRow({ t, owner, onChanged }: { t: Target; owner: boolean; onChanged: () => void }) {
  const [bonus, setBonus] = useState("");
  const [note, setNote] = useState("");
  const r = useRun();
  const pct = t.progress != null && t.threshold ? Math.min(100, Math.round((t.progress / t.threshold) * 100)) : 0;
  return (
    <li className="space-y-2 border-t border-slate-100 py-3 first:border-t-0 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">
          {METRIC_LABEL[t.metric]} · {t.product === "any" ? "Both" : PRODUCT_LABEL[t.product]}
        </p>
        <Tag tone={t.status === "approved" ? "green" : t.status === "proposed" ? "amber" : "slate"}>{t.status}</Tag>
      </div>
      <p className="text-slate-600">
        {day(t.periodStartMs)} → {lastDay(t.periodEndMs)} · target {targetValue(t, t.threshold)}
        {t.bonusMinor != null && t.status === "approved" ? ` · bonus ${money(t.bonusMinor)}` : ""}
      </p>
      {t.progress != null && (
        <div>
          <div className="h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Progress: {targetValue(t, t.progress)} of {targetValue(t, t.threshold)}
            {t.ended ? " · period ended" : ""}
          </p>
        </div>
      )}
      {t.note && <p className="text-slate-500">Note: {t.note}</p>}
      {owner && t.status === "proposed" && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Bonus if reached (GMD)" hint="Enter 0 for no bonus.">
              <TextInput inputMode="decimal" value={bonus} onChange={(e) => setBonus(e.target.value)} />
            </Field>
            <Field label="Note">
              <TextInput value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Btn disabled={r.busy || bonus === ""} onClick={() => void r.run(() => mk("reviewTarget", { id: t.id, decision: "approve", bonusMinor: toMinorInput(bonus), note })).then((x) => x && onChanged())}>
              Approve
            </Btn>
            <Btn variant="danger" disabled={r.busy} onClick={() => void r.run(() => mk("reviewTarget", { id: t.id, decision: "reject", note })).then((x) => x && onChanged())}>
              Reject
            </Btn>
          </div>
        </div>
      )}
      {!owner && t.status === "proposed" && (
        <Btn variant="ghost" disabled={r.busy} onClick={() => void r.run(() => mk("withdrawTarget", { id: t.id })).then((x) => x && onChanged())}>
          Withdraw
        </Btn>
      )}
      <ErrorLine message={r.error} />
    </li>
  );
}

function Targets({ owner, marketerId }: { owner: boolean; marketerId: string }) {
  const [rows, setRows] = useState<Target[] | null>(null);
  const [proposing, setProposing] = useState(false);
  const load = useCallback(
    () => mk<{ rows: Target[] }>("listTargets", { marketerId }).then((r) => setRows(r.rows.filter((x) => x.status !== "withdrawn"))),
    [marketerId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Panel className="space-y-3">
      <div className="flex items-center justify-between">
        <H2>Targets</H2>
        {!owner && !proposing && (
          <Btn variant="secondary" onClick={() => setProposing(true)}>
            Propose target
          </Btn>
        )}
      </div>
      {proposing && (
        <ProposeTarget
          onDone={() => {
            setProposing(false);
            void load();
          }}
        />
      )}
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>No targets yet.</Empty>
      ) : (
        <ul>
          {rows.map((t) => (
            <TargetRow key={t.id} t={t} owner={owner} onChanged={() => void load()} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ---------- earnings + payments ----------

function Earnings({ owner, marketerId, onChanged }: { owner: boolean; marketerId: string; onChanged: () => void }) {
  const [status, setStatus] = useState(owner ? "pending" : "");
  const [rows, setRows] = useState<Earning[] | null>(null);
  const [next, setNext] = useState<Cursor>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState("wave");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const r = useRun();

  const load = useCallback(
    (cursor: Cursor) =>
      mk<{ rows: Earning[]; next: Cursor }>("listEarnings", { marketerId, status: status || undefined, cursor }).then((res) => {
        setRows((cur) => (cursor && cur ? [...cur, ...res.rows] : res.rows));
        setNext(res.next);
        if (!cursor) setPicked(new Set());
      }),
    [marketerId, status],
  );
  useEffect(() => {
    void load(null);
  }, [load]);

  const after = () => {
    void load(null);
    onChanged();
  };
  const toggle = (id: string) =>
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const pickedRows = (rows ?? []).filter((e) => picked.has(e.id));
  const pickedTotal = pickedRows.reduce((n, e) => n + e.amountMinor, 0);

  return (
    <Panel className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <H2>Earnings</H2>
        <Choice value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto" aria-label="Filter earnings">
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
          {owner && <option value="void">Void</option>}
        </Choice>
      </div>
      <ErrorLine message={r.error} />
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>No earnings here.</Empty>
      ) : (
        <ul>
          {rows.map((e) => (
            <li key={e.id} className="flex items-start gap-2 border-t border-slate-100 py-2 first:border-t-0 text-sm">
              {owner && (e.status === "pending" || e.status === "approved") && (
                <input type="checkbox" aria-label={`Select ${e.description}`} checked={picked.has(e.id)} onChange={() => toggle(e.id)} className="mt-1 h-5 w-5" />
              )}
              <div className="flex-1">
                <p className="font-medium">{e.description}</p>
                <p className="text-xs text-slate-500">
                  {dateTime(e.createdAtMs)}
                  {e.basis?.periodOpen ? " · month still open, amount may change" : ""}
                  {e.voidReason ? ` · ${e.voidReason}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className={`font-semibold tabular-nums ${e.amountMinor < 0 ? "text-red-700" : ""}`}>{money(e.amountMinor, e.currency)}</p>
                <Tag tone={STATUS_TONE[e.status]}>{e.status}</Tag>
              </div>
            </li>
          ))}
        </ul>
      )}
      {next && (
        <Btn variant="secondary" className="w-full" onClick={() => void load(next)}>
          Load more
        </Btn>
      )}
      {owner && picked.size > 0 && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-semibold">
            {picked.size} selected · {money(pickedTotal)}
          </p>
          {pickedRows.every((e) => e.status === "pending") && (
            <div className="flex flex-wrap gap-2">
              <Btn disabled={r.busy} onClick={() => void r.run(() => mk("approveEarnings", { ids: [...picked] })).then((x) => x && after())}>
                Approve selected
              </Btn>
              {picked.size === 1 && (
                <Btn
                  variant="danger"
                  disabled={r.busy}
                  onClick={() => {
                    const note = window.prompt("Reason for voiding this line?");
                    if (note) void r.run(() => mk("voidEarning", { id: [...picked][0], note })).then((x) => x && after());
                  }}
                >
                  Void
                </Btn>
              )}
            </div>
          )}
          {pickedRows.every((e) => e.status === "approved") && (
            <div className="space-y-2">
              <Notice>Recording a payment does not move money. Pay the marketer first, then record it here.</Notice>
              <div className="grid gap-2 sm:grid-cols-3">
                <Choice value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method">
                  <option value="wave">Wave</option>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                  <option value="other">Other</option>
                </Choice>
                <TextInput value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference" aria-label="Payment reference" />
                <TextInput type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} aria-label="Paid on" />
              </div>
              <Btn disabled={r.busy} onClick={() => void r.run(() => mk("recordPayment", { ids: [...picked], method, reference, paidOn: paidOn || undefined })).then((x) => x && after())}>
                Record payment of {money(pickedTotal)}
              </Btn>
            </div>
          )}
          {!pickedRows.every((e) => e.status === "pending") && !pickedRows.every((e) => e.status === "approved") && (
            <p className="text-xs text-slate-500">Select only pending lines (to approve) or only approved lines (to record a payment).</p>
          )}
        </div>
      )}
    </Panel>
  );
}

function Payments({ payouts }: { payouts: Payout[] }) {
  return (
    <Panel>
      <H2>Payment history</H2>
      {payouts.length === 0 ? (
        <Empty>No payments recorded yet.</Empty>
      ) : (
        <ul className="mt-2 text-sm">
          {payouts.map((p) => (
            <li key={p.id} className="flex flex-wrap justify-between gap-2 border-t border-slate-100 py-2 first:border-t-0">
              <span>
                {dateTime(p.paidAtMs)} · {p.method}
                {p.reference ? ` · ${p.reference}` : ""} · {p.earningIds.length} line(s)
              </span>
              <span className="font-semibold text-emerald-700">{money(p.totalMinor, p.currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ---------- owner: agreements ----------

type TermDraft = { type: Term["type"]; product: "aviator" | "football"; qualifies: "verified_signup" | "first_deposit"; amount: string; minFirst: string; percent: string; campaignId: string };
const emptyTerm = (): TermDraft => ({ type: "customer_reward", product: "aviator", qualifies: "verified_signup", amount: "", minFirst: "", percent: "", campaignId: "" });

function toTerm(d: TermDraft): Record<string, unknown> {
  if (d.type === "customer_reward") {
    return { type: d.type, product: d.product, qualifies: d.qualifies, amountMinor: toMinorInput(d.amount), minFirstDepositMinor: d.minFirst ? toMinorInput(d.minFirst) : 0 };
  }
  if (d.type === "deposit_commission") return { type: d.type, product: d.product, basisPoints: Math.round(Number(d.percent) * 100) };
  return { type: d.type, campaignId: d.campaignId, amountMinor: toMinorInput(d.amount) };
}

function AgreementEditor({ marketerId, campaigns, onDone }: { marketerId: string; campaigns: Revision[]; onDone: () => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [terms, setTerms] = useState<TermDraft[]>([emptyTerm()]);
  const r = useRun();
  const set = (i: number, patch: Partial<TermDraft>) => setTerms(terms.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3 text-sm">
      <p className="font-semibold">New payment agreement (draft)</p>
      <Notice>You set every rate. Nothing is pre-filled. The draft does nothing until you approve it.</Notice>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Starts">
          <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Ends (optional)">
          <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      {terms.map((t, i) => (
        <div key={i} className="space-y-2 rounded-lg bg-slate-50 p-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Choice aria-label="Payment type" value={t.type} onChange={(e) => set(i, { type: e.target.value as Term["type"] })}>
              <option value="customer_reward">Fixed reward per new customer</option>
              <option value="deposit_commission">Percentage of verified deposits</option>
              <option value="campaign_payment">Fixed payment for a campaign</option>
            </Choice>
            {t.type !== "campaign_payment" ? (
              <Choice aria-label="Product" value={t.product} onChange={(e) => set(i, { product: e.target.value as TermDraft["product"] })}>
                <option value="aviator">Aviator</option>
                <option value="football">Football</option>
              </Choice>
            ) : (
              <Choice aria-label="Campaign" value={t.campaignId} onChange={(e) => set(i, { campaignId: e.target.value })}>
                <option value="">Choose approved campaign…</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {dateTime(c.createdAtMs)} · {c.recipientCount} customers
                  </option>
                ))}
              </Choice>
            )}
          </div>
          {t.type === "customer_reward" && (
            <div className="grid gap-2 sm:grid-cols-3">
              <Choice aria-label="Earned when" value={t.qualifies} onChange={(e) => set(i, { qualifies: e.target.value as TermDraft["qualifies"] })}>
                <option value="verified_signup">On verified signup</option>
                <option value="first_deposit">On first deposit</option>
              </Choice>
              <TextInput inputMode="decimal" placeholder="Reward GMD" aria-label="Reward in GMD" value={t.amount} onChange={(e) => set(i, { amount: e.target.value })} />
              {t.qualifies === "first_deposit" && (
                <TextInput inputMode="decimal" placeholder="Min. first deposit GMD" aria-label="Minimum first deposit" value={t.minFirst} onChange={(e) => set(i, { minFirst: e.target.value })} />
              )}
            </div>
          )}
          {t.type === "deposit_commission" && (
            <TextInput inputMode="decimal" placeholder="Percent, e.g. 2.5" aria-label="Commission percent" value={t.percent} onChange={(e) => set(i, { percent: e.target.value })} />
          )}
          {t.type === "campaign_payment" && (
            <TextInput inputMode="decimal" placeholder="Payment GMD" aria-label="Campaign payment in GMD" value={t.amount} onChange={(e) => set(i, { amount: e.target.value })} />
          )}
          {terms.length > 1 && (
            <Btn variant="ghost" onClick={() => setTerms(terms.filter((_, j) => j !== i))}>
              Remove
            </Btn>
          )}
        </div>
      ))}
      <Btn variant="ghost" onClick={() => setTerms([...terms, emptyTerm()])}>
        + Add term
      </Btn>
      <Field label="Note (optional)">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </Field>
      <ErrorLine message={r.error} />
      <Btn disabled={r.busy} onClick={() => void r.run(() => mk("saveAgreementDraft", { marketerId, from, to: to || undefined, note, terms: terms.map(toTerm) })).then((x) => x && onDone())}>
        Save draft
      </Btn>
    </div>
  );
}

function OwnerAgreements({ marketerId, onChanged }: { marketerId: string; onChanged: () => void }) {
  const [rows, setRows] = useState<Agreement[] | null>(null);
  const [campaigns, setCampaigns] = useState<Revision[]>([]);
  const [editing, setEditing] = useState(false);
  const r = useRun();
  const load = useCallback(
    () =>
      Promise.all([
        mk<{ rows: Agreement[] }>("listAgreements", { marketerId }),
        mk<{ rows: Revision[] }>("listCampaigns", { status: "approved" }),
      ]).then(([a, c]) => {
        setRows(a.rows);
        setCampaigns(c.rows.filter((x) => x.marketerId === marketerId));
      }),
    [marketerId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const act = (action: string, data: Record<string, unknown>) =>
    void r.run(() => mk(action, data)).then((x) => {
      if (x) {
        void load();
        onChanged();
      }
    });
  return (
    <Panel className="space-y-3">
      <div className="flex items-center justify-between">
        <H2>Payment agreements</H2>
        {!editing && (
          <Btn variant="secondary" onClick={() => setEditing(true)}>
            New agreement
          </Btn>
        )}
      </div>
      {editing && (
        <AgreementEditor
          marketerId={marketerId}
          campaigns={campaigns}
          onDone={() => {
            setEditing(false);
            void load();
          }}
        />
      )}
      <ErrorLine message={r.error} />
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>No agreements. This marketer earns nothing until you approve one.</Empty>
      ) : (
        <div className="space-y-2">
          {rows.map((a) => (
            <AgreementCard key={a.id} a={a}>
              <div className="flex flex-wrap gap-2">
                {a.status === "draft" && (
                  <>
                    <Btn disabled={r.busy} onClick={() => window.confirm("Approve these exact terms? They cannot be edited afterwards.") && act("approveAgreement", { id: a.id })}>
                      Approve terms
                    </Btn>
                    <Btn variant="secondary" disabled={r.busy} onClick={() => act("deleteAgreementDraft", { id: a.id })}>
                      Discard draft
                    </Btn>
                  </>
                )}
                {a.status === "approved" && (
                  <Btn variant="danger" disabled={r.busy} onClick={() => window.confirm("End this agreement today?") && act("endAgreement", { id: a.id })}>
                    End agreement
                  </Btn>
                )}
              </div>
            </AgreementCard>
          ))}
        </div>
      )}
      {campaigns.length > 0 && (
        <div className="space-y-2 border-t border-slate-100 pt-3 text-sm">
          <p className="font-semibold">Confirm a campaign was completed</p>
          <p className="text-slate-600">Only needed for fixed campaign payments. Approval alone does not earn the payment.</p>
          {campaigns.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {dateTime(c.createdAtMs)} · {c.recipientCount} customers
              </span>
              <Btn
                variant="secondary"
                disabled={r.busy}
                onClick={() => {
                  const note = window.prompt("What was completed? (saved in the audit trail)");
                  if (note) act("confirmCampaignCompleted", { campaignId: c.id, note });
                }}
              >
                Confirm completed
              </Btn>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ---------- tab ----------

function BusinessFor({ owner, marketerId }: { owner: boolean; marketerId: string }) {
  const [biz, setBiz] = useState<Business | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const r = useRun();
  useEffect(() => {
    let live = true;
    mk<Business>("myBusiness", { marketerId }).then(
      (b) => live && setBiz(b),
      (e) => live && setError(mkError(e)),
    );
    return () => {
      live = false;
    };
  }, [marketerId, version]);
  const refresh = () => setVersion((v) => v + 1);

  if (!biz) return error ? <ErrorLine message={error} /> : <Loading />;
  return (
    <div className="space-y-4">
      <Summary biz={biz} />
      {owner && (
        <div className="flex flex-wrap items-center gap-2">
          <Btn variant="secondary" disabled={r.busy} onClick={() => void r.run(() => mk("recalculateEarnings", { marketerId })).then((x) => x && refresh())}>
            Recalculate earnings
          </Btn>
          <ErrorLine message={r.error} />
        </div>
      )}
      {owner ? (
        <OwnerAgreements marketerId={marketerId} onChanged={refresh} />
      ) : (
        <Panel className="space-y-2">
          <H2>My payment agreement</H2>
          {biz.agreements.length === 0 ? (
            <Empty>No approved agreement yet. Earnings start once the owner approves one.</Empty>
          ) : (
            biz.agreements.map((a) => <AgreementCard key={a.id} a={a} />)
          )}
        </Panel>
      )}
      <Targets owner={owner} marketerId={marketerId} />
      <Earnings key={version} owner={owner} marketerId={marketerId} onChanged={refresh} />
      <Payments payouts={biz.payouts} />
    </div>
  );
}

export function BusinessTab({ state }: { state: MkState }) {
  const owner = state.me.role === "owner";
  const [marketers, setMarketers] = useState<{ uid: string; name: string }[]>([]);
  const [marketerId, setMarketerId] = useState(owner ? "" : state.me.uid);
  useEffect(() => {
    if (owner) void mk<{ rows: { uid: string; name: string }[] }>("listMarketers").then((r) => setMarketers(r.rows));
  }, [owner]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-[#0b2a5b]">{owner ? "Marketer business & earnings" : "My business & earnings"}</h1>
        <p className="text-sm text-slate-600">Separate from agent commission and from any betting wallet.</p>
      </div>
      {owner && (
        <Field label="Marketer">
          <Choice value={marketerId} onChange={(e) => setMarketerId(e.target.value)}>
            <option value="">Choose marketer…</option>
            {marketers.map((m) => (
              <option key={m.uid} value={m.uid}>
                {m.name}
              </option>
            ))}
          </Choice>
        </Field>
      )}
      {marketerId ? <BusinessFor key={marketerId} owner={owner} marketerId={marketerId} /> : <Empty>Choose a marketer to see their business.</Empty>}
    </div>
  );
}
