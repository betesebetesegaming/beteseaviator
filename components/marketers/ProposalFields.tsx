"use client";

import { money, pct, PRODUCT_LABEL, toMinorInput, type Period, type Product, type Tier } from "@/lib/marketersApi";
import { Choice, Field, Notice, TextInput } from "./ui";

export interface ProposalDraft {
  products: Product[];
  period: Period;
  customerTarget: string;
  depositTarget: string; // GMD as typed
  rateBp: number;
}

export const emptyProposal = (): ProposalDraft => ({ products: [], period: "weekly", customerTarget: "", depositTarget: "", rateBp: 1000 });

export function proposalPayload(d: ProposalDraft) {
  return {
    products: d.products,
    period: d.period,
    customerTarget: d.customerTarget === "" ? 0 : Number(d.customerTarget),
    depositTargetMinor: d.depositTarget === "" ? 0 : toMinorInput(d.depositTarget),
    requestedRateBp: d.rateBp,
  };
}

/** Highest rate the owner's tiers allow for these targets (null when no tiers are set yet). */
export function allowedRate(tiers: Tier[], depositMinor: number, customers: number): number | null {
  if (!tiers.length) return null;
  let best = 0;
  for (const t of tiers) if (depositMinor >= t.minDepositTargetMinor && customers >= t.minCustomerTarget) best = Math.max(best, t.rateBp);
  return best;
}

const RATES = [500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500];

/** Fields shared by the public application and an existing marketer's new-target proposal. */
export function ProposalFields({ value, onChange, tiers }: { value: ProposalDraft; onChange: (d: ProposalDraft) => void; tiers: Tier[] }) {
  const set = (patch: Partial<ProposalDraft>) => onChange({ ...value, ...patch });
  const p = proposalPayload(value);
  const max = allowedRate(tiers, p.depositTargetMinor, p.customerTarget);
  const per = value.period === "weekly" ? "week" : "month";
  const estimate = Number.isFinite(p.depositTargetMinor) ? Math.trunc((p.depositTargetMinor * value.rateBp) / 10_000) : 0;
  const toggle = (prod: Product) => set({ products: value.products.includes(prod) ? value.products.filter((x) => x !== prod) : [...value.products, prod] });

  return (
    <div className="space-y-3">
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium text-slate-700">Product</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["football", "aviator"] as Product[]).map((prod) => (
            <label
              key={prod}
              className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 ${value.products.includes(prod) ? "border-emerald-600 bg-emerald-50" : "border-slate-300 bg-white"}`}
            >
              <input type="checkbox" checked={value.products.includes(prod)} onChange={() => toggle(prod)} className="h-5 w-5 accent-emerald-600" />
              <span className="font-semibold">{PRODUCT_LABEL[prod]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Target period">
        <Choice value={value.period} onChange={(e) => set({ period: e.target.value as Period })}>
          <option value="weekly">Weekly (Monday–Sunday)</option>
          <option value="monthly">Monthly (calendar month)</option>
        </Choice>
      </Field>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label={`New customers per ${per}`}>
          <TextInput inputMode="numeric" value={value.customerTarget} onChange={(e) => set({ customerTarget: e.target.value.replace(/\D/g, "") })} placeholder="e.g. 10" />
        </Field>
        <Field label={`Qualifying deposits per ${per} (GMD)`}>
          <TextInput inputMode="decimal" value={value.depositTarget} onChange={(e) => set({ depositTarget: e.target.value })} placeholder="e.g. 5000" />
        </Field>
      </div>
      <Field label="Requested commission" hint="Between 5% and 15%. The owner decides the final rate.">
        <Choice value={String(value.rateBp)} onChange={(e) => set({ rateBp: Number(e.target.value) })}>
          {RATES.map((r) => (
            <option key={r} value={r} disabled={max != null && r > max}>
              {pct(r)}
              {max != null && r > max ? " — not available for these targets" : ""}
            </option>
          ))}
        </Choice>
      </Field>
      {tiers.length === 0 ? (
        <Notice>The owner has not published commission tiers yet. You can still send a proposal for review.</Notice>
      ) : max === 0 ? (
        <Notice tone="amber">These targets are below the lowest commission tier.</Notice>
      ) : (
        <Notice>For these targets you can request up to {pct(max ?? 0)}.</Notice>
      )}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-semibold">Estimate only — not a promise</p>
        <p>
          If you reach exactly {p.depositTargetMinor ? money(p.depositTargetMinor) : "your deposit target"} of qualifying deposits in a {per}, {pct(value.rateBp)} would be{" "}
          <strong>{money(estimate)}</strong> for that {per}. The final rate, what is paid if the target is missed, and how long a customer&apos;s deposits
          qualify are set by the owner in your agreement, which you must accept before anything is earned.
        </p>
      </div>
    </div>
  );
}

export const QUALIFYING_SUMMARY = [
  "Only customers verified as yours count: they register after you record their number in the app, or the owner approves them.",
  "Only settled deposits into those customers' Betese accounts count, for the number of days after joining that your agreement states. Bets, winnings, bonuses and balances never count; reversals are deducted.",
  "Targets are counted per week (Monday–Sunday, Gambia time) or per calendar month. Football and Aviator are counted and paid separately.",
  "Earnings are approved by the owner before payment. Inviting other marketers never earns recruitment commission.",
];
