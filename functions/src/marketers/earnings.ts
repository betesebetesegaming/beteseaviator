/**
 * My Business & Earnings — marketer targets, owner-approved payment agreements, earnings lines
 * and payment records. Bookkeeping only: nothing here moves money, touches wallets, or shares
 * anything with the existing agent commission system (commissions.ts / agentDailyGgr).
 *
 * Every rate and amount comes from the owner. There are no default rates.
 */
import { CURRENCY, DomainError, MAX_NOTE, PRODUCTS, cleanText, sha256, type Product } from "./domain";
import { C, audit, cursorOf, deny, isOwner, parseCursor, type Caller, type Ctx } from "./service";
import type { Data, Doc, Where } from "./store";

export const E = {
  agreements: "mkAgreements",
  targets: "mkTargets",
  earnings: "mkEarnings",
  payouts: "mkPayouts",
  completions: "mkCampaignCompletions",
} as const;

const PAGE = 25;
const MAX_MINOR = 100_000_000; // GMD 1,000,000 per line — a typo guard, not a business limit

export type Metric = "new_customers" | "first_deposit_customers" | "verified_deposits";
const METRICS: Metric[] = ["new_customers", "first_deposit_customers", "verified_deposits"];
type Scope = Product | "any";

export type Term =
  | { type: "customer_reward"; product: Product; qualifies: "verified_signup" | "first_deposit"; minFirstDepositMinor: number; amountMinor: number }
  | { type: "deposit_commission"; product: Product; basisPoints: number }
  | { type: "campaign_payment"; campaignId: string; amountMinor: number };

// ---------- validation ----------

function minor(v: unknown, field: string, allowZero = false): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < (allowZero ? 0 : 1) || n > MAX_MINOR) {
    throw new DomainError("invalid-argument", `${field} must be a whole number of bututs${allowZero ? "" : " above zero"}.`);
  }
  return n;
}

function product(v: unknown): Product {
  if (!PRODUCTS.includes(v as Product)) throw new DomainError("invalid-argument", "Choose Aviator or Football.");
  return v as Product;
}

function day(v: unknown, field: string): number {
  const ms = Date.parse(`${String(v ?? "")}T00:00:00Z`);
  if (!Number.isFinite(ms)) throw new DomainError("invalid-argument", `${field} must be a date (YYYY-MM-DD).`);
  return ms;
}

export function validateTerms(input: unknown): Term[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 20) {
    throw new DomainError("invalid-argument", "Add 1–20 payment terms.");
  }
  return input.map((raw): Term => {
    const t = (raw ?? {}) as Record<string, unknown>;
    switch (t.type) {
      case "customer_reward": {
        const qualifies = t.qualifies === "first_deposit" ? "first_deposit" : t.qualifies === "verified_signup" ? "verified_signup" : null;
        if (!qualifies) throw new DomainError("invalid-argument", "Customer reward needs a qualifying event.");
        return {
          type: "customer_reward",
          product: product(t.product),
          qualifies,
          minFirstDepositMinor: qualifies === "first_deposit" ? minor(t.minFirstDepositMinor ?? 0, "Minimum first deposit", true) : 0,
          amountMinor: minor(t.amountMinor, "Reward per customer"),
        };
      }
      case "deposit_commission": {
        const bp = Number(t.basisPoints);
        if (!Number.isInteger(bp) || bp < 1 || bp > 10_000) {
          throw new DomainError("invalid-argument", "Commission must be 0.01%–100% (1–10000 basis points).");
        }
        return { type: "deposit_commission", product: product(t.product), basisPoints: bp };
      }
      case "campaign_payment": {
        const campaignId = String(t.campaignId ?? "");
        if (!/^[A-Za-z0-9_-]{6,64}$/.test(campaignId)) throw new DomainError("invalid-argument", "Choose the campaign.");
        return { type: "campaign_payment", campaignId, amountMinor: minor(t.amountMinor, "Campaign payment") };
      }
      default:
        throw new DomainError("invalid-argument", "Unknown payment term.");
    }
  });
}

// ---------- metrics (shared by targets, rewards, progress) ----------

async function accountsFor(ctx: Ctx, marketerId: string): Promise<Doc[]> {
  return ctx.store.query(C.accounts, { where: [["marketerId", "==", marketerId]], limit: 10_000 });
}

