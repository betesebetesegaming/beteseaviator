/**
 * Growth features for Betese Marketers: public "Become a Marketer" applications, private invite
 * links, target + commission proposals, the approved-target card, payment requests, earnings
 * disputes, badges and an opt-in leaderboard. All bookkeeping lives in mk* collections; nothing
 * here touches wallets, player accounts, agent referral links or agent commissions.
 */
import { randomBytes } from "crypto";
import { phoneStorageKeys as phoneStorageKeysFor } from "../phone";
import {
  DomainError,
  MAX_NOTE,
  PRODUCTS,
  RATE_MAX_BP,
  RATE_MIN_BP,
  canonicalPhone,
  cleanName,
  cleanText,
  displayName,
  periodEnd,
  periodStart,
  qualifyingText,
  sha256,
  tierMaxRate,
  type Period,
  type Product,
} from "./domain";
import {
  E,
  EARNINGS_ACTIONS,
  accountsFor,
  agreementView,
  createApprovedVersion,
  earningsSummary,
  metricValue,
  recomputeEarnings,
  targetCommissionPeriods,
  validateTargetCommission,
  type TargetCommission,
  type Term,
} from "./earnings";
import { C, audit, createMarketerAccount, cursorOf, deny, isOwner, loadSettings, matchContact, parseCursor, type Caller, type Ctx } from "./service";
import { AlreadyExistsError, type Data, type Doc, type Where } from "./store";

export const G = {
  applications: "mkApplications",
  invites: "mkInvites",
  paymentRequests: "mkPaymentRequests",
  disputes: "mkEarningDisputes",
  rateLimits: "mkRateLimits",
  shareLinks: "mkShareLinks",
} as const;

const PAGE = 25;
const APPLY_PER_IP_PER_HOUR = 5;
const SITE = "https://beteseaviator.com";

// ---------- shared proposal validation ----------

interface Proposal {
  products: Product[];
  period: Period;
  customerTarget: number;
  depositTargetMinor: number;
  requestedRateBp: number;
}

function cleanProposal(data: Data): Proposal {
  // Reuse the agreement validator so a proposal can never hold terms an agreement could not.
  const t = validateTargetCommission({
    type: "target_commission",
    products: data.products,
    period: data.period,
    customerTarget: data.customerTarget,
    depositTargetMinor: data.depositTargetMinor,
    rateBp: data.requestedRateBp,
    missedRateBp: 0,
    qualifyingDays: 1,
  });
  return {
    products: t.products,
    period: t.period,
    customerTarget: t.customerTarget,
    depositTargetMinor: t.depositTargetMinor,
    requestedRateBp: t.rateBp,
  };
}

/** Per-period estimate if the deposit target is exactly met at the requested rate. Labelled as an estimate everywhere. */
function estimateMinor(p: Proposal): number {
  return Math.trunc((p.depositTargetMinor * p.requestedRateBp) / 10_000);
}

async function tierCheck(ctx: Ctx, p: Proposal): Promise<{ maxRateBp: number | null; tiersConfigured: boolean }> {
  const { commissionTiers } = await loadSettings(ctx.store);
  const max = tierMaxRate(commissionTiers, p.depositTargetMinor, p.customerTarget);
  if (max != null && p.requestedRateBp > max) {
    throw new DomainError(
      "failed-precondition",
      max ? `For these targets the highest commission you can request is ${(max / 100).toFixed(2)}%.` : "These targets are below the lowest commission tier.",
    );
  }
  return { maxRateBp: max, tiersConfigured: commissionTiers.length > 0 };
}

function conditionsFor(p: Proposal, qualifyingDays: number | null): string[] {
  return qualifyingText({ ...p, rateBp: p.requestedRateBp, missedRateBp: 0, qualifyingDays }).map((line) =>
    line.startsWith("Commission:") ? `Commission requested: ${(p.requestedRateBp / 100).toFixed(2)}% of qualifying deposits in a period where the target is met. What is paid if the target is missed is set by the owner in the final agreement.` : line,
  );
}

// ---------- public: Become a Marketer ----------

async function inviteMarketer(ctx: Ctx, code: unknown): Promise<string | null> {
  const c = String(code ?? "").trim();
  if (!/^[A-Za-z0-9]{8,24}$/.test(c)) return null;
  const doc = await ctx.store.get(`${G.invites}/${c}`);
  if (!doc || doc.data.active !== true) return null;
  const m = await ctx.store.get(`users/${String(doc.data.marketerId)}`);
  return m && m.data.role === "marketer" && m.data.status === "active" ? m.id : null;
}

