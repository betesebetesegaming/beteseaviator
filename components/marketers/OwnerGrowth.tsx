"use client";

import { useCallback, useEffect, useState } from "react";
import { dateTime, mk, mkError, money, pct, PRODUCT_LABEL, toMinorInput, type Application, type MkState, type Period, type Tier } from "@/lib/marketersApi";
import { Btn, Choice, Empty, ErrorLine, Field, H2, Loading, Notice, Panel, Tag, TextInput } from "./ui";

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

const today = () => new Date().toISOString().slice(0, 10);
const gmd = (minor: number) => (minor ? String(minor / 100) : "");

/** Owner sets the final terms; the applicant must still accept them before anything is earned. */
function ApproveForm({ a, onDone }: { a: Application; onDone: () => void }) {
  const [period, setPeriod] = useState<Period>(a.period);
  const [customers, setCustomers] = useState(String(a.customerTarget || ""));
  const [deposits, setDeposits] = useState(gmd(a.depositTargetMinor));
  const [rate, setRate] = useState(String(a.requestedRateBp / 100));
  const [missed, setMissed] = useState("");
  const [days, setDays] = useState("");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const r = useRun();
  const newApplicant = a.kind === "application";
  const submit = () =>
    void r
      .run(() =>
        mk("approveApplication", {
          id: a.id,
          products: a.products,
          period,
          customerTarget: customers === "" ? 0 : Number(customers),
          depositTargetMinor: deposits === "" ? 0 : toMinorInput(deposits),
          rateBp: Math.round(Number(rate) * 100),
          missedRateBp: missed === "" ? NaN : Math.round(Number(missed) * 100),
          qualifyingDays: days === "" ? NaN : Number(days),
          from,
          to: to || undefined,
          note,
          password: newApplicant ? password : undefined,
        }),
      )
      .then((x) => x && onDone());
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
      <Notice>Set the final terms. The marketer reads and accepts them before earning starts. Nothing is pre-filled except what they asked for.</Notice>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Period">
          <Choice value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Choice>
        </Field>
        <Field label="Customer target per period">
          <TextInput inputMode="numeric" value={customers} onChange={(e) => setCustomers(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="Deposit target per period (GMD)">
          <TextInput inputMode="decimal" value={deposits} onChange={(e) => setDeposits(e.target.value)} />
        </Field>
        <Field label="Commission if target met (%)" hint="5–15, within your tiers">
          <TextInput inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Field label="Commission if target missed (%)" hint="0 = nothing; never above the agreed rate">
          <TextInput inputMode="decimal" value={missed} onChange={(e) => setMissed(e.target.value)} />
        </Field>
        <Field label="Days a customer's deposits qualify" hint="Counted from the customer joining">
          <TextInput inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field label="Starts">
          <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Ends (optional)">
          <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      {newApplicant && (
        <Field label="Sign-in password for the new marketer" hint="10+ characters, not only numbers. Give it to them privately.">
          <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
      )}
      <Field label="Note (optional, shown on the agreement)">
        <TextInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </Field>
      <ErrorLine message={r.error} />
      <Btn disabled={r.busy} onClick={submit}>
        {newApplicant ? "Approve, create login and send terms" : "Approve and send new terms"}
      </Btn>
    </div>
  );
}

export function ApplicationsReview() {
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<Application[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const r = useRun();
  const load = useCallback(() => mk<{ rows: Application[] }>("listApplications", { status: status || undefined }).then((x) => setRows(x.rows)), [status]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Panel className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <H2>Applications & proposals</H2>
        <Choice value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto" aria-label="Filter applications">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </Choice>
      </div>
      <p className="text-sm text-slate-600">
        Public application page: <span className="font-mono">beteseaviator.com/staff/apply</span>. Nothing is approved or activated automatically.
      </p>
      <ErrorLine message={r.error} />
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>Nothing here.</Empty>
      ) : (
        <ul className="space-y-2">
          {rows.map((a) => (
            <li key={a.id} className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {a.name} {a.phone ? `· ${a.phone}` : ""}
                </p>
                <span className="flex gap-1">
                  <Tag tone="blue">{a.kind === "application" ? "new applicant" : "existing marketer"}</Tag>
                  <Tag tone={a.status === "pending" ? "amber" : a.status === "approved" ? "green" : "slate"}>{a.status}</Tag>
                </span>
              </div>
              <p className="text-slate-700">
                {a.products.map((p) => PRODUCT_LABEL[p]).join(" + ")} · {a.period} · {a.customerTarget || 0} customers · {money(a.depositTargetMinor)} deposits · asks{" "}
                {pct(a.requestedRateBp)}
              </p>
              <p className="text-xs text-slate-500">
                {dateTime(a.createdAtMs)} · estimate {money(a.estimatePerPeriodMinor)} per period
                {a.tiersConfigured ? ` · tiers allow up to ${a.tierMaxRateBp ? pct(a.tierMaxRateBp) : "0%"}` : " · no tiers configured"}
                {a.invitedByName ? ` · invited by ${a.invitedByName} (no recruitment commission)` : ""}
              </p>
              {a.note && <p className="text-slate-600">“{a.note}”</p>}
              {a.reviewNote && <p className="text-slate-500">Your note: {a.reviewNote}</p>}
              {a.status === "pending" && (
                <>
                  {open === a.id ? (
                    <ApproveForm
                      a={a}
                      onDone={() => {
                        setOpen(null);
                        void load();
                      }}
                    />
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Btn onClick={() => setOpen(a.id)}>Review & approve</Btn>
                      <Btn
                        variant="danger"
                        disabled={r.busy}
                        onClick={() => {
                          const why = window.prompt("Reason for rejecting (kept in the audit trail)?");
                          if (why) void r.run(() => mk("rejectApplication", { id: a.id, note: why })).then((x) => x && void load());
                        }}
                      >
                        Reject
                      </Btn>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Commission tiers + growth switches. No tier amounts are suggested: the owner enters every value. */
export function GrowthSettings({ state, reloadState }: { state: MkState; reloadState: () => Promise<void> }) {
  const s = state.settings;
  const [tiers, setTiers] = useState<{ dep: string; cust: string; rate: string }[]>(
    (s?.commissionTiers ?? []).map((t: Tier) => ({ dep: gmd(t.minDepositTargetMinor), cust: String(t.minCustomerTarget || ""), rate: String(t.rateBp / 100) })),
  );
  const [leaderboard, setLeaderboard] = useState(!!s?.leaderboardEnabled);
  const [applications, setApplications] = useState(s?.applicationsOpen !== false);
  const [saved, setSaved] = useState(false);
  const r = useRun();
  const save = () =>
    void r
      .run(() =>
        mk("saveSettings", {
          commissionTiers: tiers.map((t) => ({
            minDepositTargetMinor: t.dep === "" ? NaN : toMinorInput(t.dep),
            minCustomerTarget: t.cust === "" ? 0 : Number(t.cust),
            rateBp: Math.round(Number(t.rate) * 100),
          })),
          leaderboardEnabled: leaderboard,
          applicationsOpen: applications,
        }),
      )
      .then(async (x) => {
        if (x) {
          setSaved(true);
          await reloadState();
        }
      });
  return (
    <Panel className="space-y-3">
      <H2>Commission tiers & growth</H2>
      <p className="text-sm text-slate-600">
        Each tier says: a proposal whose targets reach this minimum may ask for up to this commission (5–15%). Until you add tiers, applicants can still send
        proposals for your review.
      </p>
      {tiers.map((t, i) => (
        <div key={i} className="grid gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-4">
          <TextInput inputMode="decimal" placeholder="Min. deposit target GMD" aria-label="Minimum deposit target in GMD" value={t.dep} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, dep: e.target.value } : x)))} />
          <TextInput inputMode="numeric" placeholder="Min. customers (optional)" aria-label="Minimum customer target" value={t.cust} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, cust: e.target.value.replace(/\D/g, "") } : x)))} />
          <TextInput inputMode="decimal" placeholder="Commission %" aria-label="Commission percent" value={t.rate} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))} />
          <Btn variant="ghost" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>
            Remove
          </Btn>
        </div>
      ))}
      <Btn variant="ghost" onClick={() => setTiers([...tiers, { dep: "", cust: "", rate: "" }])}>
        + Add tier
      </Btn>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={applications} onChange={(e) => setApplications(e.target.checked)} className="h-5 w-5" /> Accept new Become a Marketer
        applications
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={leaderboard} onChange={(e) => setLeaderboard(e.target.checked)} className="h-5 w-5" /> Show the leaderboard (marketers
        opt in; first name + initial and customer counts only)
      </label>
      <ErrorLine message={r.error} />
      <Btn disabled={r.busy} onClick={save}>
        Save
      </Btn>
      {saved && <Notice tone="green">Saved.</Notice>}
    </Panel>
  );
}
