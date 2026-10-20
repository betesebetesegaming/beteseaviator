/**
 * Betese Marketers service. Every action re-authorizes the caller and only touches the
 * mk* marketing collections plus marketer staff logins — never wallets, wagers or player
 * accounts. Provider verification is read-only (see providers.ts).
 */
import { phoneStorageKeys } from "../phone";
import {
  CURRENCY,
  DEFAULT_LINKS,
  DEFAULT_REFERRAL_WINDOW_HOURS,
  DomainError,
  MAX_BODY,
  MAX_NOTE,
  MAX_RECIPIENTS,
  PRODUCTS,
  assertStaffPassword,
  canonicalPhone,
  classifyAttribution,
  cleanName,
  cleanProducts,
  cleanText,
  composeMessage,
  contentHash,
  estimateCost,
  ineligibleReason,
  recipientHash,
  resolveRange,
  smsSegments,
  validateLinks,
  type ApprovedLink,
  type Product,
} from "./domain";
import { SMS_MISSING, type Providers } from "./providers";
import { AlreadyExistsError, type Data, type Doc, type Store, type Where } from "./store";

export const C = {
  contacts: "mkContacts",
  accounts: "mkProductAccounts",
  deposits: "mkDeposits",
  revisions: "mkCampaignRevisions",
  templates: "mkTemplates",
  settings: "mkSettings",
  consent: "mkConsentEvents",
  audit: "mkAudit",
} as const;

export const CONSENT_WORDING_VERSION = "2026-10-v1";
export const CONSENT_WORDING =
  "I agree to receive SMS messages from Betese about offers and updates. I can ask to stop at any time.";

const PAGE = 25;
const CHECK_COOLDOWN_MS = 2 * 60_000;

export interface AuthOps {
  createUser(args: { email: string; password: string; displayName: string }): Promise<string>;
  deleteUser(uid: string): Promise<void>;
  updatePassword(uid: string, password: string): Promise<void>;
  setDisabled(uid: string, disabled: boolean): Promise<void>;
  revokeSessions(uid: string): Promise<void>;
  setRole(uid: string, role: string): Promise<void>;
}

export interface Ctx {
  store: Store;
  auth: AuthOps;
  providers: Providers;
  now: () => number;
  /** Firestore Timestamp in production so existing admin screens can sort users by createdAt. */
  timestamp: (ms: number) => unknown;
}

export interface Caller {
  uid: string;
  name: string;
  role: "admin" | "marketer";
}

const isOwner = (c: Caller) => c.role === "admin";

function deny(message = "Owner access required."): never {
  throw new DomainError("permission-denied", message);
}

// ---------- authorization ----------

/**
 * Loads the caller's staff profile on EVERY request. Suspended accounts and sessions
 * that started before a disable / password reset are rejected immediately.
 */
export async function authorizeCaller(store: Store, uid: string | undefined, authTimeSec: number | undefined): Promise<Caller> {
  if (!uid) throw new DomainError("permission-denied", "Sign in first.");
  const doc = await store.get(`users/${uid}`);
  const p = doc?.data;
  if (!p || (p.role !== "admin" && p.role !== "marketer")) deny("This account cannot use Betese Marketers.");
  if (p.status !== "active") deny("Account disabled.");
  const validAfter = Number(p.sessionsValidAfterMs ?? 0);
  if (validAfter && (!authTimeSec || authTimeSec * 1000 < Math.floor(validAfter / 1000) * 1000)) {
    deny("Your session has ended. Sign in again.");
  }
  return { uid, name: String(p.name ?? ""), role: p.role as Caller["role"] };
}

// ---------- settings + audit ----------

interface Settings {
  links: ApprovedLink[];
  referralWindowHours: number;
  smsPricePerSegmentMinor: number | null;
  senderId: string | null;
}

async function loadSettings(store: Store): Promise<Settings> {
  const d = (await store.get(`${C.settings}/config`))?.data ?? {};
  return {
    links: Array.isArray(d.links) && d.links.length ? (d.links as ApprovedLink[]) : DEFAULT_LINKS,
    referralWindowHours: Number(d.referralWindowHours ?? DEFAULT_REFERRAL_WINDOW_HOURS),
    smsPricePerSegmentMinor: d.smsPricePerSegmentMinor == null ? null : Number(d.smsPricePerSegmentMinor),
    senderId: d.senderId ? String(d.senderId) : null,
  };
}

async function audit(ctx: Ctx, caller: Caller | null, action: string, target: string, meta: Data = {}): Promise<void> {
  await ctx.store.set(`${C.audit}/${ctx.store.newId(C.audit)}`, {
    actorId: caller?.uid ?? "system",
    actorRole: caller?.role ?? "system",
    action,
    target,
    meta,
    atMs: ctx.now(),
  });
}

// ---------- views ----------

function contactView(doc: Doc, owner: boolean): Data {
  const d = doc.data;
  const accounts = (d.accounts ?? {}) as Record<string, Data | null>;
  const acc: Data = {};
  for (const p of PRODUCTS) {
    const a = accounts[p];
    if (!a) continue;
    acc[p] = {
      state: a.state,
      attribution: a.attribution ?? null,
      decision: a.decision ?? null,
      counted: !!a.counted,
      checkedAtMs: a.checkedAtMs ?? null,
      ...(owner ? { accountId: a.accountId ?? null } : {}),
    };
  }
  const consent = (d.consent ?? {}) as Data;
  return {
    id: doc.id,
    name: d.name,
    phone: d.phoneE164,
    products: d.products,
    recordedAtMs: d.recordedAtMs,
    smsConsent: !!consent.sms,
    consentRevokedAtMs: consent.revokedAtMs ?? null,
    accounts: acc,
    verifiedProducts: d.verifiedProducts ?? [],
    ...(owner ? { marketerId: d.marketerId, marketerName: d.marketerName } : {}),
  };
}

async function contactFor(ctx: Ctx, caller: Caller, id: unknown): Promise<Doc> {
  const key = String(id ?? "");
  if (!/^\d{5,15}$/.test(key)) throw new DomainError("not-found", "Customer not found.");
  const doc = await ctx.store.get(`${C.contacts}/${key}`);
  // Another marketer's customer looks exactly like a missing one.
  if (!doc || (!isOwner(caller) && doc.data.marketerId !== caller.uid)) {
    throw new DomainError("not-found", "Customer not found.");
  }
  return doc;
}