async function applicationInfo(ctx: Ctx, data: Data): Promise<Data> {
  const s = await loadSettings(ctx.store);
  return {
    open: s.applicationsOpen,
    rateRange: { minBp: RATE_MIN_BP, maxBp: RATE_MAX_BP },
    tiers: s.commissionTiers,
    tiersConfigured: s.commissionTiers.length > 0,
    inviteValid: data.invite ? (await inviteMarketer(ctx, data.invite)) != null : null,
  };
}

/** Counts one attempt for this key in the current hour; throws once the limit is reached. */
async function rateLimit(ctx: Ctx, key: string, limit: number): Promise<void> {
  const hour = Math.floor(ctx.now() / 3_600_000);
  const path = `${G.rateLimits}/${sha256(`${key}|${hour}`).slice(0, 40)}`;
  await ctx.store.txn(async (tx) => {
    const doc = await tx.get(path);
    const n = Number(doc?.data.count ?? 0);
    if (n >= limit) throw new DomainError("failed-precondition", "Too many applications from this connection. Try again later.");
    tx.set(path, { count: n + 1, hour }, true);
  });
}

async function apply(ctx: Ctx, data: Data, meta: { ip: string }): Promise<Data> {
  const s = await loadSettings(ctx.store);
  if (!s.applicationsOpen) throw new DomainError("failed-precondition", "Applications are closed at the moment.");
  if (data.consent !== true) throw new DomainError("invalid-argument", "Please agree that Betese may contact you about this application.");
  const name = cleanName(data.name, 2, 60);
  const phone = canonicalPhone(data.phone);
  const proposal = cleanProposal(data);
  const note = cleanText(data.note, "Message", MAX_NOTE, true);
  const { maxRateBp, tiersConfigured } = await tierCheck(ctx, proposal);
  await rateLimit(ctx, `ip:${meta.ip}`, APPLY_PER_IP_PER_HOUR);

  for (const k of phoneStorageKeysFor(phone.key)) {
    const login = await ctx.store.get(`staffLogins/${k}`);
    if (login?.data.role === "marketer") throw new DomainError("already-exists", "This phone already has a marketer account. Sign in at /s.");
  }
  const pending = await ctx.store.query(G.applications, {
    where: [
      ["phoneKey", "==", phone.key],
      ["status", "==", "pending"],
    ],
    limit: 1,
  });
  if (pending.length) throw new DomainError("already-exists", "An application for this phone is already waiting for review.");

  const invitedBy = data.invite ? await inviteMarketer(ctx, data.invite) : null;
  const id = ctx.store.newId(G.applications);
  await ctx.store.create(`${G.applications}/${id}`, {
    kind: "application",
    status: "pending",
    name,
    phoneKey: phone.key,
    phoneE164: phone.e164,
    ...proposal,
    estimatePerPeriodMinor: estimateMinor(proposal),
    tierMaxRateBp: maxRateBp,
    tiersConfigured,
    note,
    invitedBy,
    marketerId: null,
    ipHash: sha256(`apply|${meta.ip}`).slice(0, 16),
    createdAtMs: ctx.now(),
  });
  await audit(ctx, null, "application.submitted", id, { invited: !!invitedBy, products: proposal.products });
  return {
    reference: id.slice(-8).toUpperCase(),
    estimatePerPeriodMinor: estimateMinor(proposal),
    conditions: conditionsFor(proposal, null),
  };
}

export const PUBLIC_ACTIONS: Record<string, (ctx: Ctx, data: Data, meta: { ip: string }) => Promise<Data>> = {
  applicationInfo: (ctx, data) => applicationInfo(ctx, data),
  apply,
  shareLinkInfo: (ctx, data) => shareLinkInfo(ctx, data),
};

// ---------- marketers: invite link + new target proposal ----------

function newInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return [...randomBytes(12)].map((b) => alphabet[b % alphabet.length]).join("");
}

/** Opaque code only — the link never carries a name, phone or account id. */
async function myInvite(ctx: Ctx, caller: Caller): Promise<Data> {
  if (isOwner(caller)) deny("Invite links are for marketers.");
  const existing = await ctx.store.query(G.invites, { where: [["marketerId", "==", caller.uid]], limit: 5 });
  let code = existing.find((d) => d.data.active === true)?.id;
  if (!code) {
    code = newInviteCode();
    await ctx.store.create(`${G.invites}/${code}`, { marketerId: caller.uid, active: true, createdAtMs: ctx.now() });
    await audit(ctx, caller, "invite.created", code);
  }
  return {
    code,
    url: `${SITE}/staff/apply?invite=${code}`,
    note: "Anyone with this link can apply. You are recorded as the inviter; there is no automatic recruitment commission.",
  };
}