/** When the marketer acquired the account: its registration for automatic new signups, else the owner's counting start. */
function acquiredAtMs(acc: Data): number {
  return acc.attribution === "new_signup" ? Number(acc.registeredAtMs ?? acc.countFromMs) : Number(acc.countFromMs);
}

async function netDeposits(ctx: Ctx, marketerId: string, scope: Scope, fromMs: number, toMs: number): Promise<number> {
  let total = 0;
  for (const p of scope === "any" ? PRODUCTS : [scope]) {
    const base: Where[] = [
      ["marketerId", "==", marketerId],
      ["product", "==", p],
      ["currency", "==", CURRENCY],
      ["counted", "==", true],
    ];
    const range: Where[] = [
      ["depositedAtMs", ">=", fromMs],
      ["depositedAtMs", "<", toMs],
    ];
    const [dep, rev] = await Promise.all([
      ctx.store.sum(C.deposits, [...base, ["kind", "==", "deposit"], ...range], "amountMinor"),
      ctx.store.sum(C.deposits, [...base, ["kind", "==", "reversal"], ...range], "amountMinor"),
    ]);
    total += dep - rev;
  }
  return total;
}

export async function metricValue(ctx: Ctx, marketerId: string, metric: Metric, scope: Scope, fromMs: number, toMs: number): Promise<number> {
  if (metric === "verified_deposits") return netDeposits(ctx, marketerId, scope, fromMs, toMs);
  if (metric === "first_deposit_customers") {
    let n = 0;
    for (const p of scope === "any" ? PRODUCTS : [scope]) {
      n += await ctx.store.count(C.deposits, [
        ["marketerId", "==", marketerId],
        ["product", "==", p],
        ["currency", "==", CURRENCY],
        ["counted", "==", true],
        ["isFirst", "==", true],
        ["depositedAtMs", ">=", fromMs],
        ["depositedAtMs", "<", toMs],
      ]);
    }
    return n;
  }
  const contacts = new Set<string>();
  for (const a of await accountsFor(ctx, marketerId)) {
    if (a.data.counted !== true || (scope !== "any" && a.data.product !== scope)) continue;
    const t = acquiredAtMs(a.data);
    if (t >= fromMs && t < toMs) contacts.add(String(a.data.contactId));
  }
  return contacts.size;
}

// ---------- targets ----------

async function proposeTarget(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (isOwner(caller)) deny("Targets are proposed by marketers.");
  const metric = data.metric as Metric;
  if (!METRICS.includes(metric)) throw new DomainError("invalid-argument", "Choose what the target measures.");
  const scope = data.product === "any" ? "any" : product(data.product);
  const threshold = metric === "verified_deposits" ? minor(data.threshold, "Target amount") : Number(data.threshold);
  if (metric !== "verified_deposits" && (!Number.isInteger(threshold) || threshold < 1 || threshold > 100_000)) {
    throw new DomainError("invalid-argument", "Target must be a whole number of customers.");
  }
  const fromMs = day(data.from, "Start date");
  const toMs = day(data.to, "End date") + 86_400_000;
  if (toMs <= fromMs || toMs - fromMs > 366 * 86_400_000) throw new DomainError("invalid-argument", "Choose a period of up to one year.");
  const id = ctx.store.newId(E.targets);
  await ctx.store.create(`${E.targets}/${id}`, {
    marketerId: caller.uid,
    metric,
    product: scope,
    threshold,
    periodStartMs: fromMs,
    periodEndMs: toMs,
    note: cleanText(data.note, "Note", MAX_NOTE, true),
    status: "proposed",
    bonusMinor: null,
    createdAtMs: ctx.now(),
  });
  await audit(ctx, caller, "target.proposed", id, { metric, threshold });
  return { id };
}

async function withdrawTarget(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const doc = await ctx.store.get(`${E.targets}/${String(data.id ?? "")}`);
  if (!doc || doc.data.marketerId !== caller.uid) throw new DomainError("not-found", "Target not found.");
  if (doc.data.status !== "proposed") throw new DomainError("failed-precondition", "Only proposed targets can be withdrawn.");
  await ctx.store.set(`${E.targets}/${doc.id}`, { status: "withdrawn", updatedAtMs: ctx.now() }, true);
  await audit(ctx, caller, "target.withdrawn", doc.id);
  return { ok: true };
}