function cursorOf(rows: Doc[], field: string, limit: number) {
  if (rows.length < limit) return null;
  const last = rows[rows.length - 1];
  return { v: last.data[field], id: last.id };
}

function parseCursor(input: unknown): { v: unknown; id: string } | null {
  if (!input || typeof input !== "object") return null;
  const c = input as { v?: unknown; id?: unknown };
  if (typeof c.id !== "string") return null;
  return { v: c.v, id: c.id };
}

// ---------- state ----------

async function getState(ctx: Ctx, caller: Caller): Promise<Data> {
  const s = await loadSettings(ctx.store);
  const sync = (await ctx.store.get(`${C.settings}/syncStatus`))?.data ?? {};
  return {
    me: { uid: caller.uid, name: caller.name, role: isOwner(caller) ? "owner" : "marketer" },
    links: s.links,
    consentWording: CONSENT_WORDING,
    integrations: {
      aviator: { connected: ctx.providers.aviator.connected, missing: ctx.providers.aviator.missing, lastSync: sync.aviator ?? null },
      football: { connected: ctx.providers.football.connected, missing: ctx.providers.football.missing },
      sms: { connected: false, sendingEnabled: false, missing: SMS_MISSING },
    },
    ...(isOwner(caller)
      ? {
          settings: {
            referralWindowHours: s.referralWindowHours,
            smsPricePerSegmentMinor: s.smsPricePerSegmentMinor,
            senderId: s.senderId,
          },
        }
      : {}),
  };
}

// ---------- contacts ----------

async function createContact(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const name = cleanName(data.name);
  const phone = canonicalPhone(data.phone);
  const products = cleanProducts(data.products);
  if (typeof data.smsConsent !== "boolean") {
    throw new DomainError("invalid-argument", "Record the customer's SMS consent choice.");
  }
  if (data.adultConfirmed !== true) {
    throw new DomainError("invalid-argument", "Confirm the customer is 18 or older.");
  }

  let marketerId = caller.uid;
  let marketerName = caller.name;
  if (isOwner(caller)) {
    const target = await ctx.store.get(`users/${String(data.marketerId ?? "")}`);
    if (!target || target.data.role !== "marketer" || target.data.status !== "active") {
      throw new DomainError("invalid-argument", "Choose the active marketer this customer belongs to.");
    }
    marketerId = target.id;
    marketerName = String(target.data.name ?? "");
  }

  const now = ctx.now();
  const accounts: Data = {};
  for (const p of products) accounts[p] = { state: "pending" };
  const contact: Data = {
    phoneKey: phone.key,
    phoneE164: phone.e164,
    name,
    searchName: name.toLowerCase(),
    marketerId,
    marketerName,
    recordedAtMs: now,
    recordedBy: caller.uid,
    products,
    adultConfirmed: true,
    status: "active",
    consent: {
      sms: data.smsConsent,
      wordingVersion: CONSENT_WORDING_VERSION,
      source: "in_person_marketer",
      collectedBy: caller.uid,
      collectedAtMs: now,
      revokedAtMs: null,
      revokedBy: null,
    },
    accounts,
    verifiedProducts: [],
    verifiedCount: 0,
    updatedAtMs: now,
  };

  try {
    await ctx.store.create(`${C.contacts}/${phone.key}`, contact);
  } catch (e) {
    if (!(e instanceof AlreadyExistsError)) throw e;
    const existing = await ctx.store.get(`${C.contacts}/${phone.key}`);
    if (existing?.data.marketerId === marketerId) {
      throw new DomainError("already-exists", "This customer is already in your list.");
    }
    // First attribution is kept; nothing about the other marketer is disclosed.
    throw new DomainError(
      "already-exists",
      isOwner(caller)
        ? `Already recorded by ${String(existing?.data.marketerName ?? "another marketer")}.`
        : "This number is already recorded by another marketer. Ask the owner if this is wrong.",
    );
  }

  await ctx.store.set(`${C.consent}/${ctx.store.newId(C.consent)}`, {
    contactId: phone.key,
    action: data.smsConsent ? "granted" : "declined",
    wordingVersion: CONSENT_WORDING_VERSION,
    source: "in_person_marketer",
    by: caller.uid,
    atMs: now,
  });
  await audit(ctx, caller, "contact.created", phone.key, { products, marketerId });

  try {
    await matchContact(ctx, phone.key);
  } catch {
    /* verification retries on the next sync — the contact is saved */
  }
  const saved = await ctx.store.get(`${C.contacts}/${phone.key}`);
  return { contact: contactView(saved!, isOwner(caller)) };
}

async function listContacts(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const owner = isOwner(caller);
  const where: Where[] = [];
  if (!owner) where.push(["marketerId", "==", caller.uid]);
  else if (data.marketerId) where.push(["marketerId", "==", String(data.marketerId)]);

  const q = String(data.q ?? "").trim();
  if (q && /^[+\d\s()-]{7,}$/.test(q)) {
    let key = "";
    try {
      key = canonicalPhone(q).key;
    } catch {
      return { rows: [], next: null };
    }
    const doc = await ctx.store.get(`${C.contacts}/${key}`);
    const visible = doc && (owner ? !data.marketerId || doc.data.marketerId === data.marketerId : doc.data.marketerId === caller.uid);
    return { rows: visible ? [contactView(doc!, owner)] : [], next: null };
  }

  const after = parseCursor(data.cursor);
  let rows: Doc[];
  let field: string;
  if (q) {
    const term = q.toLowerCase();
    field = "searchName";
    rows = await ctx.store.query(C.contacts, {
      where: [...where, ["searchName", ">=", term], ["searchName", "<", `${term}`]],
      orderBy: ["searchName", "asc"],
      limit: PAGE,
      after,
    });
  } else {
    field = "recordedAtMs";
    rows = await ctx.store.query(C.contacts, { where, orderBy: ["recordedAtMs", "desc"], limit: PAGE, after });
  }
  return { rows: rows.map((r) => contactView(r, owner)), next: cursorOf(rows, field, PAGE) };
}