// ---------- marketers: personal share link for customers ----------

const SHARE_SLUG = /^[a-z]{1,16}-[a-z0-9]{4}$/;

/** First name only, lower-case letters, so the link shows who shared it without exposing the sign-in name. */
function shareFirstName(name: string): string {
  const first = name
    .replace(/^TEST\s+/i, "")
    .trim()
    .split(/\s+/)[0]
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, 16);
  return first || "betese";
}

function displayFirstName(name: unknown): string | null {
  return String(name ?? "").replace(/^TEST\s+/i, "").trim().split(/\s+/)[0] || null;
}

function newShareSuffix(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return [...randomBytes(4)].map((b) => alphabet[b % alphabet.length]).join("");
}

/**
 * One stable link per marketer: /join/<first-name>-<4 random>. It opens a page naming the marketer with
 * buttons to the owner-approved Football and Aviator sites. It does not create accounts or prove attribution —
 * the marketer still records the customer's number, and provider matching verifies the signup.
 */
async function myShareLink(ctx: Ctx, caller: Caller): Promise<Data> {
  if (isOwner(caller)) deny("Share links are for marketers.");
  const existing = await ctx.store.query(G.shareLinks, { where: [["marketerId", "==", caller.uid]], limit: 5 });
  let slug = existing.find((d) => d.data.active === true)?.id;
  if (!slug) {
    const me = await ctx.store.get(`users/${caller.uid}`);
    const first = shareFirstName(String(me?.data.name ?? caller.name ?? ""));
    for (let i = 0; i < 5 && !slug; i++) {
      const candidate = `${first}-${newShareSuffix()}`;
      try {
        await ctx.store.create(`${G.shareLinks}/${candidate}`, { marketerId: caller.uid, active: true, createdAtMs: ctx.now() });
        slug = candidate;
      } catch (e) {
        if (!(e instanceof AlreadyExistsError)) throw e;
      }
    }
    if (!slug) throw new DomainError("failed-precondition", "Could not create a link. Try again.");
    await audit(ctx, caller, "share_link.created", slug);
  }
  return {
    slug,
    url: `${SITE}/join/${slug}`,
    note: "Your link opens a Betese page showing your first name, with buttons to the Football and Aviator websites. Customers still create their own accounts, and you still add them under Customers so their signup can be verified as yours.",
  };
}

/** Public: what the /join page shows. Only the marketer's first name and the owner-approved links. */
async function shareLinkInfo(ctx: Ctx, data: Data): Promise<Data> {
  const s = await loadSettings(ctx.store);
  const links = s.links.map((l) => ({ id: l.id, label: l.label, product: l.product, url: l.url }));
  const none = { valid: false, firstName: null, links };
  const slug = String(data.slug ?? "").trim().toLowerCase();
  if (!SHARE_SLUG.test(slug)) return none;
  const doc = await ctx.store.get(`${G.shareLinks}/${slug}`);
  if (!doc || doc.data.active !== true) return none;
  const m = await ctx.store.get(`users/${String(doc.data.marketerId)}`);
  if (!m || m.data.role !== "marketer" || m.data.status !== "active") return none;
  return { valid: true, firstName: displayFirstName(m.data.name), links };
}

/**
 * Called by Aviator sign-up (server side, after the phone was verified by OTP) when the customer arrived
 * through a share link. The slug is only a pointer: it is checked here against an active link of an active
 * marketer, so nothing on the device decides who gets the credit. The first record of a number is kept —
 * a customer a marketer already recorded is never moved to another marketer.
 */
