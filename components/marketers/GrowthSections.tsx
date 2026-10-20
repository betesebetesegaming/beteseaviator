"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Share2 } from "lucide-react";
import {
  dateTime,
  mk,
  mkError,
  money,
  toMinorInput,
  type Cursor,
  type EarningsDispute,
  type PaymentRequest,
  type Tier,
} from "@/lib/marketersApi";
import { emptyProposal, proposalPayload, ProposalFields, type ProposalDraft } from "./ProposalFields";
import { Btn, Choice, Empty, ErrorLine, Field, H2, Loading, Notice, Panel, Tag, TextArea, TextInput } from "./ui";

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

// ---------- share application ----------

export function ShareApplication() {
  const [inv, setInv] = useState<{ url: string; note: string } | null>(null);
  const [msg, setMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const r = useRun();
  const load = () => void r.run(() => mk<{ url: string; note: string }>("myInvite")).then((x) => x && setInv(x));
  const copy = async () => {
    if (!inv) return;
    try {
      await navigator.clipboard.writeText(inv.url);
      setMsg("Copied.");
    } catch {
      inputRef.current?.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      setMsg(ok ? "Copied." : "Link selected — copy it from your keyboard menu.");
    }
  };
  const share = async () => {
    if (!inv) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Become a Betese Marketer", text: "Apply to become a Betese marketer:", url: inv.url });
      } catch {
        /* cancelled */
      }
    } else void copy();
  };
  return (
    <Panel className="space-y-3">
      <H2>Share Marketer Application</H2>
      {!inv ? (
        <Btn variant="secondary" disabled={r.busy} onClick={load}>
          Get my invitation link
        </Btn>
      ) : (
        <>
          <input
            ref={inputRef}
            readOnly
            value={inv.url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Invitation link"
            className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <Btn onClick={() => void copy()}>
              <Copy className="h-4 w-4" aria-hidden /> Copy link
            </Btn>
            <Btn variant="secondary" onClick={() => void share()}>
              <Share2 className="h-4 w-4" aria-hidden /> Share
            </Btn>
          </div>
          <p aria-live="polite" className="text-xs text-emerald-700">
            {msg}
          </p>
          <Notice>{inv.note} Each applicant goes through the same application and owner approval.</Notice>
        </>
      )}
      <ErrorLine message={r.error} />
    </Panel>
  );
}

// ---------- propose a new target ----------

export function ProposeNewTarget() {
  const [open, setOpen] = useState(false);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [draft, setDraft] = useState<ProposalDraft>(emptyProposal);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const r = useRun();
  useEffect(() => {
    if (open) void mk<{ tiers: Tier[] }>("applicationInfo").then((i) => setTiers(i.tiers));
  }, [open]);
  return (
    <Panel className="space-y-3">
      <div className="flex items-center justify-between">
        <H2>Propose a new target</H2>
        {!open && (
          <Btn variant="secondary" onClick={() => setOpen(true)}>
            Propose
          </Btn>
        )}
      </div>
      {sent && <Notice tone="green">Sent to the owner. Your current agreement stays as it is until you accept a new one.</Notice>}
      {open && (
        <div className="space-y-3">
          <ProposalFields value={draft} onChange={setDraft} tiers={tiers} />
          <Field label="Note (optional)">
            <TextArea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} />
          </Field>
          <ErrorLine message={r.error} />
          <div className="flex gap-2">
            <Btn
              disabled={r.busy || !draft.products.length}
              onClick={() =>
                void r.run(() => mk("proposeTerms", { ...proposalPayload(draft), note })).then((x) => {
                  if (x) {
                    setOpen(false);
                    setSent(true);
                    setDraft(emptyProposal());
                  }
                })
              }
            >
              Send proposal
            </Btn>
            <Btn variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Btn>
          </div>
        </div>
      )}
    </Panel>
  );
}

// ---------- payment requests ----------

const REQ_TONE: Record<PaymentRequest["status"], "amber" | "green" | "red" | "slate"> = { open: "amber", paid: "green", rejected: "red", cancelled: "slate" };