async function reviewTarget(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const id = String(data.id ?? "");
  const note = cleanText(data.note, "Review note", MAX_NOTE, true);
  const approve = data.decision === "approve";
  if (!approve && data.decision !== "reject") throw new DomainError("invalid-argument", "Choose approve or reject.");
  const bonusMinor = approve ? minor(data.bonusMinor, "Target bonus", true) : null;
  await ctx.store.txn(async (tx) => {
    const fresh = await tx.get(`${E.targets}/${id}`);
    if (!fresh) throw new DomainError("not-found", "Target not found.");
    if (fresh.data.status !== "proposed") throw new DomainError("failed-precondition", "This target was already decided.");
    tx.update(`${E.targets}/${id}`, {
      status: approve ? "approved" : "rejected",
      bonusMinor,
      reviewedBy: caller.uid,
      reviewedAtMs: ctx.now(),
      reviewNote: note,
    });
  });
  await audit(ctx, caller, approve ? "target.approved" : "target.rejected", id, { bonusMinor });
  return { ok: true };
}

async function listTargets(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const where: Where[] = [];
  if (!isOwner(caller)) where.push(["marketerId", "==", caller.uid]);
  else if (data.marketerId) where.push(["marketerId", "==", String(data.marketerId)]);
  if (data.status) where.push(["status", "==", String(data.status)]);
  const rows = await ctx.store.query(E.targets, { where, orderBy: ["createdAtMs", "desc"], limit: PAGE, after: parseCursor(data.cursor) });
  const now = ctx.now();
  const out = [];
  for (const r of rows) {
    const t = r.data;
    const progress =
      t.status === "approved" || t.status === "proposed"
        ? await metricValue(ctx, String(t.marketerId), t.metric as Metric, t.product as Scope, Number(t.periodStartMs), Math.min(Number(t.periodEndMs), now + 1))
        : null;
    out.push({ id: r.id, ...t, progress, ended: now >= Number(t.periodEndMs) });
  }
  return { rows: out, next: cursorOf(rows, "createdAtMs", PAGE) };
}

// ---------- agreements ----------

function termsHash(terms: Term[], fromMs: number, toMs: number | null): string {
  return sha256(JSON.stringify([terms, fromMs, toMs]));
}

async function saveAgreementDraft(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const marketer = await ctx.store.get(`users/${String(data.marketerId ?? "")}`);
  if (!marketer || marketer.data.role !== "marketer") throw new DomainError("invalid-argument", "Choose the marketer.");
  const terms = validateTerms(data.terms);
  for (const t of terms) {
    if (t.type !== "campaign_payment") continue;
    const rev = await ctx.store.get(`${C.revisions}/${t.campaignId}`);
    if (!rev || rev.data.marketerId !== marketer.id || rev.data.status !== "approved") {
      throw new DomainError("invalid-argument", "Campaign payments must reference one of this marketer's approved campaigns.");
    }
  }
  const fromMs = day(data.from, "Start date");
  const toMs = data.to ? day(data.to, "End date") + 86_400_000 : null;
  if (toMs != null && toMs <= fromMs) throw new DomainError("invalid-argument", "End date must be after the start date.");
  const id = data.id ? String(data.id) : ctx.store.newId(E.agreements);
  if (data.id) {
    const prev = await ctx.store.get(`${E.agreements}/${id}`);
    if (!prev || prev.data.status !== "draft") throw new DomainError("failed-precondition", "Only drafts can be edited. Create a new agreement.");
  }
  await ctx.store.set(`${E.agreements}/${id}`, {
    marketerId: marketer.id,
    marketerName: marketer.data.name,
    status: "draft",
    currency: CURRENCY,
    terms,
    effectiveFromMs: fromMs,
    effectiveToMs: toMs,
    note: cleanText(data.note, "Note", MAX_NOTE, true),
    createdBy: caller.uid,
    createdAtMs: ctx.now(),
  });
  await audit(ctx, caller, "agreement.draft_saved", id, { marketerId: marketer.id });
  return { id };
}