export async function recordShareLinkSignup(
  ctx: Ctx,
  input: { slug: unknown; accountId: string; phone: string; name: string },
): Promise<{ state: "recorded" | "already_recorded" | "invalid_link" }> {
  const slug = String(input.slug ?? "").trim().toLowerCase();
  if (!SHARE_SLUG.test(slug)) return { state: "invalid_link" };
  const link = await ctx.store.get(`${G.shareLinks}/${slug}`);
  if (!link || link.data.active !== true) return { state: "invalid_link" };
  const m = await ctx.store.get(`users/${String(link.data.marketerId)}`);
  if (!m || m.data.role !== "marketer" || m.data.status !== "active") return { state: "invalid_link" };

  const phone = canonicalPhone(input.phone);
  const now = ctx.now();
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || "Customer";
  try {
    await ctx.store.create(`${C.contacts}/${phone.key}`, {
      phoneKey: phone.key,
      phoneE164: phone.e164,
      name,
      searchName: name.toLowerCase(),
      marketerId: m.id,
      marketerName: String(m.data.name ?? ""),
      recordedAtMs: now,
      recordedBy: "share_link",
      products: ["aviator"],
      // Aviator sign-up itself requires the 18+ confirmation.
      adultConfirmed: true,
      status: "active",
      // No SMS consent was collected by the marketer, so campaigns exclude this customer.
      consent: {
        sms: false,
        wordingVersion: null,
        source: "share_link_signup",
        collectedBy: null,
        collectedAtMs: null,
        revokedAtMs: null,
        revokedBy: null,
      },
      signup: { product: "aviator", accountId: input.accountId, slug, atMs: now },
      accounts: { aviator: { state: "pending" } },
      verifiedProducts: [],
      verifiedCount: 0,
      updatedAtMs: now,
    });
  } catch (e) {
    if (e instanceof AlreadyExistsError) return { state: "already_recorded" };
    throw e;
  }
  await audit(ctx, null, "contact.share_link_signup", phone.key, { marketerId: m.id, slug });
  await matchContact(ctx, phone.key);
  return { state: "recorded" };
}

async function proposeTerms(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (isOwner(caller)) deny("Proposals come from marketers.");
  const proposal = cleanProposal(data);
  const note = cleanText(data.note, "Note", MAX_NOTE, true);
  const { maxRateBp, tiersConfigured } = await tierCheck(ctx, proposal);
  const open = await ctx.store.query(G.applications, {
    where: [
      ["marketerId", "==", caller.uid],
      ["status", "==", "pending"],
    ],
    limit: 1,
  });
  if (open.length) throw new DomainError("already-exists", "You already have a proposal waiting for the owner.");
  const me = await ctx.store.get(`users/${caller.uid}`);
  const id = ctx.store.newId(G.applications);
  await ctx.store.create(`${G.applications}/${id}`, {
    kind: "target_proposal",
    status: "pending",
    name: me?.data.name ?? caller.name,
    phoneKey: me?.data.phone ?? null,
    ...proposal,
    estimatePerPeriodMinor: estimateMinor(proposal),
    tierMaxRateBp: maxRateBp,
    tiersConfigured,
    note,
    invitedBy: null,
    marketerId: caller.uid,
    createdAtMs: ctx.now(),
  });
  await audit(ctx, caller, "proposal.submitted", id, { requestedRateBp: proposal.requestedRateBp });
  return { id, estimatePerPeriodMinor: estimateMinor(proposal), conditions: conditionsFor(proposal, null) };
}

// ---------- owner: review applications and proposals ----------

function applicationView(d: Doc, owner: boolean): Data {
  const a = d.data;
  return {
    id: d.id,
    kind: a.kind,
    status: a.status,
    name: a.name,
    ...(owner ? { phone: a.phoneE164 ?? null, invitedBy: a.invitedBy ?? null, marketerId: a.marketerId ?? null } : {}),
    products: a.products,
    period: a.period,
    customerTarget: a.customerTarget,
    depositTargetMinor: a.depositTargetMinor,
    requestedRateBp: a.requestedRateBp,
    estimatePerPeriodMinor: a.estimatePerPeriodMinor,
    tierMaxRateBp: a.tierMaxRateBp ?? null,
    tiersConfigured: a.tiersConfigured,
    note: a.note,
    createdAtMs: a.createdAtMs,
    reviewNote: a.reviewNote ?? null,
    agreementId: a.agreementId ?? null,
  };
}

async function listApplications(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const where: Where[] = [];
  if (!isOwner(caller)) where.push(["marketerId", "==", caller.uid]);
  if (data.status) where.push(["status", "==", String(data.status)]);
  const rows = await ctx.store.query(G.applications, { where, orderBy: ["createdAtMs", "desc"], limit: PAGE, after: parseCursor(data.cursor) });
  const out = [];
  for (const r of rows) {
    const v = applicationView(r, isOwner(caller));
    if (isOwner(caller) && r.data.invitedBy) {
      const inviter = await ctx.store.get(`users/${String(r.data.invitedBy)}`);
      v.invitedByName = inviter?.data.name ?? null;
    }
    out.push(v);
  }
  return { rows: out, next: cursorOf(rows, "createdAtMs", PAGE) };
}

async function claimForReview(ctx: Ctx, id: string): Promise<Doc> {
  return ctx.store.txn(async (tx) => {
    const doc = await tx.get(`${G.applications}/${id}`);
    if (!doc) throw new DomainError("not-found", "Application not found.");
    if (doc.data.status !== "pending") throw new DomainError("failed-precondition", "This application was already decided.");
    tx.update(`${G.applications}/${id}`, { status: "reviewing", reviewStartedAtMs: ctx.now() });
    return doc;
  });
}

