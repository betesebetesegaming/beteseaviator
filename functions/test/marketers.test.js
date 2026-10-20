/**
 * Betese Marketers acceptance tests (CLAUDE_HANDOFF.md) against the compiled service
 * and an in-memory store. Run: npm test (builds first).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { HOUR, T0, setup, customer, rejects, dep, service, domain } = require("./harness");
const { aviatorLedgerDeposit } = require("../lib/marketers/providers");

// ---------- phone + contacts ----------

test("equivalent phone formats collide globally and keep first attribution without disclosure", async () => {
  const t = await setup();
  const key = domain.canonicalPhone("7012345").key;
  assert.equal(domain.canonicalPhone("+220 701 2345").key, key);
  assert.equal(domain.canonicalPhone(`220${key}`).key, key);

  await t.call(t.A, "createContact", customer("7012345"));
  await rejects(t.call(t.A, "createContact", customer("+220 701-2345")), "already-exists", /already in your list/);
  await rejects(t.call(t.B, "createContact", customer(key)), "already-exists", /another marketer/);
  await rejects(t.call(t.B, "createContact", customer(key)), "already-exists", /^((?!Ebrima).)*$/);
  const c = await t.store.get(`mkContacts/${key}`);
  assert.equal(c.data.marketerId, t.A.uid);
});

test("contact validation: product, consent choice, adult confirmation, phone", async () => {
  const t = await setup();
  await rejects(t.call(t.A, "createContact", customer("7012345", { products: [] })), "invalid-argument");
  await rejects(t.call(t.A, "createContact", customer("7012345", { products: ["casino"] })), "invalid-argument");
  await rejects(t.call(t.A, "createContact", customer("7012345", { smsConsent: undefined })), "invalid-argument", /consent/);
  await rejects(t.call(t.A, "createContact", customer("7012345", { adultConfirmed: false })), "invalid-argument", /18/);
  await rejects(t.call(t.A, "createContact", customer("12")), "invalid-argument", /Gambian/);
});

test("marketer A cannot list, search, check, edit or message marketer B's customers", async () => {
  const t = await setup();
  const { contact } = await t.call(t.A, "createContact", customer("7012345"));
  assert.equal((await t.call(t.B, "listContacts")).rows.length, 0);
  assert.equal((await t.call(t.B, "listContacts", { q: "7012345" })).rows.length, 0);
  assert.equal((await t.call(t.B, "listContacts", { q: "demo" })).rows.length, 0);
  assert.equal((await t.call(t.B, "listContacts", { marketerId: t.A.uid })).rows.length, 0, "marketerId filter ignored for marketers");
  for (const action of ["checkContact", "revokeConsent", "addProduct"]) {
    await rejects(t.call(t.B, action, { id: contact.id, product: "football" }), "not-found");
  }
  await rejects(
    t.call(t.B, "requestCampaign", { linkId: "aviator", recipients: [contact.id], note: "promo please" }),
    "failed-precondition",
    /not your customer/,
  );
  const req = await t.call(t.A, "requestCampaign", { linkId: "aviator", recipients: [contact.id], note: "promo please" });
  await rejects(t.call(t.B, "getCampaign", { id: req.id }), "not-found");
  assert.equal((await t.call(t.B, "listCampaigns")).rows.length, 0);
  assert.equal((await t.call(t.A, "listContacts")).rows.length, 1);
  assert.equal((await t.call(t.owner, "listContacts")).rows[0].marketerName, "Ebrima Jallow");
  const dashB = await t.call(t.B, "dashboard");
  assert.equal(dashB.totals.recorded, 0);
});

test("marketers cannot use owner actions", async () => {
  const t = await setup();
  for (const action of [
    "createMarketer",
    "setMarketerStatus",
    "resetMarketerPassword",
    "listMarketers",
    "reviewCampaign",
    "reviseCampaign",
    "saveTemplate",
    "saveSettings",
    "listDisputes",
    "resolveAttribution",
    "listAudit",
    "syncNow",
  ]) {
    await rejects(t.call(t.A, action, { uid: t.B.uid, id: "x", decision: "approve" }), "permission-denied");
  }
  await rejects(t.call(t.A, "sendCampaign", { id: "x" }), "invalid-argument", /Unknown action/);
});

// ---------- auth ----------

test("disabled marketers and reset passwords end sessions immediately", async () => {
  const t = await setup();
  const authSec = Math.floor(T0 / 1000);
  assert.equal((await service.authorizeCaller(t.store, t.A.uid, authSec)).role, "marketer");
  await rejects(service.authorizeCaller(t.store, "nobody", authSec), "permission-denied");
  await rejects(service.authorizeCaller(t.store, undefined, authSec), "permission-denied");

  t.advance(HOUR);
  await t.call(t.owner, "resetMarketerPassword", { uid: t.A.uid, password: "another pass 2" });
  await rejects(service.authorizeCaller(t.store, t.A.uid, authSec), "permission-denied", /session has ended/);
  assert.equal((await service.authorizeCaller(t.store, t.A.uid, Math.floor((T0 + HOUR) / 1000) + 1)).uid, t.A.uid);

  await t.call(t.owner, "setMarketerStatus", { uid: t.A.uid, status: "suspended" });
  await rejects(service.authorizeCaller(t.store, t.A.uid, Math.floor(T0 / 1000) + 99999), "permission-denied", /disabled/);
  assert.equal(t.ctx.auth.users.get(t.A.uid).disabled, true);
  assert.ok(t.ctx.auth.users.get(t.A.uid).revoked >= 2);
});

test("marketer creation: credential rules, sign-in keys, conflicts and audit", async () => {
  const t = await setup();
  await rejects(t.call(t.owner, "createMarketer", { name: "Pin User", phone: "7000003", password: "1234567890" }), "invalid-argument", /numbers/);
  await rejects(t.call(t.owner, "createMarketer", { name: "Short", phone: "7000003", password: "short" }), "invalid-argument");
  await rejects(t.call(t.owner, "createMarketer", { name: "Ebrima Jallow", phone: "7000009", password: "correct horse 1" }), "already-exists");
  await rejects(t.call(t.owner, "createMarketer", { name: "New Person", phone: "7000001", password: "correct horse 1" }), "already-exists");
  const login = await t.store.get("staffLogins/ebrimajallow");
  assert.deepEqual(login.data, { uid: t.A.uid, role: "marketer" });
  const phoneKey = domain.canonicalPhone("7000001").key;
  assert.equal((await t.store.get(`staffLogins/${phoneKey}`)).data.uid, t.A.uid);
  assert.equal((await t.store.get(`staffLogins/7000001`)).data.uid, t.A.uid);
  const user = await t.store.get(`users/${t.A.uid}`);
  assert.equal(user.data.role, "marketer");
  assert.equal(user.data.agentSlug, null);
  assert.equal(t.ctx.auth.users.get(t.A.uid).role, "marketer");
  assert.equal(t.ctx.auth.users.size, 2, "failed creations roll back their auth users");
  const audit = await t.store.query("mkAudit", { where: [["action", "==", "marketer.created"]] });
  assert.equal(audit.length, 2);
  assert.ok(!JSON.stringify(audit).includes("correct horse"), "no credentials in audit");
});

// ---------- verification + deposits ----------


test("signup after the number was recorded verifies; deposits count once; first vs later split", async () => {
  const t = await setup();
  const key = domain.canonicalPhone("7012345").key;
  // Marketer records the number first; the customer then signs up on their own phone.
  const { contact } = await t.call(t.A, "createContact", customer("7012345"));
  assert.equal(contact.accounts.aviator.state, "not_found");
  t.ctx.providers.aviator.accounts.set(key, { state: "matched", accountId: "P1", registeredAtMs: T0 + 10 * 60_000 });
  t.ctx.providers.aviator.deposits.set("P1", [dep("tx1", 100, T0 + 20 * 60_000), dep("tx2", 50.5, T0 + HOUR)]);
  t.advance(2 * HOUR);
  await t.call(t.owner, "syncNow");
  const c2 = (await t.call(t.A, "listContacts")).rows[0];
  assert.equal(c2.accounts.aviator.attribution, "new_signup");
  assert.deepEqual(c2.verifiedProducts, ["aviator"]);

  // replayed events and repeated syncs never double count
  t.ctx.providers.aviator.deposits.get("P1").push(dep("tx2", 50.5, T0 + HOUR));
  await t.call(t.owner, "syncNow");
  await t.call(t.owner, "syncNow");

  const d = await t.call(t.A, "dashboard", { range: "all" });
  const av = d.totals.products.aviator;
  assert.equal(av.depositsMinor, 15050);
  assert.equal(av.depositCount, 2);
  assert.equal(av.firstDepositCount, 1);
  assert.equal(av.firstDepositsMinor, 10000);
  assert.equal(av.subsequentDepositsMinor, 5050);
  assert.equal(av.currency, "GMD");
  assert.equal(d.totals.uniqueVerified, 1);
  assert.equal(d.totals.products.football.connected, false);

  const today = await t.call(t.A, "dashboard", { range: "custom", from: "2026-10-20", to: "2026-10-20" });
  assert.equal(today.totals.products.aviator.depositsMinor, 15050);
  const before = await t.call(t.A, "dashboard", { range: "custom", from: "2026-10-01", to: "2026-10-19" });
  assert.equal(before.totals.products.aviator.depositsMinor, 0);
});

test("a registration minutes before recording is NOT credited automatically", async () => {
  const t = await setup();
  const key = domain.canonicalPhone("7012345").key;
  t.ctx.providers.aviator.accounts.set(key, { state: "matched", accountId: "P2", registeredAtMs: T0 - 30 * 60_000 });
  t.ctx.providers.aviator.deposits.set("P2", [dep("e1", 80, T0 - 10 * 60_000), dep("e2", 40, T0 + HOUR)]);
  const { contact } = await t.call(t.A, "createContact", customer("7012345"));
  assert.equal(contact.accounts.aviator.attribution, "needs_review");
  assert.equal(contact.accounts.aviator.counted, false);
  t.advance(2 * HOUR);
  await t.call(t.owner, "syncNow");
  assert.equal((await t.call(t.A, "dashboard")).totals.products.aviator.depositsMinor, 0);

  const [row] = (await t.call(t.owner, "listDisputes")).rows;
  assert.equal(row.reviewHint, "registered_shortly_before");
  await rejects(t.call(t.owner, "resolveAttribution", { id: row.id, decision: "accept", note: "Helped at the stall" }), "invalid-argument", /count from/);
  // Owner confirms the marketer signed them up: count from registration, so the first deposit counts too.
  await t.call(t.owner, "resolveAttribution", { id: row.id, decision: "accept", countFrom: "registration", note: "Helped at the stall" });
  const av = (await t.call(t.A, "dashboard")).totals.products.aviator;
  assert.equal(av.depositsMinor, 12000);
  assert.equal(av.firstDepositCount, 1);
  assert.equal(av.firstDepositsMinor, 8000);
});

test("existing customers are not new registrations until the owner decides, with audit", async () => {
  const t = await setup();
  const key = domain.canonicalPhone("7012345").key;
  t.ctx.providers.aviator.accounts.set(key, { state: "matched", accountId: "OLD", registeredAtMs: T0 - 90 * 24 * HOUR });
  t.ctx.providers.aviator.deposits.set("OLD", [dep("old1", 500, T0 - 30 * 24 * HOUR), dep("new1", 200, T0 + HOUR)]);

  const { contact } = await t.call(t.A, "createContact", customer("7012345"));
  assert.equal(contact.accounts.aviator.attribution, "needs_review");
  assert.equal(contact.accounts.aviator.counted, false);
  assert.deepEqual(contact.verifiedProducts, []);
  t.advance(2 * HOUR);
  await t.call(t.owner, "syncNow");
  let d = await t.call(t.A, "dashboard");
  assert.equal(d.totals.products.aviator.depositsMinor, 0);
  assert.equal(d.totals.uniqueVerified, 0);

  const disputes = await t.call(t.owner, "listDisputes");
  assert.equal(disputes.rows.length, 1);
  assert.equal(disputes.rows[0].hadPriorDeposits, true);
  assert.equal(disputes.rows[0].reviewHint, "registered_long_before");
  await rejects(t.call(t.owner, "resolveAttribution", { id: disputes.rows[0].id, decision: "accept", countFrom: "recorded" }), "invalid-argument", /Reason/);
  await t.call(t.owner, "resolveAttribution", { id: disputes.rows[0].id, decision: "accept", countFrom: "recorded", note: "Reactivated by Ebrima" });

  d = await t.call(t.A, "dashboard");
  assert.equal(d.totals.products.aviator.depositsMinor, 20000, "only deposits after the referral count");
  assert.equal(d.totals.products.aviator.firstDepositCount, 0, "an old account has no new first deposit");
  assert.equal(d.totals.uniqueVerified, 1);
  const audit = await t.store.query("mkAudit", { where: [["action", "==", "attribution.accepted"]] });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].data.meta.before.counted, false);
});

test("unknown, ambiguous and unavailable matches stay unverified; football is disconnected", async () => {
  const t = await setup();
  const k2 = domain.canonicalPhone("7012346").key;
  const k3 = domain.canonicalPhone("7012347").key;
  t.ctx.providers.aviator.accounts.set(k2, { state: "ambiguous", count: 2 });
  t.ctx.providers.aviator.accounts.set(k3, { state: "unavailable", reason: "timeout" });
  const a = await t.call(t.A, "createContact", customer("7012345", { products: ["aviator", "football"] }));
  const b = await t.call(t.A, "createContact", customer("7012346"));
  const c = await t.call(t.A, "createContact", customer("7012347"));
  assert.equal(a.contact.accounts.aviator.state, "not_found");
  assert.equal(a.contact.accounts.football.state, "unavailable");
  assert.equal(b.contact.accounts.aviator.state, "ambiguous");
  assert.equal(c.contact.accounts.aviator.state, "unavailable");
  const d = await t.call(t.A, "dashboard");
  assert.equal(d.totals.recorded, 3);
  assert.equal(d.totals.uniqueVerified, 0);
  assert.equal(d.totals.products.football.recorded, 1);
  assert.equal(d.totals.products.football.verified, 0);
});

test("customer using both products counts once in the unique total", async () => {
  const t = await setup({ footballConnected: true });
  const key = domain.canonicalPhone("7012345").key;
  t.ctx.providers.aviator.accounts.set(key, { state: "matched", accountId: "PA", registeredAtMs: T0 });
  t.ctx.providers.football.accounts.set(key, { state: "matched", accountId: "PF", registeredAtMs: T0 });
  t.ctx.providers.football.deposits.set("PF", [dep("f1", 75, T0 + 1)]);
  t.ctx.providers.aviator.deposits.set("PA", [dep("a1", 25, T0 + 1)]);
  await t.call(t.A, "createContact", customer("7012345", { products: ["aviator", "football"] }));
  t.advance(HOUR);
  const d = await t.call(t.A, "dashboard");
  assert.equal(d.totals.uniqueVerified, 1);
  assert.equal(d.totals.both, 1);
  assert.equal(d.totals.products.aviator.verified, 1);
  assert.equal(d.totals.products.football.verified, 1);
  assert.equal(d.totals.products.football.depositsMinor, 7500, "products are never added together");
  assert.equal(d.totals.products.aviator.depositsMinor, 2500);
  const o = await t.call(t.owner, "dashboard", { byMarketer: true });
  assert.equal(o.byMarketer.find((m) => m.id === t.A.uid).totals.both, 1);
  assert.equal(o.byMarketer.find((m) => m.id === t.B.uid).totals.recorded, 0);
});

test("reversals are separate and other currencies are never added to GMD", async () => {
  const t = await setup();
  const key = domain.canonicalPhone("7012345").key;
  t.ctx.providers.aviator.accounts.set(key, { state: "matched", accountId: "P1", registeredAtMs: T0 });
  t.ctx.providers.aviator.deposits.set("P1", [
    dep("d1", 300, T0 + 1),
    dep("r1", 100, T0 + 2, { kind: "reversal" }),
    dep("x1", 999, T0 + 3, { currency: "XOF" }),
  ]);
  await t.call(t.A, "createContact", customer("7012345"));
  t.advance(HOUR);
  const av = (await t.call(t.A, "dashboard")).totals.products.aviator;
  assert.equal(av.depositsMinor, 30000);
  assert.equal(av.reversalsMinor, 10000);
  assert.equal(av.netMinor, 20000);
});

test("ledger filter ignores bets, pending rows, demo resets, repairs and test funding", () => {
  const ts = { toMillis: () => T0 };
  const ok = aviatorLedgerDeposit("a", { type: "deposit", status: "completed", amount: 50, createdAt: ts, meta: { source: "modempay" } });
  assert.equal(ok.amountMinor, 5000);
  assert.equal(ok.channel, "modempay");
  assert.equal(aviatorLedgerDeposit("b", { type: "bet", status: "completed", amount: 50, createdAt: ts }), null);
  assert.equal(aviatorLedgerDeposit("c", { type: "win", status: "completed", amount: 50, createdAt: ts }), null);
  assert.equal(aviatorLedgerDeposit("d", { type: "deposit", status: "pending", amount: 50, createdAt: ts }), null);
  assert.equal(aviatorLedgerDeposit("e", { type: "deposit", status: "completed", amount: -5, createdAt: ts }), null);
  assert.equal(aviatorLedgerDeposit("f", { type: "deposit", status: "completed", amount: 50, createdAt: ts, meta: { demo: true } }), null);
  assert.equal(aviatorLedgerDeposit("g", { type: "deposit", status: "completed", amount: 50, createdAt: ts, meta: { source: "wallet_repair" } }), null);
  assert.equal(aviatorLedgerDeposit("h", { type: "deposit", status: "completed", amount: 50, createdAt: ts, meta: { source: "qtech_cw_certification" } }), null);
  assert.equal(aviatorLedgerDeposit("i", { type: "deposit", status: "completed", amount: 50, createdAt: ts, meta: { otcCash: true } }).channel, "shop_cash");
});

test("marketers never write deposits: no action accepts amounts", async () => {
  const t = await setup();
  await t.call(t.A, "createContact", customer("7012345", { depositsMinor: 999999, amount: 5000 }));
  assert.equal((await t.store.query("mkDeposits", {})).length, 0);
  assert.equal((await t.call(t.A, "dashboard")).totals.products.aviator.depositsMinor, 0);
});

// ---------- campaigns ----------

async function campaignSetup() {
  const t = await setup();
  const ids = [];
  for (const p of ["7012345", "7012346"]) ids.push((await t.call(t.A, "createContact", customer(p))).contact.id);
  const noConsent = (await t.call(t.A, "createContact", customer("7012347", { smsConsent: false }))).contact.id;
  const football = (await t.call(t.A, "createContact", customer("7012348", { products: ["football"] }))).contact.id;
  const tpl = await t.call(t.owner, "saveTemplate", { title: "Weekend", body: "Betese weekend offer is live. Play responsibly, 18+ only." });
  return { ...t, ids, noConsent, football, tpl };
}

test("campaign request targets only own consenting, eligible customers", async () => {
  const t = await campaignSetup();
  await rejects(t.call(t.A, "requestCampaign", { linkId: "aviator", templateId: t.tpl.id, recipients: [...t.ids, t.noConsent] }), "failed-precondition", /no SMS consent/);
  await rejects(t.call(t.A, "requestCampaign", { linkId: "aviator", templateId: t.tpl.id, recipients: [t.football] }), "failed-precondition", /product/);
  await rejects(t.call(t.A, "requestCampaign", { linkId: "evil", templateId: t.tpl.id, recipients: t.ids }), "invalid-argument", /approved link/);
  await rejects(t.call(t.A, "requestCampaign", { linkId: "aviator", recipients: t.ids, note: "visit bit.ly/x" }), "invalid-argument", /links/);
  await rejects(t.call(t.owner, "requestCampaign", { linkId: "aviator", templateId: t.tpl.id, recipients: t.ids }), "permission-denied");

  const r = await t.call(t.A, "requestCampaign", { linkId: "aviator", templateId: t.tpl.id, recipients: t.ids, note: "for weekend" });
  assert.equal(r.status, "pending_review");
  const { campaign, recipients } = await t.call(t.owner, "getCampaign", { id: r.id });
  assert.equal(campaign.message, "Betese weekend offer is live. Play responsibly, 18+ only.\nhttps://beteseaviator.com/");
  assert.equal(campaign.recipientCount, 2);
  assert.equal(campaign.segments, 1);
  assert.equal(campaign.estimatedCost.totalMinor, null, "no price configured yet");
  assert.equal(campaign.sendState, "not_sent");
  assert.equal(recipients.length, 2);
});

test("only the owner approves; approval never sends; approved records are frozen", async () => {
  const t = await campaignSetup();
  await t.call(t.owner, "saveSettings", { smsPricePerSegmentMinor: 50 });
  const r = await t.call(t.A, "requestCampaign", { linkId: "aviator", templateId: t.tpl.id, recipients: t.ids });
  const c = (await t.call(t.owner, "getCampaign", { id: r.id })).campaign;
  assert.equal(c.estimatedCost.totalMinor, 100);
  await rejects(t.call(t.A, "reviewCampaign", { id: r.id, decision: "approve" }), "permission-denied");
  const res = await t.call(t.owner, "reviewCampaign", { id: r.id, decision: "approve" });
  assert.equal(res.status, "approved");
  const saved = await t.store.get(`mkCampaignRevisions/${r.id}`);
  assert.equal(saved.data.sendState, "not_sent");
  assert.equal(saved.data.approvedContentHash, saved.data.contentHash);
  await rejects(t.call(t.owner, "reviseCampaign", { id: r.id, body: "Changed wording here" }), "failed-precondition", /cannot change/);
  await rejects(t.call(t.owner, "reviewCampaign", { id: r.id, decision: "approve" }), "failed-precondition");
});

test("owner revisions create a new revision that needs its own approval", async () => {
  const t = await campaignSetup();
  const r = await t.call(t.A, "requestCampaign", { linkId: "aviator", recipients: t.ids, note: "Need a Monday reminder" });
  assert.equal(r.status, "needs_draft");
  await rejects(t.call(t.owner, "reviewCampaign", { id: r.id, decision: "approve" }), "failed-precondition");
  await rejects(t.call(t.owner, "reviseCampaign", { id: r.id, body: "Go to https://evil.example" }), "invalid-argument", /links/);
  const v2 = await t.call(t.owner, "reviseCampaign", { id: r.id, body: "Monday reminder from Betese. 18+ only." });
  assert.equal(v2.status, "pending_review");
  assert.equal((await t.store.get(`mkCampaignRevisions/${r.id}`)).data.status, "superseded");
  const v3 = await t.call(t.owner, "reviseCampaign", { id: v2.id, recipients: [t.ids[0]] });
  const rev3 = (await t.store.get(`mkCampaignRevisions/${v3.id}`)).data;
  assert.equal(rev3.revision, 3);
  assert.equal(rev3.recipientCount, 1);
  assert.notEqual(rev3.contentHash, (await t.store.get(`mkCampaignRevisions/${v2.id}`)).data.contentHash);
  await rejects(t.call(t.owner, "reviewCampaign", { id: v2.id, decision: "approve" }), "failed-precondition", /waiting for review/);
});

test("revoked consent or a changed link invalidates instead of approving", async () => {
  const t = await campaignSetup();
  const r1 = await t.call(t.A, "requestCampaign", { linkId: "aviator", templateId: t.tpl.id, recipients: t.ids });
  await t.call(t.A, "revokeConsent", { id: t.ids[1] });
  const res = await t.call(t.owner, "reviewCampaign", { id: r1.id, decision: "approve" });
  assert.equal(res.status, "invalidated");
  assert.match(res.reason, /no SMS consent/);
  assert.equal((await t.store.get(`mkCampaignRevisions/${r1.id}`)).data.recipientCount, 2, "no silent replacement of recipients");

  const r2 = await t.call(t.A, "requestCampaign", { linkId: "aviator", templateId: t.tpl.id, recipients: [t.ids[0]] });
  await t.call(t.owner, "saveSettings", {
    links: [
      { id: "aviator", label: "Aviator", product: "aviator", url: "https://beteseaviator.com/play" },
      { id: "football", label: "Football", product: "football", url: "https://betesegaming.com/" },
    ],
  });
  assert.equal((await t.call(t.owner, "reviewCampaign", { id: r2.id, decision: "approve" })).status, "invalidated");
});

test("tampered revision content is refused", async () => {
  const t = await campaignSetup();
  const r = await t.call(t.A, "requestCampaign", { linkId: "aviator", templateId: t.tpl.id, recipients: t.ids });
  await t.store.set(`mkCampaignRevisions/${r.id}`, { message: "Different text\nhttps://beteseaviator.com/" }, true);
  await rejects(t.call(t.owner, "reviewCampaign", { id: r.id, decision: "approve" }), "failed-precondition", /does not match/);
});

// ---------- link policy + SMS ----------

test("link policy accepts only plain https Betese destinations", () => {
  assert.equal(domain.validateApprovedUrl("https://beteseaviator.com"), "https://beteseaviator.com/");
  assert.equal(domain.validateApprovedUrl("https://www.betesegaming.com/promo?utm_source=sms#x"), "https://www.betesegaming.com/promo?utm_source=sms");
  for (const bad of [
    "http://beteseaviator.com",
    "https://bit.ly/abc",
    "https://beteseaviator.com.evil.com",
    "https://evil.com/?q=beteseaviator.com",
    "https://user:pw@beteseaviator.com",
    "https://beteseaviator.com:8443/",
    "https://beteseaviator.com/out?url=https://evil.com",
    "https://beteseaviator.com/?next=//evil.com",
    "https://beteseaviator.com//evil.com",
    "javascript:alert(1)",
    "beteseaviator.com",
  ]) {
    assert.throws(() => domain.validateApprovedUrl(bad), domain.DomainError, bad);
  }
});

test("SMS segment counting for GSM-7 and Unicode", () => {
  assert.deepEqual(domain.smsSegments("a".repeat(160)), { encoding: "GSM-7", units: 160, segments: 1 });
  assert.equal(domain.smsSegments("a".repeat(161)).segments, 2);
  assert.equal(domain.smsSegments("€".repeat(80)).segments, 1);
  assert.equal(domain.smsSegments("€".repeat(81)).segments, 2);
  assert.equal(domain.smsSegments("é".repeat(10) + "ñ").encoding, "GSM-7");
  assert.equal(domain.smsSegments("🎉".repeat(35)).segments, 1);
  assert.equal(domain.smsSegments("ç" + "a".repeat(70)).segments, 2);
});

test("date ranges use Gambia (UTC) calendar boundaries", () => {
  const now = Date.UTC(2026, 9, 22, 15, 0); // Thursday
  assert.equal(domain.resolveRange("today", now).fromMs, Date.UTC(2026, 9, 22));
  assert.equal(domain.resolveRange("week", now).fromMs, Date.UTC(2026, 9, 19));
  assert.equal(domain.resolveRange("month", now).fromMs, Date.UTC(2026, 9, 1));
  const custom = domain.resolveRange("custom", now, "2026-10-01", "2026-10-05");
  assert.equal(custom.toMs, Date.UTC(2026, 9, 6));
  assert.throws(() => domain.resolveRange("custom", now, "2026-10-05", "2026-10-01"));
  assert.throws(() => domain.resolveRange("custom", now, "2024-01-01", "2026-10-01"));
});

test("attribution: only registrations after recording are automatic; the window is a review hint", () => {
  assert.deepEqual(domain.classifyAttribution(T0 + 1, T0), { attribution: "new_signup", hint: null });
  assert.deepEqual(domain.classifyAttribution(T0, T0), { attribution: "new_signup", hint: null });
  assert.deepEqual(domain.classifyAttribution(T0 - 1, T0), { attribution: "needs_review", hint: "registered_shortly_before" });
  assert.deepEqual(domain.classifyAttribution(T0 - 23 * HOUR, T0), { attribution: "needs_review", hint: "registered_shortly_before" });
  assert.deepEqual(domain.classifyAttribution(T0 - 25 * HOUR, T0), { attribution: "needs_review", hint: "registered_long_before" });
  assert.deepEqual(domain.classifyAttribution(null, T0), { attribution: "needs_review", hint: "registration_time_unknown" });
});