async function revokeConsent(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const doc = await contactFor(ctx, caller, data.id);
  const consent = (doc.data.consent ?? {}) as Data;
  if (!consent.sms) return { contact: contactView(doc, isOwner(caller)) };
  const now = ctx.now();
  await ctx.store.set(
    `${C.contacts}/${doc.id}`,
    { consent: { ...consent, sms: false, revokedAtMs: now, revokedBy: caller.uid }, updatedAtMs: now },
    true,
  );
  await ctx.store.set(`${C.consent}/${ctx.store.newId(C.consent)}`, {
    contactId: doc.id,
    action: "revoked",
    by: caller.uid,
    atMs: now,
  });
  await audit(ctx, caller, "contact.sms_consent_revoked", doc.id);
  return { contact: contactView((await ctx.store.get(`${C.contacts}/${doc.id}`))!, isOwner(caller)) };
}

async function addProduct(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const doc = await contactFor(ctx, caller, data.id);
  const [product] = cleanProducts([data.product]);
  const products = doc.data.products as Product[];
  if (!products.includes(product)) {
    const accounts = { ...((doc.data.accounts ?? {}) as Data), [product]: { state: "pending" } };
    await ctx.store.set(
      `${C.contacts}/${doc.id}`,
      { products: PRODUCTS.filter((p) => p === product || products.includes(p)), accounts, updatedAtMs: ctx.now() },
      true,
    );
    await audit(ctx, caller, "contact.product_added", doc.id, { product });
    await matchContact(ctx, doc.id).catch(() => undefined);
  }
  return { contact: contactView((await ctx.store.get(`${C.contacts}/${doc.id}`))!, isOwner(caller)) };
}

async function checkContact(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const doc = await contactFor(ctx, caller, data.id);
  const accounts = (doc.data.accounts ?? {}) as Record<string, Data | null>;
  const recent = Object.values(accounts).some((a) => a && Number(a.checkedAtMs ?? 0) > ctx.now() - CHECK_COOLDOWN_MS);
  if (!recent || isOwner(caller)) await matchContact(ctx, doc.id);
  return { contact: contactView((await ctx.store.get(`${C.contacts}/${doc.id}`))!, isOwner(caller)) };
}

// ---------- verification + deposit sync ----------

function verifiedFields(accounts: Record<string, Data | null>): Data {
  const verifiedProducts = PRODUCTS.filter((p) => accounts[p]?.state === "matched" && accounts[p]?.counted === true);
  return { verifiedProducts, verifiedCount: verifiedProducts.length };
}

/** Looks the contact up in each chosen product; never creates or enrols accounts. */
export async function matchContact(ctx: Ctx, contactId: string): Promise<void> {
  const doc = await ctx.store.get(`${C.contacts}/${contactId}`);
  if (!doc) return;
  const settings = await loadSettings(ctx.store);
  const d = doc.data;
  const accounts = { ...((d.accounts ?? {}) as Record<string, Data | null>) };
  const toSync: string[] = [];

  for (const product of d.products as Product[]) {
    const provider = ctx.providers[product];
    const current = accounts[product] ?? { state: "pending" };
    const now = ctx.now();
    if (current.state === "matched") {
      toSync.push(String(current.accountDocId));
      continue;
    }
    if (!provider.connected) {
      accounts[product] = { state: "unavailable", reason: "not_connected", checkedAtMs: now };
      continue;
    }
    const found = await provider.findAccount(String(d.phoneKey));
    if (found.state !== "matched") {
      accounts[product] = { state: found.state, checkedAtMs: now };
      continue;
    }

    const attribution = classifyAttribution(found.registeredAtMs, Number(d.recordedAtMs), settings.referralWindowHours);
    const accountDocId = `${product}_${found.accountId}`;
    const countFromMs =
      attribution === "new_signup"
        ? Math.min(found.registeredAtMs ?? Number(d.recordedAtMs), Number(d.recordedAtMs))
        : Number(d.recordedAtMs);

    const claimed = await ctx.store.txn(async (tx) => {
      const existing = await tx.get(`${C.accounts}/${accountDocId}`);
      if (existing) return existing.data.contactId === contactId ? existing.data : null;
      const acc: Data = {
        product,
        externalAccountId: found.accountId,
        contactId,
        marketerId: d.marketerId,
        recordedAtMs: d.recordedAtMs,
        registeredAtMs: found.registeredAtMs,
        matchedAtMs: now,
        verificationSource: product === "aviator" ? "aviator_users_collection" : "provider_api",
        attribution,
        decision: attribution === "new_signup" ? "auto" : "pending",
        counted: attribution === "new_signup",
        countFromMs,
        depositCursorMs: countFromMs,
        hadPriorDeposits: null,
        firstDepositTxnId: null,
        lastSyncAtMs: null,
      };
      tx.create(`${C.accounts}/${accountDocId}`, acc);
      return acc;
    });
    if (!claimed) {
      // The same betting account is already linked to a different phone record.
      accounts[product] = { state: "ambiguous", reason: "account_linked_elsewhere", checkedAtMs: now };
      continue;
    }
    accounts[product] = {
      state: "matched",
      accountDocId,
      accountId: found.accountId,
      attribution: claimed.attribution,
      decision: claimed.decision,
      counted: claimed.counted,
      checkedAtMs: now,
    };
    toSync.push(accountDocId);
    if (attribution === "needs_review") {
      await audit(ctx, null, "attribution.needs_review", accountDocId, { contactId });
    }
  }

  await ctx.store.set(`${C.contacts}/${contactId}`, { accounts, ...verifiedFields(accounts), updatedAtMs: ctx.now() }, true);
  for (const id of toSync) await syncAccountDeposits(ctx, id);
}