async function rejectApplication(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const id = String(data.id ?? "");
  const note = cleanText(data.note, "Reason", MAX_NOTE);
  await claimForReview(ctx, id);
  await ctx.store.set(`${G.applications}/${id}`, { status: "rejected", reviewedBy: caller.uid, reviewedAtMs: ctx.now(), reviewNote: note }, true);
  await audit(ctx, caller, "application.rejected", id, { note });
  return { ok: true };
}

/**
 * The owner sets the final terms (they may differ from the request). This creates the marketer
 * login for a new applicant, and an agreement version that waits for the marketer's acceptance.
 */
async function approveApplication(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const id = String(data.id ?? "");
  const term = validateTargetCommission({ ...data, type: "target_commission" }) as TargetCommission;
  const fromMs = Date.parse(`${String(data.from ?? "")}T00:00:00Z`);
  if (!Number.isFinite(fromMs)) throw new DomainError("invalid-argument", "Choose the start date.");
  const toMs = data.to ? Date.parse(`${String(data.to)}T00:00:00Z`) + 86_400_000 : null;
  if (toMs != null && (!Number.isFinite(toMs) || toMs <= fromMs)) throw new DomainError("invalid-argument", "End date must be after the start date.");
  const note = cleanText(data.note, "Note", MAX_NOTE, true);
  const doc = await claimForReview(ctx, id);
  const a = doc.data;
  try {
    let marketerId = a.marketerId ? String(a.marketerId) : "";
    let marketerName = String(a.name);
    let signIn: unknown = null;
    if (a.kind === "application") {
      const created = await createMarketerAccount(ctx, caller, {
        name: a.name,
        phone: a.phoneKey,
        password: data.password,
        invitedBy: (a.invitedBy as string | null) ?? null,
        applicationId: id,
      });
      marketerId = String(created.uid);
      signIn = created.signIn;
    } else {
      const m = await ctx.store.get(`users/${marketerId}`);
      if (!m || m.data.role !== "marketer") throw new DomainError("failed-precondition", "This marketer no longer exists.");
      marketerName = String(m.data.name);
    }
    const agreementId = await createApprovedVersion(ctx, caller, {
      marketerId,
      marketerName,
      terms: [term as Term],
      fromMs,
      toMs,
      note,
      sourceId: id,
    });
    await ctx.store.set(
      `${G.applications}/${id}`,
      { status: "approved", reviewedBy: caller.uid, reviewedAtMs: ctx.now(), reviewNote: note, agreementId, marketerId, approvedTerms: term },
      true,
    );
    await audit(ctx, caller, "application.approved", id, { agreementId, marketerId, rateBp: term.rateBp });
    return { ok: true, agreementId, marketerId, signIn };
  } catch (e) {
    // Release the claim so the owner can correct the input and try again.
    await ctx.store.set(`${G.applications}/${id}`, { status: "pending" }, true);
    throw e;
  }
}

// ---------- approved target card ----------

async function myTargetCard(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const marketerId = isOwner(caller) ? String(data.marketerId ?? "") : caller.uid;
  if (!marketerId) throw new DomainError("invalid-argument", "Choose the marketer.");
  const now = ctx.now();
  const agreements = await ctx.store.query(E.agreements, { where: [["marketerId", "==", marketerId]], limit: 200 });
  const active = agreements.find((r) => r.data.status === "active") ?? null;
  const awaiting = agreements.filter((r) => r.data.status === "awaiting_acceptance").map((r) => agreementView(r));
  const summary = await earningsSummary(ctx, marketerId);
  const accepted = agreements.filter((r) => r.data.acceptedAtMs != null);
  const chainStart = Math.min(...accepted.map((r) => Number(r.data.earningFromMs)), Infinity);

  let target: Data | null = null;
  if (active) {
    const terms = active.data.terms as Term[];
    const t = terms.find((x): x is TargetCommission => x.type === "target_commission");
    if (t) {
      const from = Math.max(Number(active.data.earningFromMs), periodStart(t.period, now));
      const end = Math.min(periodEnd(t.period, periodStart(t.period, now)), active.data.effectiveToMs == null ? Infinity : Number(active.data.effectiveToMs));
      const [current] = await targetCommissionPeriods(ctx, marketerId, t, from, Math.max(end, from + 1), chainStart);
      const history = await targetCommissionPeriods(ctx, marketerId, t, Number(active.data.earningFromMs), periodStart(t.period, now), chainStart);
      target = {
        agreementId: active.id,
        products: t.products,
        period: t.period,
        customerTarget: t.customerTarget,
        depositTargetMinor: t.depositTargetMinor,
        rateBp: t.rateBp,
        missedRateBp: t.missedRateBp,
        qualifyingDays: t.qualifyingDays,
        startMs: active.data.earningFromMs,
        endMs: active.data.effectiveToMs ?? null,
        conditions: qualifyingText(t),
        current: current
          ? {
              key: current.key,
              startMs: current.startMs,
              endMs: current.endMs,
              newCustomers: current.newCustomers,
              customersRemaining: Math.max(0, t.customerTarget - current.newCustomers),
              qualifyingMinor: current.totalQualifyingMinor,
              qualifyingByProduct: current.byProduct,
              depositsRemainingMinor: Math.max(0, t.depositTargetMinor - current.totalQualifyingMinor),
              met: current.met,
            }
          : null,
        history: history.slice(-6).map((h) => ({ key: h.key, met: h.met, newCustomers: h.newCustomers, qualifyingMinor: h.totalQualifyingMinor })),
      };
    }
  }
  return { target, awaiting, summary, badges: await badgesFor(ctx, marketerId) };
}