/** Approval freezes the terms. A newer approved agreement ends the previous one where it starts. */
async function approveAgreement(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const id = String(data.id ?? "");
  const doc = await ctx.store.get(`${E.agreements}/${id}`);
  if (!doc || doc.data.status !== "draft") throw new DomainError("failed-precondition", "Only drafts can be approved.");
  const a = doc.data;
  const active = (await ctx.store.query(E.agreements, { where: [["marketerId", "==", a.marketerId]], limit: 200 })).filter(
    (r) => r.data.status === "approved",
  );
  const from = Number(a.effectiveFromMs);
  for (const r of active) {
    if (Number(r.data.effectiveFromMs) >= from) {
      throw new DomainError("failed-precondition", "Another approved agreement starts on or after this date. End it first.");
    }
  }
  const hash = termsHash(a.terms as Term[], from, (a.effectiveToMs as number | null) ?? null);
  await ctx.store.txn(async (tx) => {
    const fresh = await tx.get(`${E.agreements}/${id}`);
    if (fresh?.data.status !== "draft") throw new DomainError("failed-precondition", "Already decided.");
    tx.update(`${E.agreements}/${id}`, { status: "approved", approvedBy: caller.uid, approvedAtMs: ctx.now(), termsHash: hash });
    for (const r of active) {
      const end = r.data.effectiveToMs == null ? from : Math.min(Number(r.data.effectiveToMs), from);
      tx.update(`${E.agreements}/${r.id}`, { status: "ended", effectiveToMs: end, supersededBy: id, endedAtMs: ctx.now() });
    }
  });
  await audit(ctx, caller, "agreement.approved", id, { termsHash: hash, ended: active.map((r) => r.id) });
  await recomputeEarnings(ctx, String(a.marketerId));
  return { ok: true };
}

async function endAgreement(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const doc = await ctx.store.get(`${E.agreements}/${String(data.id ?? "")}`);
  if (!doc || doc.data.status !== "approved") throw new DomainError("failed-precondition", "Only approved agreements can be ended.");
  const endMs = data.endDate ? day(data.endDate, "End date") + 86_400_000 : ctx.now();
  if (endMs <= Number(doc.data.effectiveFromMs)) throw new DomainError("invalid-argument", "End date must be after the start.");
  const to = doc.data.effectiveToMs == null ? endMs : Math.min(Number(doc.data.effectiveToMs), endMs);
  await ctx.store.set(`${E.agreements}/${doc.id}`, { status: "ended", effectiveToMs: to, endedAtMs: ctx.now(), endedBy: caller.uid }, true);
  await audit(ctx, caller, "agreement.ended", doc.id, { effectiveToMs: to });
  await recomputeEarnings(ctx, String(doc.data.marketerId));
  return { ok: true };
}

async function deleteAgreementDraft(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const doc = await ctx.store.get(`${E.agreements}/${String(data.id ?? "")}`);
  if (!doc || doc.data.status !== "draft") throw new DomainError("failed-precondition", "Only drafts can be discarded.");
  await ctx.store.set(`${E.agreements}/${doc.id}`, { status: "discarded", discardedBy: caller.uid, discardedAtMs: ctx.now() }, true);
  await audit(ctx, caller, "agreement.discarded", doc.id);
  return { ok: true };
}

async function listAgreements(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const marketerId = isOwner(caller) ? (data.marketerId ? String(data.marketerId) : null) : caller.uid;
  const where: Where[] = marketerId ? [["marketerId", "==", marketerId]] : [];
  const rows = await ctx.store.query(E.agreements, { where, orderBy: ["createdAtMs", "desc"], limit: 100 });
  return {
    rows: rows
      // Marketers only ever see what the owner approved — never drafts.
      .filter((r) => (isOwner(caller) ? r.data.status !== "discarded" : r.data.status === "approved" || r.data.status === "ended"))
      .map((r) => ({ id: r.id, ...r.data })),
  };
}

async function confirmCampaignCompleted(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const id = String(data.campaignId ?? "");
  const rev = await ctx.store.get(`${C.revisions}/${id}`);
  if (!rev || rev.data.status !== "approved") throw new DomainError("failed-precondition", "Only approved campaigns can be confirmed.");
  const note = cleanText(data.note, "Note", MAX_NOTE);
  await ctx.store.create(`${E.completions}/${id}`, { marketerId: rev.data.marketerId, confirmedBy: caller.uid, confirmedAtMs: ctx.now(), note }).catch(() => {
    throw new DomainError("already-exists", "Already confirmed.");
  });
  await audit(ctx, caller, "campaign.completion_confirmed", id, { note });
  await recomputeEarnings(ctx, String(rev.data.marketerId));
  return { ok: true };
}