export function PaymentRequests({ owner, marketerId, onChanged }: { owner: boolean; marketerId?: string; onChanged?: () => void }) {
  const [rows, setRows] = useState<PaymentRequest[] | null>(null);
  const [next, setNext] = useState<Cursor>(null);
  const [method, setMethod] = useState("wave");
  const [note, setNote] = useState("");
  const [ref, setRef] = useState<Record<string, string>>({});
  const r = useRun();
  const load = useCallback(
    (cursor: Cursor) =>
      mk<{ rows: PaymentRequest[]; next: Cursor }>("listPaymentRequests", { marketerId, cursor, status: owner && !marketerId ? "open" : undefined }).then((res) => {
        setRows((cur) => (cursor && cur ? [...cur, ...res.rows] : res.rows));
        setNext(res.next);
      }),
    [marketerId, owner],
  );
  useEffect(() => {
    void load(null);
  }, [load]);
  const after = () => {
    void load(null);
    onChanged?.();
  };
  return (
    <Panel className="space-y-3">
      <H2>{owner ? "Payment requests" : "Request payment"}</H2>
      {!owner && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
          <p>Ask the owner to pay all your approved, unpaid earnings.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Choice value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Preferred payment method">
              <option value="wave">Wave</option>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="other">Other</option>
            </Choice>
            <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" />
          </div>
          <Btn disabled={r.busy} onClick={() => void r.run(() => mk("requestPayment", { method, note })).then((x) => x && after())}>
            Request payment
          </Btn>
        </div>
      )}
      <ErrorLine message={r.error} />
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>No payment requests.</Empty>
      ) : (
        <ul className="text-sm">
          {rows.map((p) => (
            <li key={p.id} className="space-y-2 border-t border-slate-100 py-2 first:border-t-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {owner ? `${p.marketerName} · ` : ""}
                  {dateTime(p.createdAtMs)} · {p.earningIds.length} line(s) · prefers {p.method}
                </span>
                <span className="flex items-center gap-2">
                  <strong>{money(p.totalMinor, p.currency)}</strong>
                  <Tag tone={REQ_TONE[p.status]}>{p.status}</Tag>
                </span>
              </div>
              {p.note && <p className="text-slate-500">{p.note}</p>}
              {p.reviewNote && <p className="text-slate-500">Owner: {p.reviewNote}</p>}
              {owner && p.status === "open" && (
                <div className="grid gap-2 sm:grid-cols-3">
                  <TextInput value={ref[p.id] ?? ""} onChange={(e) => setRef({ ...ref, [p.id]: e.target.value })} placeholder="Payment reference" aria-label="Payment reference" />
                  <Btn
                    disabled={r.busy}
                    onClick={() =>
                      window.confirm(`Record that you paid ${money(p.totalMinor)}? This does not move money.`) &&
                      void r.run(() => mk("payPaymentRequest", { id: p.id, reference: ref[p.id] ?? "" })).then((x) => x && after())
                    }
                  >
                    Record payment
                  </Btn>
                  <Btn
                    variant="danger"
                    disabled={r.busy}
                    onClick={() => {
                      const why = window.prompt("Reason for rejecting this request?");
                      if (why) void r.run(() => mk("rejectPaymentRequest", { id: p.id, note: why })).then((x) => x && after());
                    }}
                  >
                    Reject
                  </Btn>
                </div>
              )}
              {!owner && p.status === "open" && (
                <Btn variant="ghost" disabled={r.busy} onClick={() => void r.run(() => mk("cancelPaymentRequest", { id: p.id })).then((x) => x && after())}>
                  Cancel request
                </Btn>
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
  );
}

// ---------- earnings disputes ----------

export function EarningsDisputes({ owner, marketerId }: { owner: boolean; marketerId?: string }) {
  const [rows, setRows] = useState<EarningsDispute[] | null>(null);
  const [message, setMessage] = useState("");
  const [answers, setAnswers] = useState<Record<string, { note: string; adj: string }>>({});
  const r = useRun();
  const load = useCallback(
    () => mk<{ rows: EarningsDispute[] }>("listEarningsDisputes", { marketerId, status: owner && !marketerId ? "open" : undefined }).then((res) => setRows(res.rows)),
    [marketerId, owner],
  );
  useEffect(() => {
    void load();
  }, [load]);
  const resolve = (d: EarningsDispute, decision: "resolved" | "rejected") => {
    const a = answers[d.id] ?? { note: "", adj: "" };
    void r
      .run(() => mk("resolveEarningsDispute", { id: d.id, decision, note: a.note, adjustmentMinor: a.adj ? toMinorInput(a.adj) : undefined }))
      .then((x) => x && void load());
  };
  return (
    <Panel className="space-y-3">
      <H2>{owner ? "Earnings disputes" : "Question an earning"}</H2>
      {!owner && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
          <p>Think a customer, deposit or payment is missing or wrong? Tell the owner here.</p>
          <TextArea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={300} aria-label="Describe the problem" />
          <Btn
            disabled={r.busy || message.trim().length < 3}
            onClick={() =>
              void r.run(() => mk("raiseEarningsDispute", { message })).then((x) => {
                if (x) {
                  setMessage("");
                  void load();
                }
              })
            }
          >
            Send to owner
          </Btn>
        </div>
      )}
      <ErrorLine message={r.error} />
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>No disputes.</Empty>
      ) : (
        <ul className="text-sm">
          {rows.map((d) => (
            <li key={d.id} className="space-y-2 border-t border-slate-100 py-2 first:border-t-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {owner ? `${d.marketerName} · ` : ""}
                  {dateTime(d.createdAtMs)}
                </span>
                <Tag tone={d.status === "open" ? "amber" : d.status === "resolved" ? "green" : "red"}>{d.status}</Tag>
              </div>
              <p>{d.message}</p>
              {d.resolution && (
                <p className="text-slate-600">
                  Owner: {d.resolution}
                  {d.adjustmentMinor ? ` · adjustment ${money(d.adjustmentMinor)} (pending approval)` : ""}
                </p>
              )}
              {owner && d.status === "open" && (
                <div className="space-y-2 rounded-lg bg-slate-50 p-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <TextInput
                      value={answers[d.id]?.note ?? ""}
                      onChange={(e) => setAnswers({ ...answers, [d.id]: { adj: answers[d.id]?.adj ?? "", note: e.target.value } })}
                      placeholder="Answer (required)"
                      aria-label="Answer"
                    />
                    <TextInput
                      inputMode="decimal"
                      value={answers[d.id]?.adj ?? ""}
                      onChange={(e) => setAnswers({ ...answers, [d.id]: { note: answers[d.id]?.note ?? "", adj: e.target.value } })}
                      placeholder="Adjustment GMD (optional, can be negative)"
                      aria-label="Adjustment in GMD"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Btn disabled={r.busy} onClick={() => resolve(d, "resolved")}>
                      Resolve
                    </Btn>
                    <Btn variant="danger" disabled={r.busy} onClick={() => resolve(d, "rejected")}>
                      Reject
                    </Btn>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ---------- leaderboard ----------

interface Board {
  enabled: boolean;
  month?: string;
  measure?: string;
  rows?: { rank: number; name: string; aviator: number; football: number; total: number; me: boolean }[];
  myOptIn?: boolean;
  privacy?: string;
}

export function Leaderboard({ owner }: { owner: boolean }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [version, setVersion] = useState(0);
  const r = useRun();
  useEffect(() => {
    let live = true;
    mk<Board>("leaderboard").then((b) => live && setBoard(b));
    return () => {
      live = false;
    };
  }, [version]);
  if (!board || !board.enabled) return null;
  return (
    <Panel className="space-y-2">
      <H2>Leaderboard · {board.month}</H2>
      <p className="text-xs text-slate-500">
        {board.measure}. {board.privacy}
      </p>
      {!owner && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!board.myOptIn}
            disabled={r.busy}
            onChange={(e) => void r.run(() => mk("setLeaderboardOptIn", { optIn: e.target.checked })).then(() => setVersion((v) => v + 1))}
            className="h-5 w-5"
          />
          Show me on the leaderboard
        </label>
      )}
      {!board.rows?.length ? (
        <Empty>Nobody has opted in yet.</Empty>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-1">#</th>
              <th>Marketer</th>
              <th>Aviator</th>
              <th>Football</th>
            </tr>
          </thead>
          <tbody>
            {board.rows.map((row) => (
              <tr key={row.rank} className={`border-t border-slate-100 ${row.me ? "font-semibold text-[#0b2a5b]" : ""}`}>
                <td className="py-1">{row.rank}</td>
                <td>
                  {row.name}
                  {row.me ? " (you)" : ""}
                </td>
                <td>{row.aviator}</td>
                <td>{row.football}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ErrorLine message={r.error} />
    </Panel>
  );
}