// ---------- badges (recognition only, never money) ----------

async function badgesFor(ctx: Ctx, marketerId: string): Promise<Data[]> {
  const accounts = (await accountsFor(ctx, marketerId)).filter((a) => a.data.counted === true);
  const customers = new Set(accounts.map((a) => String(a.data.contactId))).size;
  const earnings = await ctx.store.query(E.earnings, { where: [["marketerId", "==", marketerId]], limit: 10_000 });
  const metKeys = new Set(
    earnings.filter((e) => e.data.kind === "target_commission" && (e.data.basis as Data)?.met === true && (e.data.basis as Data)?.periodOpen === false).map((e) => String(e.data.period)),
  );
  const paid = (await ctx.store.query(E.payouts, { where: [["marketerId", "==", marketerId]], limit: 1 })).length > 0;
  const badges = [
    { id: "first_customer", label: "First verified customer", earned: customers >= 1 },
    { id: "customers_10", label: "10 verified customers", earned: customers >= 10 },
    { id: "customers_50", label: "50 verified customers", earned: customers >= 50 },
    { id: "customers_100", label: "100 verified customers", earned: customers >= 100 },
    { id: "target_met", label: "Target met", earned: metKeys.size >= 1 },
    { id: "target_met_3", label: "Target met 3 times", earned: metKeys.size >= 3 },
    { id: "first_payment", label: "First payment received", earned: paid },
  ];
  return badges;
}

// ---------- leaderboard (opt-in, first name + initial, counts only) ----------

async function leaderboard(ctx: Ctx, caller: Caller): Promise<Data> {
  const s = await loadSettings(ctx.store);
  if (!s.leaderboardEnabled) return { enabled: false };
  const now = ctx.now();
  const d = new Date(now);
  const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const marketers = (await ctx.store.query("users", { where: [["role", "==", "marketer"]], limit: 500 })).filter((m) => m.data.status === "active");
  const rows: Data[] = [];
  let myOptIn = false;
  for (const m of marketers) {
    const pref = await ctx.store.get(`${C.settings}/pref_${m.id}`);
    const optIn = pref?.data.leaderboardOptIn === true;
    if (m.id === caller.uid) myOptIn = optIn;
    if (!optIn) continue;
    const counts: Data = {};
    let total = 0;
    for (const p of PRODUCTS) {
      const n = await metricValue(ctx, m.id, "new_customers", p, from, now + 1);
      counts[p] = n;
      total += n;
    }
    rows.push({ name: displayName(String(m.data.name)), aviator: counts.aviator, football: counts.football, total, me: m.id === caller.uid });
  }
  rows.sort((a, b) => Number(b.total) - Number(a.total));
  rows.forEach((r, i) => (r.rank = i + 1));
  return {
    enabled: true,
    month: new Date(from).toISOString().slice(0, 7),
    measure: "New verified customers this month (Aviator and Football shown separately)",
    rows: rows.slice(0, 20),
    myOptIn,
    privacy: "Only marketers who opt in are shown, as first name and initial. No phone numbers, customer details or earnings.",
  };
}