/** Ingests settled deposits once each (doc id = provider + transaction id). */
export async function syncAccountDeposits(ctx: Ctx, accountDocId: string): Promise<{ added: number; duplicates: number }> {
  const doc = await ctx.store.get(`${C.accounts}/${accountDocId}`);
  if (!doc) return { added: 0, duplicates: 0 };
  const acc = doc.data;
  const product = acc.product as Product;
  const provider = ctx.providers[product];
  if (!provider.connected) return { added: 0, duplicates: 0 };
  const accountId = String(acc.externalAccountId);
  const now = ctx.now();

  let hadPrior = acc.hadPriorDeposits as boolean | null;
  if (hadPrior == null) {
    hadPrior = await provider.hasDepositsBefore(accountId, Number(acc.countFromMs));
  }

  const res = await provider.fetchDeposits(accountId, Number(acc.depositCursorMs));
  if (res.state !== "ok") {
    await ctx.store.set(`${C.accounts}/${accountDocId}`, { lastSyncError: res.reason, lastSyncAttemptMs: now }, true);
    return { added: 0, duplicates: 0 };
  }

  let added = 0;
  let duplicates = 0;
  const sorted = [...res.deposits].sort((a, b) => a.depositedAtMs - b.depositedAtMs);
  for (const dep of sorted) {
    try {
      await ctx.store.create(`${C.deposits}/${product}_${dep.externalTxnId}`, {
        product,
        externalTxnId: dep.externalTxnId,
        externalAccountId: accountId,
        accountDocId,
        contactId: acc.contactId,
        marketerId: acc.marketerId,
        currency: dep.currency,
        amountMinor: dep.amountMinor,
        kind: dep.kind,
        status: "settled",
        channel: dep.channel,
        depositedAtMs: dep.depositedAtMs,
        ingestedAtMs: now,
        isFirst: false,
        counted: acc.counted === true && dep.depositedAtMs >= Number(acc.countFromMs),
      });
      added++;
    } catch (e) {
      if (e instanceof AlreadyExistsError) duplicates++;
      else throw e;
    }
  }

  // Exactly one verified first deposit per account, and only when nothing predates the counting start.
  const earliest = sorted.find((x) => x.kind === "deposit");
  const firstId = await ctx.store.txn(async (tx) => {
    const fresh = (await tx.get(`${C.accounts}/${accountDocId}`))!.data;
    const update: Data = { hadPriorDeposits: hadPrior, lastSyncAtMs: now, lastSyncError: null };
    if (res.complete) update.depositCursorMs = Math.max(Number(fresh.depositCursorMs ?? 0), res.nextSinceMs);
    let first: string | null = null;
    if (!fresh.firstDepositTxnId && hadPrior === false && earliest) {
      first = `${product}_${earliest.externalTxnId}`;
      update.firstDepositTxnId = first;
    }
    tx.set(`${C.accounts}/${accountDocId}`, update, true);
    return first;
  });
  if (firstId) await ctx.store.set(`${C.deposits}/${firstId}`, { isFirst: true }, true);
  return { added, duplicates };
}

/** Scheduled / owner-triggered pass over Aviator contacts. Resumes from a saved cursor. */
export async function syncAll(ctx: Ctx, budgetMs = 240_000): Promise<Data> {
  const started = ctx.now();
  const statusPath = `${C.settings}/syncStatus`;
  const prev = ((await ctx.store.get(statusPath))?.data?.aviator ?? {}) as Data;
  let after = parseCursor(prev.cursor);
  let processed = 0;
  let errors = 0;
  let complete = false;
  while (ctx.now() - started < budgetMs) {
    const rows = await ctx.store.query(C.contacts, {
      where: [["products", "array-contains", "aviator"]],
      orderBy: ["phoneKey", "asc"],
      limit: 50,
      after,
    });
    for (const row of rows) {
      try {
        await matchContact(ctx, row.id);
      } catch {
        errors++;
      }
      processed++;
    }
    if (rows.length < 50) {
      complete = true;
      after = null;
      break;
    }
    after = { v: rows[rows.length - 1].data.phoneKey, id: rows[rows.length - 1].id };
  }
  const status = { lastRunAtMs: ctx.now(), processed, errors, complete, cursor: complete ? null : after };
  await ctx.store.set(statusPath, { aviator: status }, true);
  return status;
}

// ---------- attribution disputes ----------

async function listDisputes(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const rows = await ctx.store.query(C.accounts, {
    where: [["decision", "==", "pending"]],
    orderBy: ["matchedAtMs", "desc"],
    limit: PAGE,
    after: parseCursor(data.cursor),
  });
  const out = [];
  for (const r of rows) {
    const contact = await ctx.store.get(`${C.contacts}/${String(r.data.contactId)}`);
    out.push({
      id: r.id,
      product: r.data.product,
      accountId: r.data.externalAccountId,
      registeredAtMs: r.data.registeredAtMs,
      recordedAtMs: r.data.recordedAtMs,
      hadPriorDeposits: r.data.hadPriorDeposits,
      contactName: contact?.data.name ?? null,
      phone: contact?.data.phoneE164 ?? null,
      marketerName: contact?.data.marketerName ?? null,
    });
  }
  return { rows: out, next: cursorOf(rows, "matchedAtMs", PAGE) };
}

async function resolveAttribution(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const id = String(data.id ?? "");
  const decision = data.decision === "accept" ? "accepted" : data.decision === "reject" ? "rejected" : null;
  if (!decision) throw new DomainError("invalid-argument", "Choose accept or reject.");
  const note = cleanText(data.note, "Reason", MAX_NOTE);
  const doc = await ctx.store.get(`${C.accounts}/${id}`);
  if (!doc || doc.data.attribution !== "needs_review") throw new DomainError("not-found", "Dispute not found.");
  const counted = decision === "accepted";
  const before = { decision: doc.data.decision, counted: doc.data.counted };
  await ctx.store.set(
    `${C.accounts}/${id}`,
    { decision, counted, decidedBy: caller.uid, decidedAtMs: ctx.now(), decisionNote: note },
    true,
  );

  const contactPath = `${C.contacts}/${String(doc.data.contactId)}`;
  const contact = await ctx.store.get(contactPath);
  if (contact) {
    const accounts = { ...((contact.data.accounts ?? {}) as Record<string, Data | null>) };
    const p = String(doc.data.product);
    if (accounts[p]) accounts[p] = { ...accounts[p]!, decision, counted };
    await ctx.store.set(contactPath, { accounts, ...verifiedFields(accounts), updatedAtMs: ctx.now() }, true);
  }
  const deps = await ctx.store.query(C.deposits, { where: [["accountDocId", "==", id]], limit: 5000 });
  for (const dep of deps) {
    const should = counted && Number(dep.data.depositedAtMs) >= Number(doc.data.countFromMs);
    if (dep.data.counted !== should) await ctx.store.set(`${C.deposits}/${dep.id}`, { counted: should }, true);
  }
  await audit(ctx, caller, `attribution.${decision}`, id, { before, after: { decision, counted }, note });
  return { ok: true };
}