// ---------- earnings engine ----------

interface Desired {
  kind: "customer_reward" | "deposit_commission" | "campaign_payment" | "target_bonus";
  amountMinor: number;
  description: string;
  basis: Data;
  agreementId: string | null;
  targetId?: string;
  period?: string;
  accountDocId?: string;
  campaignId?: string;
}

function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function* months(fromMs: number, toMs: number): Generator<[string, number, number]> {
  const d = new Date(fromMs);
  let start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  while (start < toMs) {
    const s = new Date(start);
    const next = Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 1);
    yield [monthKey(start), Math.max(start, fromMs), Math.min(next, toMs)];
    start = next;
  }
}

async function desiredLines(ctx: Ctx, marketerId: string): Promise<Map<string, Desired>> {
  const now = ctx.now();
  const out = new Map<string, Desired>();
  const agreements = (await ctx.store.query(E.agreements, { where: [["marketerId", "==", marketerId]], limit: 200 })).filter(
    (r) => r.data.status === "approved" || r.data.status === "ended",
  );
  const accounts = await accountsFor(ctx, marketerId);

  for (const ag of agreements) {
    const fromMs = Number(ag.data.effectiveFromMs);
    const toMs = Math.min(ag.data.effectiveToMs == null ? Infinity : Number(ag.data.effectiveToMs), now + 1);
    if (toMs <= fromMs) continue;
    const terms = ag.data.terms as Term[];
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i];
      if (t.type === "customer_reward") {
        for (const acc of accounts) {
          const a = acc.data;
          if (a.counted !== true || a.product !== t.product) continue;
          const at = acquiredAtMs(a);
          if (at < fromMs || at >= toMs) continue;
          if (t.qualifies === "first_deposit") {
            const firstId = a.firstDepositTxnId ? String(a.firstDepositTxnId) : "";
            const first = firstId ? await ctx.store.get(`${C.deposits}/${firstId}`) : null;
            if (!first || first.data.counted !== true || Number(first.data.amountMinor) < t.minFirstDepositMinor) continue;
          }
          out.set(`reward_${ag.id}_${i}_${acc.id}`, {
            kind: "customer_reward",
            amountMinor: t.amountMinor,
            description: `${t.product === "aviator" ? "Aviator" : "Football"} customer reward (${t.qualifies === "first_deposit" ? "first deposit" : "verified signup"})`,
            basis: { contactId: a.contactId, qualifies: t.qualifies },
            agreementId: ag.id,
            accountDocId: acc.id,
          });
        }
      } else if (t.type === "deposit_commission") {
        for (const [period, s, e] of months(fromMs, toMs)) {
          const net = await netDeposits(ctx, marketerId, t.product, s, e);
          // Floor toward zero so commission never rounds up in the marketer's favour or against them.
          const amount = Math.trunc((net * t.basisPoints) / 10_000);
          if (amount === 0) continue;
          out.set(`commission_${ag.id}_${i}_${period}`, {
            kind: "deposit_commission",
            amountMinor: amount,
            description: `${t.product === "aviator" ? "Aviator" : "Football"} commission ${(t.basisPoints / 100).toFixed(2)}% · ${period}`,
            basis: { netDepositsMinor: net, basisPoints: t.basisPoints, fromMs: s, toMs: e, periodOpen: e > now },
            agreementId: ag.id,
            period,
          });
        }
      } else if (t.type === "campaign_payment") {
        const done = await ctx.store.get(`${E.completions}/${t.campaignId}`);
        const at = Number(done?.data.confirmedAtMs ?? NaN);
        if (!done || done.data.marketerId !== marketerId || at < fromMs || at >= toMs) continue;
        out.set(`campaign_${ag.id}_${i}_${t.campaignId}`, {
          kind: "campaign_payment",
          amountMinor: t.amountMinor,
          description: "Campaign payment",
          basis: { confirmedAtMs: at },
          agreementId: ag.id,
          campaignId: t.campaignId,
        });
      }
    }
  }

  const targets = (await ctx.store.query(E.targets, { where: [["marketerId", "==", marketerId]], limit: 500 })).filter(
    (r) => r.data.status === "approved" && Number(r.data.bonusMinor ?? 0) > 0 && now >= Number(r.data.periodEndMs),
  );
  for (const t of targets) {
    const value = await metricValue(ctx, marketerId, t.data.metric as Metric, t.data.product as Scope, Number(t.data.periodStartMs), Number(t.data.periodEndMs));
    if (value < Number(t.data.threshold)) continue;
    out.set(`target_${t.id}`, {
      kind: "target_bonus",
      amountMinor: Number(t.data.bonusMinor),
      description: "Target bonus",
      basis: { metric: t.data.metric, threshold: t.data.threshold, achieved: value },
      agreementId: null,
      targetId: t.id,
    });
  }
  return out;
}