async function setLeaderboardOptIn(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (isOwner(caller)) deny("This setting is for marketers.");
  await ctx.store.set(`${C.settings}/pref_${caller.uid}`, { leaderboardOptIn: data.optIn === true, updatedAtMs: ctx.now() }, true);
  await audit(ctx, caller, "leaderboard.opt_in", caller.uid, { optIn: data.optIn === true });
  return { ok: true };
}

// ---------- payment requests ----------

async function requestPayment(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (isOwner(caller)) deny("Payment requests come from marketers.");
  const approved = await ctx.store.query(E.earnings, {
    where: [
      ["marketerId", "==", caller.uid],
      ["status", "==", "approved"],
    ],
    limit: 500,
  });
  const open = await ctx.store.query(G.paymentRequests, {
    where: [
      ["marketerId", "==", caller.uid],
      ["status", "==", "open"],
    ],
    limit: 20,
  });
  const locked = new Set(open.flatMap((r) => r.data.earningIds as string[]));
  const wanted = Array.isArray(data.earningIds) && data.earningIds.length ? new Set(data.earningIds.map(String)) : null;
  const lines = approved.filter((e) => !locked.has(e.id) && (!wanted || wanted.has(e.id)));
  if (wanted && lines.length !== wanted.size) throw new DomainError("failed-precondition", "Only your approved, unrequested earnings can be requested.");
  const total = lines.reduce((n, e) => n + Number(e.data.amountMinor), 0);
  if (!lines.length || total <= 0) throw new DomainError("failed-precondition", "You have no approved earnings to request yet.");
  const method = ["wave", "cash", "bank", "other"].includes(String(data.method)) ? String(data.method) : "wave";
  const id = ctx.store.newId(G.paymentRequests);
  await ctx.store.create(`${G.paymentRequests}/${id}`, {
    marketerId: caller.uid,
    marketerName: caller.name,
    earningIds: lines.map((e) => e.id),
    totalMinor: total,
    currency: "GMD",
    method,
    note: cleanText(data.note, "Note", MAX_NOTE, true),
    status: "open",
    createdAtMs: ctx.now(),
  });
  await audit(ctx, caller, "payment_request.created", id, { totalMinor: total });
  return { id, totalMinor: total };
}

async function cancelPaymentRequest(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const doc = await ctx.store.get(`${G.paymentRequests}/${String(data.id ?? "")}`);
  if (!doc || doc.data.marketerId !== caller.uid) throw new DomainError("not-found", "Request not found.");
  if (doc.data.status !== "open") throw new DomainError("failed-precondition", "Only open requests can be cancelled.");
  await ctx.store.set(`${G.paymentRequests}/${doc.id}`, { status: "cancelled", closedAtMs: ctx.now() }, true);
  await audit(ctx, caller, "payment_request.cancelled", doc.id);
  return { ok: true };
}

async function listPaymentRequests(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const where: Where[] = [];
  if (!isOwner(caller)) where.push(["marketerId", "==", caller.uid]);
  else if (data.marketerId) where.push(["marketerId", "==", String(data.marketerId)]);
  if (data.status) where.push(["status", "==", String(data.status)]);
  const rows = await ctx.store.query(G.paymentRequests, { where, orderBy: ["createdAtMs", "desc"], limit: PAGE, after: parseCursor(data.cursor) });
  return { rows: rows.map((r) => ({ id: r.id, ...r.data })), next: cursorOf(rows, "createdAtMs", PAGE) };
}

/** Owner pays a request: records the payment (no money moves) and closes the request. */
async function payPaymentRequest(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny("Only the owner approves payouts.");
  const doc = await ctx.store.get(`${G.paymentRequests}/${String(data.id ?? "")}`);
  if (!doc || doc.data.status !== "open") throw new DomainError("failed-precondition", "Only open requests can be paid.");
  const res = await EARNINGS_ACTIONS.recordPayment(ctx, caller, {
    ids: doc.data.earningIds,
    method: data.method ?? doc.data.method,
    reference: data.reference,
    paidOn: data.paidOn,
    note: data.note,
  });
  await ctx.store.set(`${G.paymentRequests}/${doc.id}`, { status: "paid", payoutId: res.payoutId, closedAtMs: ctx.now(), closedBy: caller.uid }, true);
  await audit(ctx, caller, "payment_request.paid", doc.id, { payoutId: res.payoutId });
  return res;
}

async function rejectPaymentRequest(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const doc = await ctx.store.get(`${G.paymentRequests}/${String(data.id ?? "")}`);
  if (!doc || doc.data.status !== "open") throw new DomainError("failed-precondition", "Only open requests can be rejected.");
  const note = cleanText(data.note, "Reason", MAX_NOTE);
  await ctx.store.set(`${G.paymentRequests}/${doc.id}`, { status: "rejected", closedAtMs: ctx.now(), closedBy: caller.uid, reviewNote: note }, true);
  await audit(ctx, caller, "payment_request.rejected", doc.id, { note });
  return { ok: true };
}