// ---------- dashboard ----------

async function totalsFor(ctx: Ctx, marketerId: string | null, range: { fromMs: number; toMs: number }): Promise<Data> {
  const scope: Where[] = marketerId ? [["marketerId", "==", marketerId]] : [];
  const count = (w: Where[]) => ctx.store.count(C.contacts, [...scope, ...w]);
  const [recorded, uniqueVerified, both] = await Promise.all([
    count([]),
    count([["verifiedCount", ">=", 1]]),
    count([["verifiedCount", "==", 2]]),
  ]);
  const products: Data = {};
  for (const p of PRODUCTS) {
    const [rec, ver] = await Promise.all([
      count([["products", "array-contains", p]]),
      count([["verifiedProducts", "array-contains", p]]),
    ]);
    const base: Where[] = [
      ...scope,
      ["product", "==", p],
      ["currency", "==", CURRENCY],
      ["counted", "==", true],
    ];
    const inRange: Where[] = [
      ["depositedAtMs", ">=", range.fromMs],
      ["depositedAtMs", "<", range.toMs],
    ];
    const connected = ctx.providers[p].connected;
    const [depMinor, depCount, revMinor, firstMinor, firstCount] = connected
      ? await Promise.all([
          ctx.store.sum(C.deposits, [...base, ["kind", "==", "deposit"], ...inRange], "amountMinor"),
          ctx.store.count(C.deposits, [...base, ["kind", "==", "deposit"], ...inRange]),
          ctx.store.sum(C.deposits, [...base, ["kind", "==", "reversal"], ...inRange], "amountMinor"),
          ctx.store.sum(C.deposits, [...base, ["isFirst", "==", true], ...inRange], "amountMinor"),
          ctx.store.count(C.deposits, [...base, ["isFirst", "==", true], ...inRange]),
        ])
      : [0, 0, 0, 0, 0];
    products[p] = {
      connected,
      recorded: rec,
      verified: ver,
      currency: CURRENCY,
      depositsMinor: depMinor,
      depositCount: depCount,
      reversalsMinor: revMinor,
      netMinor: depMinor - revMinor,
      firstDepositsMinor: firstMinor,
      firstDepositCount: firstCount,
      subsequentDepositsMinor: depMinor - firstMinor,
    };
  }
  return { recorded, uniqueVerified, both, products };
}

async function dashboard(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const range = resolveRange(data.range, ctx.now(), data.from, data.to);
  const owner = isOwner(caller);
  const scopeId = owner ? (data.marketerId ? String(data.marketerId) : null) : caller.uid;
  const totals = await totalsFor(ctx, scopeId, range);
  const out: Data = {
    range,
    totals,
    definition:
      "Verified deposits: settled money-in on the customer's Betese Aviator wallet ledger (mobile money, shop cash, agent top-ups) " +
      "on accounts verified for this marketer, from the referral counting start. Excludes bets, winnings, balances, bonuses, demo resets " +
      "and repairs. GMD only — other currencies are never added in. First deposit = the account's first ever deposit, counted only for new signups.",
  };
  if (owner) {
    out.pendingDisputes = await ctx.store.count(C.accounts, [["decision", "==", "pending"]]);
    if (!scopeId && data.byMarketer) {
      const marketers = await ctx.store.query("users", { where: [["role", "==", "marketer"]], limit: 200 });
      out.byMarketer = await Promise.all(
        marketers.map(async (m) => ({
          id: m.id,
          name: m.data.name,
          status: m.data.status,
          totals: await totalsFor(ctx, m.id, range),
        })),
      );
    }
  }
  return out;
}

// ---------- team ----------

export function loginKeyFromName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
}

async function createMarketer(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const name = cleanName(data.name, 2, 60);
  const phone = canonicalPhone(data.phone);
  const password = assertStaffPassword(data.password);
  const loginKey = loginKeyFromName(name);
  if (loginKey.length < 3 || /^\d+$/.test(loginKey)) {
    throw new DomainError("invalid-argument", "Name must contain at least 3 letters for sign-in.");
  }
  const keys = [...new Set([loginKey, ...phoneStorageKeys(phone.key)])];
  const taken = async () => {
    for (const k of keys) if (await ctx.store.get(`staffLogins/${k}`)) return true;
    return !!(await ctx.store.get(`slugs/${loginKey}`));
  };
  const conflict = "That name or phone already signs in to the staff portal. Add a surname or use another phone.";
  if (await taken()) throw new DomainError("already-exists", conflict);

  let uid: string;
  try {
    uid = await ctx.auth.createUser({ email: `${loginKey}@staff.beteseaviator.com`, password, displayName: name });
  } catch {
    throw new DomainError("already-exists", conflict);
  }
  const now = ctx.now();
  try {
    await ctx.store.txn(async (tx) => {
      for (const k of keys) {
        if (await tx.get(`staffLogins/${k}`)) throw new DomainError("already-exists", conflict);
      }
      tx.create(`users/${uid}`, {
        name,
        email: null,
        phone: phone.key,
        role: "marketer",
        parentId: null,
        agentSlug: null,
        staffLoginId: loginKey,
        ancestors: [],
        status: "active",
        stats: {},
        createdAt: ctx.timestamp(now),
        createdAtMs: now,
        createdBy: caller.uid,
      });
      for (const k of keys) tx.create(`staffLogins/${k}`, { uid, role: "marketer" });
    });
    await ctx.auth.setRole(uid, "marketer");
  } catch (e) {
    await ctx.auth.deleteUser(uid).catch(() => undefined);
    throw e;
  }
  await audit(ctx, caller, "marketer.created", uid, { name });
  return { uid, signIn: [loginKey, phone.key] };
}

async function marketerFor(ctx: Ctx, caller: Caller, uid: unknown): Promise<Doc> {
  if (!isOwner(caller)) deny();
  const doc = await ctx.store.get(`users/${String(uid ?? "")}`);
  if (!doc || doc.data.role !== "marketer") throw new DomainError("not-found", "Marketer not found.");
  return doc;
}