/**
 * Brings earnings lines in line with verified facts. Pending lines follow the facts; approved
 * or paid lines are never edited — a difference becomes a separate pending adjustment line.
 */
export async function recomputeEarnings(ctx: Ctx, marketerId: string): Promise<{ created: number; updated: number; adjustments: number }> {
  const desired = await desiredLines(ctx, marketerId);
  const existing = await ctx.store.query(E.earnings, { where: [["marketerId", "==", marketerId]], limit: 10_000 });
  const byKey = new Map<string, Doc[]>();
  for (const e of existing) {
    const k = String(e.data.sourceKey);
    byKey.set(k, [...(byKey.get(k) ?? []), e]);
  }
  const now = ctx.now();
  let created = 0;
  let updated = 0;
  let adjustments = 0;

  const keys = new Set<string>([...desired.keys(), ...[...byKey.keys()]]);
  for (const key of keys) {
    const want = desired.get(key);
    const lines = byKey.get(key) ?? [];
    const settled = lines.filter((l) => l.data.status === "approved" || l.data.status === "paid");
    const pending = lines.filter((l) => l.data.status === "pending");
    // An owner void is a decision: the voided amount counts as settled, so it is never recreated.
    const waived = lines
      .filter((l) => l.data.status === "void" && l.data.voidedBy)
      .reduce((n, l) => n + Number(l.data.voidedAmountMinor ?? 0), 0);
    const settledTotal = settled.reduce((n, l) => n + Number(l.data.amountMinor), 0) + waived;
    const target = want?.amountMinor ?? 0;
    const delta = target - settledTotal;
    const meta = want
      ? { description: want.description, basis: want.basis }
      : { description: "No longer earned (facts changed)", basis: { reason: "source_removed" } };

    if (pending.length) {
      // Keep at most one pending line per source; it carries whatever is not yet settled.
      const [line, ...extra] = pending;
      for (const x of extra) await ctx.store.set(`${E.earnings}/${x.id}`, { status: "void", amountMinor: 0, updatedAtMs: now }, true);
      if (delta === 0) {
        await ctx.store.set(`${E.earnings}/${line.id}`, { status: "void", amountMinor: 0, voidReason: "facts_changed", updatedAtMs: now }, true);
      } else if (Number(line.data.amountMinor) !== delta || JSON.stringify(line.data.basis) !== JSON.stringify(meta.basis)) {
        await ctx.store.set(`${E.earnings}/${line.id}`, { amountMinor: delta, ...meta, updatedAtMs: now }, true);
        updated++;
      }
      continue;
    }
    if (delta === 0) continue;
    const isAdjustment = settled.length > 0 || waived !== 0;
    const id = isAdjustment ? `${key}__adj${lines.length}` : key;
    await ctx.store.set(`${E.earnings}/${id}`, {
      marketerId,
      sourceKey: key,
      kind: isAdjustment ? "adjustment" : want!.kind,
      adjusts: isAdjustment ? settled.map((l) => l.id) : null,
      agreementId: want?.agreementId ?? (lines[0]?.data.agreementId as string | null) ?? null,
      targetId: want?.targetId ?? null,
      period: want?.period ?? null,
      accountDocId: want?.accountDocId ?? null,
      campaignId: want?.campaignId ?? null,
      ...meta,
      amountMinor: delta,
      currency: CURRENCY,
      status: "pending",
      createdAtMs: now,
      updatedAtMs: now,
    });
    if (isAdjustment) adjustments++;
    else created++;
  }
  await ctx.store.set(`${C.settings}/earnings_${marketerId}`, { lastRecomputeAtMs: now }, true);
  return { created, updated, adjustments };
}