// ---------- earnings disputes ----------

async function raiseEarningsDispute(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (isOwner(caller)) deny("Disputes are raised by marketers.");
  const message = cleanText(data.message, "Message", MAX_NOTE);
  let earningId: string | null = null;
  if (data.earningId) {
    const e = await ctx.store.get(`${E.earnings}/${String(data.earningId)}`);
    if (!e || e.data.marketerId !== caller.uid) throw new DomainError("not-found", "Earnings line not found.");
    earningId = e.id;
  }
  const id = ctx.store.newId(G.disputes);
  await ctx.store.create(`${G.disputes}/${id}`, { marketerId: caller.uid, marketerName: caller.name, earningId, message, status: "open", createdAtMs: ctx.now() });
  await audit(ctx, caller, "earnings_dispute.raised", id, { earningId });
  return { id };
}

async function listEarningsDisputes(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const where: Where[] = [];
  if (!isOwner(caller)) where.push(["marketerId", "==", caller.uid]);
  else if (data.marketerId) where.push(["marketerId", "==", String(data.marketerId)]);
  if (data.status) where.push(["status", "==", String(data.status)]);
  const rows = await ctx.store.query(G.disputes, { where, orderBy: ["createdAtMs", "desc"], limit: PAGE, after: parseCursor(data.cursor) });
  return { rows: rows.map((r) => ({ id: r.id, ...r.data })), next: cursorOf(rows, "createdAtMs", PAGE) };
}

/** Owner closes a dispute; an optional adjustment becomes a pending line that still needs approval. */
async function resolveEarningsDispute(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const id = String(data.id ?? "");
  const doc = await ctx.store.get(`${G.disputes}/${id}`);
  if (!doc || doc.data.status !== "open") throw new DomainError("failed-precondition", "Only open disputes can be resolved.");
  const decision = data.decision === "resolved" ? "resolved" : data.decision === "rejected" ? "rejected" : null;
  if (!decision) throw new DomainError("invalid-argument", "Choose resolved or rejected.");
  const note = cleanText(data.note, "Answer", MAX_NOTE);
  const adj = data.adjustmentMinor == null || data.adjustmentMinor === "" ? 0 : Number(data.adjustmentMinor);
  if (!Number.isInteger(adj) || Math.abs(adj) > 100_000_000) throw new DomainError("invalid-argument", "Adjustment must be whole bututs.");
  if (adj && decision !== "resolved") throw new DomainError("invalid-argument", "Only a resolved dispute can include an adjustment.");
  if (adj) {
    try {
      await ctx.store.create(`${E.earnings}/manual_${id}`, {
        marketerId: doc.data.marketerId,
        sourceKey: `manual_${id}`,
        kind: "manual_adjustment",
        disputeId: id,
        description: `Adjustment from dispute: ${note.slice(0, 80)}`,
        basis: { disputeId: id, earningId: doc.data.earningId ?? null },
        amountMinor: adj,
        currency: "GMD",
        status: "pending",
        createdBy: caller.uid,
        createdAtMs: ctx.now(),
        updatedAtMs: ctx.now(),
      });
    } catch (e) {
      if (!(e instanceof AlreadyExistsError)) throw e;
    }
  }
  await ctx.store.set(`${G.disputes}/${id}`, { status: decision, resolution: note, adjustmentMinor: adj, resolvedBy: caller.uid, resolvedAtMs: ctx.now() }, true);
  await audit(ctx, caller, `earnings_dispute.${decision}`, id, { adjustmentMinor: adj });
  await recomputeEarnings(ctx, String(doc.data.marketerId)).catch(() => undefined);
  return { ok: true };
}

export const GROWTH_ACTIONS: Record<string, (ctx: Ctx, caller: Caller, data: Data) => Promise<Data>> = {
  myInvite: (ctx, c) => myInvite(ctx, c),
  myShareLink: (ctx, c) => myShareLink(ctx, c),
  proposeTerms,
  listApplications,
  rejectApplication,
  approveApplication,
  myTargetCard,
  leaderboard: (ctx, c) => leaderboard(ctx, c),
  setLeaderboardOptIn,
  requestPayment,
  cancelPaymentRequest,
  listPaymentRequests,
  payPaymentRequest,
  rejectPaymentRequest,
  raiseEarningsDispute,
  listEarningsDisputes,
  resolveEarningsDispute,
};