async function setMarketerStatus(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const doc = await marketerFor(ctx, caller, data.uid);
  const status = data.status === "active" ? "active" : data.status === "suspended" ? "suspended" : null;
  if (!status) throw new DomainError("invalid-argument", "Status must be active or suspended.");
  const update: Data = { status };
  if (status === "suspended") update.sessionsValidAfterMs = ctx.now();
  await ctx.store.set(`users/${doc.id}`, update, true);
  await ctx.auth.setDisabled(doc.id, status === "suspended");
  if (status === "suspended") await ctx.auth.revokeSessions(doc.id);
  await audit(ctx, caller, `marketer.${status}`, doc.id);
  return { ok: true };
}

async function resetMarketerPassword(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const doc = await marketerFor(ctx, caller, data.uid);
  const password = assertStaffPassword(data.password);
  await ctx.auth.updatePassword(doc.id, password);
  await ctx.auth.revokeSessions(doc.id);
  await ctx.store.set(`users/${doc.id}`, { sessionsValidAfterMs: ctx.now() }, true);
  await audit(ctx, caller, "marketer.password_reset", doc.id);
  return { ok: true };
}

async function listMarketers(ctx: Ctx, caller: Caller): Promise<Data> {
  if (!isOwner(caller)) deny();
  const rows = await ctx.store.query("users", { where: [["role", "==", "marketer"]], limit: 200 });
  return {
    rows: rows.map((r) => ({
      uid: r.id,
      name: r.data.name,
      phone: r.data.phone,
      status: r.data.status,
      signIn: r.data.staffLoginId,
      createdAtMs: r.data.createdAtMs ?? null,
    })),
  };
}

// ---------- templates + settings ----------

async function listTemplates(ctx: Ctx, caller: Caller): Promise<Data> {
  const rows = await ctx.store.query(C.templates, { limit: 100 });
  return {
    rows: rows
      .filter((r) => isOwner(caller) || r.data.active === true)
      .map((r) => ({ id: r.id, title: r.data.title, body: r.data.body, version: r.data.version, active: r.data.active })),
  };
}

async function saveTemplate(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const title = cleanName(data.title, 2, 60);
  const body = cleanText(data.body, "Template text", MAX_BODY - 40);
  const id = data.id ? String(data.id) : ctx.store.newId(C.templates);
  const prev = await ctx.store.get(`${C.templates}/${id}`);
  if (data.id && !prev) throw new DomainError("not-found", "Template not found.");
  const version = Number(prev?.data.version ?? 0) + 1;
  await ctx.store.set(`${C.templates}/${id}`, {
    title,
    body,
    active: data.active !== false,
    version,
    updatedBy: caller.uid,
    updatedAtMs: ctx.now(),
  });
  await audit(ctx, caller, "template.saved", id, { version });
  return { id, version };
}

async function saveSettings(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const before = await loadSettings(ctx.store);
  const next: Data = {};
  if (data.links !== undefined) next.links = validateLinks(data.links);
  if (data.referralWindowHours !== undefined) {
    const h = Number(data.referralWindowHours);
    if (!Number.isInteger(h) || h < 0 || h > 168) throw new DomainError("invalid-argument", "Referral window must be 0–168 hours.");
    next.referralWindowHours = h;
  }
  if (data.smsPricePerSegmentMinor !== undefined) {
    const v = data.smsPricePerSegmentMinor;
    if (v !== null && (!Number.isInteger(v) || Number(v) < 0 || Number(v) > 100_000)) {
      throw new DomainError("invalid-argument", "Price per segment must be a whole number of bututs.");
    }
    next.smsPricePerSegmentMinor = v;
  }
  if (data.senderId !== undefined) {
    const s = data.senderId === null ? null : String(data.senderId).trim();
    if (s !== null && !/^[A-Za-z0-9 ]{3,11}$/.test(s)) throw new DomainError("invalid-argument", "Sender ID must be 3–11 letters or numbers.");
    next.senderId = s;
  }
  await ctx.store.set(`${C.settings}/config`, { ...next, updatedBy: caller.uid, updatedAtMs: ctx.now() }, true);
  await audit(ctx, caller, "settings.saved", "config", { before, after: next });
  return { ok: true };
}

// ---------- campaigns ----------

interface RevisionInput {
  campaignId: string;
  revision: number;
  parentRevisionId: string | null;
  marketerId: string;
  requestedBy: string;
  draftedBy: string | null;
  note: string;
  templateId: string | null;
  templateVersion: number | null;
  body: string;
  link: ApprovedLink;
  recipients: string[];
  scheduleAtMs: number | null;
  settings: Settings;
}

function buildRevision(ctx: Ctx, r: RevisionInput): Data {
  const message = r.body ? composeMessage(r.body, r.link.url) : "";
  const seg = smsSegments(message);
  const rHash = recipientHash(r.recipients);
  const senderId = r.settings.senderId;
  return {
    campaignId: r.campaignId,
    revision: r.revision,
    parentRevisionId: r.parentRevisionId,
    marketerId: r.marketerId,
    requestedBy: r.requestedBy,
    draftedBy: r.draftedBy,
    requestNote: r.note,
    templateId: r.templateId,
    templateVersion: r.templateVersion,
    body: r.body,
    linkId: r.link.id,
    linkUrl: r.link.url,
    message,
    senderId,
    scheduleAtMs: r.scheduleAtMs,
    recipients: r.recipients,
    recipientCount: r.recipients.length,
    recipientHash: rHash,
    contentHash: contentHash({ message, linkUrl: r.link.url, senderId, scheduleAtMs: r.scheduleAtMs, recipientHash: rHash }),
    encoding: seg.encoding,
    segments: seg.segments,
    estimatedCost: estimateCost(seg.segments, r.recipients.length, r.settings.smsPricePerSegmentMinor),
    status: r.body ? "pending_review" : "needs_draft",
    sendState: "not_sent",
    createdAtMs: ctx.now(),
  };
}

function cleanRecipients(input: unknown): string[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_RECIPIENTS) {
    throw new DomainError("invalid-argument", `Choose 1–${MAX_RECIPIENTS} customers.`);
  }
  const ids = [...new Set(input.map((x) => String(x)))];
  if (ids.some((x) => !/^\d{5,15}$/.test(x))) throw new DomainError("invalid-argument", "Invalid customer list.");
  return ids.sort();
}