export async function recomputeAll(ctx: Ctx): Promise<number> {
  const marketers = await ctx.store.query("users", { where: [["role", "==", "marketer"]], limit: 500 });
  for (const m of marketers) await recomputeEarnings(ctx, m.id);
  return marketers.length;
}

// ---------- earnings: list, approve, pay ----------

async function earningsSummary(ctx: Ctx, marketerId: string): Promise<Data> {
  const out: Data = { currency: CURRENCY };
  for (const status of ["pending", "approved", "paid"]) {
    out[`${status}Minor`] = await ctx.store.sum(E.earnings, [["marketerId", "==", marketerId], ["status", "==", status]], "amountMinor");
  }
  return out;
}

async function myBusiness(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const marketerId = isOwner(caller) ? String(data.marketerId ?? "") : caller.uid;
  if (!marketerId) throw new DomainError("invalid-argument", "Choose the marketer.");
  const now = ctx.now();
  const d = new Date(now);
  const monthStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const [summary, agreements, payouts, newCustomers, firstDeposits, deposits] = await Promise.all([
    earningsSummary(ctx, marketerId),
    listAgreements(ctx, caller, { marketerId }),
    ctx.store.query(E.payouts, { where: [["marketerId", "==", marketerId]], orderBy: ["paidAtMs", "desc"], limit: 10 }),
    metricValue(ctx, marketerId, "new_customers", "any", monthStart, now + 1),
    metricValue(ctx, marketerId, "first_deposit_customers", "any", monthStart, now + 1),
    metricValue(ctx, marketerId, "verified_deposits", "any", monthStart, now + 1),
  ]);
  const status = await ctx.store.get(`${C.settings}/earnings_${marketerId}`);
  return {
    summary,
    thisMonth: { newCustomers, firstDeposits, netDepositsMinor: deposits },
    agreements: (agreements as { rows: Data[] }).rows,
    payouts: payouts.map((p) => ({ id: p.id, ...p.data })),
    lastRecomputeAtMs: status?.data.lastRecomputeAtMs ?? null,
    note: "Marketer earnings are separate from agent commission and from any betting wallet. Amounts are bookkeeping until the owner records a payment.",
  };
}

async function listEarnings(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const where: Where[] = [];
  const marketerId = isOwner(caller) ? (data.marketerId ? String(data.marketerId) : null) : caller.uid;
  if (marketerId) where.push(["marketerId", "==", marketerId]);
  if (data.status) where.push(["status", "==", String(data.status)]);
  const rows = await ctx.store.query(E.earnings, { where, orderBy: ["createdAtMs", "desc"], limit: PAGE, after: parseCursor(data.cursor) });
  return {
    rows: rows.filter((r) => isOwner(caller) || r.data.status !== "void").map((r) => ({ id: r.id, ...r.data })),
    next: cursorOf(rows, "createdAtMs", PAGE),
  };
}

async function approveEarnings(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const ids = Array.isArray(data.ids) ? [...new Set(data.ids.map(String))].slice(0, 200) : [];
  if (!ids.length) throw new DomainError("invalid-argument", "Choose earnings to approve.");
  const note = cleanText(data.note, "Note", MAX_NOTE, true);
  await ctx.store.txn(async (tx) => {
    for (const id of ids) {
      const e = await tx.get(`${E.earnings}/${id}`);
      if (!e || e.data.status !== "pending") throw new DomainError("failed-precondition", "Some lines are no longer pending. Reload.");
    }
    for (const id of ids) tx.update(`${E.earnings}/${id}`, { status: "approved", approvedBy: caller.uid, approvedAtMs: ctx.now(), approvalNote: note });
  });
  await audit(ctx, caller, "earnings.approved", ids.join(","), { count: ids.length });
  return { ok: true };
}

async function voidEarning(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const note = cleanText(data.note, "Reason", MAX_NOTE);
  const id = String(data.id ?? "");
  await ctx.store.txn(async (tx) => {
    const e = await tx.get(`${E.earnings}/${id}`);
    if (!e || e.data.status !== "pending") throw new DomainError("failed-precondition", "Only pending lines can be voided.");
    tx.update(`${E.earnings}/${id}`, { status: "void", voidReason: note, voidedBy: caller.uid, voidedAtMs: ctx.now(), voidedAmountMinor: e.data.amountMinor, amountMinor: 0 });
  });
  await audit(ctx, caller, "earnings.voided", id, { note });
  return { ok: true };
}

/** Records that the owner paid the marketer outside the system. Moves no money. */
async function recordPayment(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const ids = Array.isArray(data.ids) ? [...new Set(data.ids.map(String))].slice(0, 200) : [];
  if (!ids.length) throw new DomainError("invalid-argument", "Choose approved earnings to pay.");
  const method = String(data.method ?? "");
  if (!["cash", "wave", "bank", "other"].includes(method)) throw new DomainError("invalid-argument", "Choose how it was paid.");
  const reference = cleanText(data.reference, "Payment reference", 80, true);
  const note = cleanText(data.note, "Note", MAX_NOTE, true);
  const paidAtMs = data.paidOn ? Date.parse(`${String(data.paidOn)}T12:00:00Z`) : ctx.now();
  if (!Number.isFinite(paidAtMs) || paidAtMs > ctx.now() + 86_400_000) throw new DomainError("invalid-argument", "Payment date is not valid.");
  const payoutId = ctx.store.newId(E.payouts);
  const result = await ctx.store.txn(async (tx) => {
    let marketerId: string | null = null;
    let total = 0;
    for (const id of ids) {
      const e = await tx.get(`${E.earnings}/${id}`);
      if (!e || e.data.status !== "approved") throw new DomainError("failed-precondition", "Only approved, unpaid lines can be paid.");
      if (e.data.currency !== CURRENCY) throw new DomainError("failed-precondition", "Lines in different currencies cannot be paid together.");
      if (marketerId && e.data.marketerId !== marketerId) throw new DomainError("invalid-argument", "Pay one marketer at a time.");
      marketerId = String(e.data.marketerId);
      total += Number(e.data.amountMinor);
    }
    if (total <= 0) throw new DomainError("failed-precondition", "Total to pay must be above zero.");
    tx.create(`${E.payouts}/${payoutId}`, {
      marketerId,
      earningIds: ids,
      totalMinor: total,
      currency: CURRENCY,
      method,
      reference,
      note,
      paidAtMs,
      recordedBy: caller.uid,
      recordedAtMs: ctx.now(),
    });
    for (const id of ids) tx.update(`${E.earnings}/${id}`, { status: "paid", payoutId, paidAtMs });
    return { marketerId, total };
  });
  await audit(ctx, caller, "earnings.paid", payoutId, { ...result, count: ids.length, method });
  return { payoutId, totalMinor: result.total };
}

async function listPayouts(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const marketerId = isOwner(caller) ? (data.marketerId ? String(data.marketerId) : null) : caller.uid;
  const where: Where[] = marketerId ? [["marketerId", "==", marketerId]] : [];
  const rows = await ctx.store.query(E.payouts, { where, orderBy: ["paidAtMs", "desc"], limit: PAGE, after: parseCursor(data.cursor) });
  return { rows: rows.map((r) => ({ id: r.id, ...r.data })), next: cursorOf(rows, "paidAtMs", PAGE) };
}

async function recalculate(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  if (data.marketerId) {
    const r = await recomputeEarnings(ctx, String(data.marketerId));
    await audit(ctx, caller, "earnings.recomputed", String(data.marketerId), r);
    return r;
  }
  const n = await recomputeAll(ctx);
  await audit(ctx, caller, "earnings.recomputed", "all", { marketers: n });
  return { marketers: n };
}

export const EARNINGS_ACTIONS: Record<string, (ctx: Ctx, caller: Caller, data: Data) => Promise<Data>> = {
  proposeTarget,
  withdrawTarget,
  reviewTarget,
  listTargets,
  saveAgreementDraft,
  approveAgreement,
  endAgreement,
  deleteAgreementDraft,
  listAgreements,
  confirmCampaignCompleted,
  myBusiness,
  listEarnings,
  approveEarnings,
  voidEarning,
  recordPayment,
  listPayouts,
  recalculateEarnings: recalculate,
};