/** Fresh eligibility of every recipient for this marketer and link product. */
async function checkRecipients(ctx: Ctx, ids: string[], marketerId: string, product: Product): Promise<Record<string, number>> {
  const reasons: Record<string, number> = {};
  for (const id of ids) {
    const doc = await ctx.store.get(`${C.contacts}/${id}`);
    let reason = ineligibleReason(
      doc ? (doc.data as unknown as Parameters<typeof ineligibleReason>[0]) : null,
      marketerId,
    );
    if (!reason && !(doc!.data.products as string[]).includes(product)) reason = "product_mismatch";
    if (reason) reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
  return reasons;
}

function reasonText(reasons: Record<string, number>): string {
  const labels: Record<string, string> = {
    missing: "not found",
    not_owned: "not your customer",
    archived: "archived",
    adult_unconfirmed: "age not confirmed",
    no_consent: "no SMS consent",
    product_mismatch: "not using this link's product",
  };
  return Object.entries(reasons)
    .map(([k, n]) => `${n} ${labels[k] ?? k}`)
    .join(", ");
}

function parseSchedule(input: unknown, now: number): number | null {
  if (input == null || input === "") return null;
  const ms = Date.parse(String(input));
  if (!Number.isFinite(ms) || ms < now) throw new DomainError("invalid-argument", "Schedule must be a future date and time.");
  return ms;
}

async function requestCampaign(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (isOwner(caller)) deny("Campaigns are requested by marketers. Use revise to draft wording.");
  const settings = await loadSettings(ctx.store);
  const link = settings.links.find((l) => l.id === String(data.linkId ?? ""));
  if (!link) throw new DomainError("invalid-argument", "Choose an approved link.");
  const recipients = cleanRecipients(data.recipients);
  const note = cleanText(data.note, "Request note", MAX_NOTE, true);

  let body = "";
  let templateId: string | null = null;
  let templateVersion: number | null = null;
  if (data.templateId) {
    const t = await ctx.store.get(`${C.templates}/${String(data.templateId)}`);
    if (!t || t.data.active !== true) throw new DomainError("invalid-argument", "Choose an active template.");
    body = String(t.data.body);
    templateId = t.id;
    templateVersion = Number(t.data.version);
  } else if (!note) {
    throw new DomainError("invalid-argument", "Choose a template or describe the message you need.");
  }

  const reasons = await checkRecipients(ctx, recipients, caller.uid, link.product);
  if (Object.keys(reasons).length) {
    throw new DomainError("failed-precondition", `Some customers cannot receive this: ${reasonText(reasons)}.`);
  }

  const id = ctx.store.newId(C.revisions);
  const rev = buildRevision(ctx, {
    campaignId: id,
    revision: 1,
    parentRevisionId: null,
    marketerId: caller.uid,
    requestedBy: caller.uid,
    draftedBy: null,
    note,
    templateId,
    templateVersion,
    body,
    link,
    recipients,
    scheduleAtMs: parseSchedule(data.scheduleAt, ctx.now()),
    settings,
  });
  await ctx.store.create(`${C.revisions}/${id}`, rev);
  await audit(ctx, caller, "campaign.requested", id, { recipients: recipients.length, templateId });
  return { id, status: rev.status };
}

async function reviseCampaign(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const oldId = String(data.id ?? "");
  const old = await ctx.store.get(`${C.revisions}/${oldId}`);
  if (!old) throw new DomainError("not-found", "Campaign not found.");
  const o = old.data;
  if (!["pending_review", "needs_draft", "rejected", "invalidated"].includes(String(o.status))) {
    throw new DomainError("failed-precondition", "Approved or replaced revisions cannot change. Ask for a new request.");
  }
  const settings = await loadSettings(ctx.store);
  const link = settings.links.find((l) => l.id === String(data.linkId ?? o.linkId));
  if (!link) throw new DomainError("invalid-argument", "Choose an approved link.");
  const body = cleanText(data.body ?? o.body, "Message text", MAX_BODY);
  const recipients = data.recipients !== undefined ? cleanRecipients(data.recipients) : (o.recipients as string[]);
  const reasons = await checkRecipients(ctx, recipients, String(o.marketerId), link.product);
  if (Object.keys(reasons).length) {
    throw new DomainError("failed-precondition", `Some customers cannot receive this: ${reasonText(reasons)}.`);
  }

  const newId = ctx.store.newId(C.revisions);
  const rev = buildRevision(ctx, {
    campaignId: String(o.campaignId),
    revision: Number(o.revision) + 1,
    parentRevisionId: oldId,
    marketerId: String(o.marketerId),
    requestedBy: String(o.requestedBy),
    draftedBy: caller.uid,
    note: String(o.requestNote ?? ""),
    templateId: (o.templateId as string | null) ?? null,
    templateVersion: (o.templateVersion as number | null) ?? null,
    body,
    link,
    recipients,
    scheduleAtMs: data.scheduleAt !== undefined ? parseSchedule(data.scheduleAt, ctx.now()) : ((o.scheduleAtMs as number | null) ?? null),
    settings,
  });
  await ctx.store.txn(async (tx) => {
    const fresh = await tx.get(`${C.revisions}/${oldId}`);
    if (!fresh || fresh.data.status !== o.status) throw new DomainError("failed-precondition", "This revision changed. Reload.");
    if (o.status === "pending_review" || o.status === "needs_draft") {
      tx.update(`${C.revisions}/${oldId}`, { status: "superseded", supersededBy: newId });
    }
    tx.create(`${C.revisions}/${newId}`, rev);
  });
  await audit(ctx, caller, "campaign.revised", newId, { from: oldId });
  return { id: newId, status: rev.status };
}

async function reviewCampaign(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny("Only the owner can approve or reject.");
  const id = String(data.id ?? "");
  const doc = await ctx.store.get(`${C.revisions}/${id}`);
  if (!doc) throw new DomainError("not-found", "Campaign not found.");
  const r = doc.data;
  if (r.status !== "pending_review") throw new DomainError("failed-precondition", "Only revisions waiting for review can be decided.");
  const note = cleanText(data.note, "Review note", MAX_NOTE, true);

  if (data.decision === "reject") {
    await ctx.store.txn(async (tx) => {
      const fresh = await tx.get(`${C.revisions}/${id}`);
      if (fresh?.data.status !== "pending_review") throw new DomainError("failed-precondition", "Already decided.");
      tx.update(`${C.revisions}/${id}`, { status: "rejected", reviewedBy: caller.uid, reviewedAtMs: ctx.now(), reviewNote: note });
    });
    await audit(ctx, caller, "campaign.rejected", id);
    return { status: "rejected" };
  }
  if (data.decision !== "approve") throw new DomainError("invalid-argument", "Choose approve or reject.");

  const expected = contentHash({
    message: String(r.message),
    linkUrl: String(r.linkUrl),
    senderId: (r.senderId as string | null) ?? null,
    scheduleAtMs: (r.scheduleAtMs as number | null) ?? null,
    recipientHash: recipientHash(r.recipients as string[]),
  });
  if (!r.message || expected !== r.contentHash || r.recipientHash !== recipientHash(r.recipients as string[])) {
    throw new DomainError("failed-precondition", "Revision content does not match its record. Create a new revision.");
  }
  const settings = await loadSettings(ctx.store);
  const link = settings.links.find((l) => l.id === r.linkId);
  const linkChanged = !link || link.url !== r.linkUrl;
  const reasons = link ? await checkRecipients(ctx, r.recipients as string[], String(r.marketerId), link.product) : {};
  if (linkChanged || Object.keys(reasons).length) {
    // Never approve a list that changed underneath the review — invalidate and re-review instead.
    const why = linkChanged ? "approved link changed" : reasonText(reasons);
    await ctx.store.set(`${C.revisions}/${id}`, { status: "invalidated", invalidReason: why, reviewedBy: caller.uid, reviewedAtMs: ctx.now() }, true);
    await audit(ctx, caller, "campaign.invalidated", id, { why });
    return { status: "invalidated", reason: why };
  }
  await ctx.store.txn(async (tx) => {
    const fresh = await tx.get(`${C.revisions}/${id}`);
    if (fresh?.data.status !== "pending_review" || fresh.data.contentHash !== r.contentHash) {
      throw new DomainError("failed-precondition", "Already decided or changed.");
    }
    tx.update(`${C.revisions}/${id}`, {
      status: "approved",
      approvedBy: caller.uid,
      approvedAtMs: ctx.now(),
      approvedContentHash: r.contentHash,
      reviewNote: note,
    });
  });
  await audit(ctx, caller, "campaign.approved", id, { contentHash: r.contentHash, recipients: r.recipientCount });
  return { status: "approved" };
}

function revisionView(doc: Doc): Data {
  const d = doc.data;
  return {
    id: doc.id,
    campaignId: d.campaignId,
    revision: d.revision,
    status: d.status,
    sendState: d.sendState,
    marketerId: d.marketerId,
    requestNote: d.requestNote,
    templateId: d.templateId,
    body: d.body,
    linkId: d.linkId,
    linkUrl: d.linkUrl,
    message: d.message,
    senderId: d.senderId,
    scheduleAtMs: d.scheduleAtMs,
    recipientCount: d.recipientCount,
    segments: d.segments,
    encoding: d.encoding,
    estimatedCost: d.estimatedCost,
    createdAtMs: d.createdAtMs,
    reviewNote: d.reviewNote ?? null,
    invalidReason: d.invalidReason ?? null,
    approvedAtMs: d.approvedAtMs ?? null,
  };
}

async function listCampaigns(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const where: Where[] = [];
  if (!isOwner(caller)) where.push(["marketerId", "==", caller.uid]);
  else if (data.status) where.push(["status", "==", String(data.status)]);
  const rows = await ctx.store.query(C.revisions, { where, orderBy: ["createdAtMs", "desc"], limit: PAGE, after: parseCursor(data.cursor) });
  return { rows: rows.map(revisionView), next: cursorOf(rows, "createdAtMs", PAGE) };
}

async function getCampaign(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  const doc = await ctx.store.get(`${C.revisions}/${String(data.id ?? "")}`);
  if (!doc || (!isOwner(caller) && doc.data.marketerId !== caller.uid)) throw new DomainError("not-found", "Campaign not found.");
  const recipients = [];
  for (const id of doc.data.recipients as string[]) {
    const c = await ctx.store.get(`${C.contacts}/${id}`);
    recipients.push({
      id,
      name: c?.data.name ?? "(removed)",
      phone: c?.data.phoneE164 ?? null,
      eligible: c ? ineligibleReason(c.data as unknown as Parameters<typeof ineligibleReason>[0], String(doc.data.marketerId)) === null : false,
    });
  }
  return { campaign: revisionView(doc), recipients };
}

async function listAudit(ctx: Ctx, caller: Caller, data: Data): Promise<Data> {
  if (!isOwner(caller)) deny();
  const rows = await ctx.store.query(C.audit, { orderBy: ["atMs", "desc"], limit: 50, after: parseCursor(data.cursor) });
  return { rows: rows.map((r) => ({ id: r.id, ...r.data })), next: cursorOf(rows, "atMs", 50) };
}

async function syncNow(ctx: Ctx, caller: Caller): Promise<Data> {
  if (!isOwner(caller)) deny();
  const status = await syncAll(ctx, 200_000);
  await audit(ctx, caller, "sync.manual", "aviator", status);
  return status;
}

// ---------- dispatch ----------

const ACTIONS: Record<string, (ctx: Ctx, caller: Caller, data: Data) => Promise<Data>> = {
  state: (ctx, c) => getState(ctx, c),
  dashboard,
  listContacts,
  createContact,
  checkContact,
  addProduct,
  revokeConsent,
  listCampaigns,
  getCampaign,
  requestCampaign,
  reviseCampaign,
  reviewCampaign,
  listTemplates: (ctx, c) => listTemplates(ctx, c),
  saveTemplate,
  saveSettings,
  listMarketers: (ctx, c) => listMarketers(ctx, c),
  createMarketer,
  setMarketerStatus,
  resetMarketerPassword,
  listDisputes,
  resolveAttribution,
  listAudit,
  syncNow: (ctx, c) => syncNow(ctx, c),
};

export async function handle(ctx: Ctx, caller: Caller, action: unknown, data: unknown): Promise<Data> {
  const fn = ACTIONS[String(action ?? "")];
  if (!fn) throw new DomainError("invalid-argument", "Unknown action.");
  const payload = data && typeof data === "object" && !Array.isArray(data) ? (data as Data) : {};
  return fn(ctx, caller, payload);
}
