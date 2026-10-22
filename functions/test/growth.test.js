/**
 * Become a Marketer applications, invite links, target + commission agreements with marketer
 * acceptance, the approved-target card, payment requests, disputes, badges and the leaderboard.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { HOUR, T0, setup, customer, rejects, dep, service, domain } = require("./harness");

const DAY = 24 * HOUR;
const pub = (t, action, data = {}, ip = "10.0.0.1") => service.handlePublic(t.ctx, action, data, { ip });

const application = (extra = {}) => ({
  name: "Awa Touray",
  phone: "7099001",
  products: ["aviator"],
  period: "weekly",
  customerTarget: 5,
  depositTargetMinor: 500000,
  requestedRateBp: 1000,
  consent: true,
  ...extra,
});

const finalTerms = (extra = {}) => ({
  products: ["aviator"],
  period: "weekly",
  customerTarget: 2,
  depositTargetMinor: 10000,
  rateBp: 1000,
  missedRateBp: 500,
  qualifyingDays: 30,
  from: "2026-10-19",
  ...extra,
});

async function acceptLatest(t, marketer) {
  const offer = (await t.call(marketer, "listAgreements")).rows.find((a) => a.status === "awaiting_acceptance");
  await t.call(marketer, "acceptAgreement", { id: offer.id, termsHash: offer.termsHash });
  return offer;
}

/** Marketer records the number, then the customer registers (verified new signup) and deposits. */
async function verifiedCustomer(t, marketer, phone, accountId, deposits, product = "aviator") {
  await t.call(marketer, "createContact", customer(phone, { products: [product] }));
  const key = domain.canonicalPhone(phone).key;
  t.ctx.providers[product].accounts.set(key, { state: "matched", accountId, registeredAtMs: t.ctx.now() + 60_000 });
  t.ctx.providers[product].deposits.set(accountId, deposits);
}

// ---------- public application ----------

test("public apply: only the two public actions work without sign-in", async () => {
  const t = await setup();
  assert.equal(service.isPublicAction("apply"), true);
  assert.equal(service.isPublicAction("applicationInfo"), true);
  for (const a of ["approveApplication", "createMarketer", "listApplications", "constructor", "__proto__", "toString"]) {
    assert.equal(service.isPublicAction(a), false, a);
    await rejects(pub(t, a, {}), "permission-denied");
  }
});

test("public apply validates 5–15%, consent, and stores a pending proposal with an estimate", async () => {
  const t = await setup();
  const info = await pub(t, "applicationInfo");
  assert.equal(info.open, true);
  assert.equal(info.tiersConfigured, false);
  await rejects(pub(t, "apply", application({ requestedRateBp: 400 })), "invalid-argument", /5% and 15%/);
  await rejects(pub(t, "apply", application({ requestedRateBp: 1600 })), "invalid-argument", /5% and 15%/);
  await rejects(pub(t, "apply", application({ consent: false })), "invalid-argument", /contact/);
  await rejects(pub(t, "apply", application({ period: "daily" })), "invalid-argument", /weekly or monthly/);
  await rejects(pub(t, "apply", application({ customerTarget: 0, depositTargetMinor: 0 })), "invalid-argument");
  const res = await pub(t, "apply", application());
  assert.equal(res.estimatePerPeriodMinor, 50000, "10% of GMD 5,000 target");
  assert.ok(res.conditions.some((c) => /Qualifying deposits/.test(c)));
  const [row] = (await t.call(t.owner, "listApplications", { status: "pending" })).rows;
  assert.equal(row.status, "pending");
  assert.equal(row.requestedRateBp, 1000);
  assert.equal(row.tiersConfigured, false, "no tiers yet: still accepted for review");
  await rejects(pub(t, "apply", application()), "already-exists", /waiting/);
  await rejects(pub(t, "apply", application({ phone: "7000001" })), "already-exists", /marketer account/);
});

test("owner tiers cap the requested rate; a higher target alone does not raise it", async () => {
  const t = await setup();
  await t.call(t.owner, "saveSettings", {
    commissionTiers: [
      { minDepositTargetMinor: 100000, minCustomerTarget: 0, rateBp: 500 },
      { minDepositTargetMinor: 1000000, minCustomerTarget: 10, rateBp: 1000 },
    ],
  });
  await rejects(pub(t, "apply", application({ depositTargetMinor: 500000, requestedRateBp: 1000 })), "failed-precondition", /5.00%/);
  await rejects(pub(t, "apply", application({ depositTargetMinor: 50000, requestedRateBp: 500 })), "failed-precondition", /below the lowest/);
  await rejects(pub(t, "apply", application({ depositTargetMinor: 5000000, customerTarget: 5, requestedRateBp: 1000 })), "failed-precondition", /5.00%/);
  const ok = await pub(t, "apply", application({ depositTargetMinor: 2000000, customerTarget: 12, requestedRateBp: 1000 }));
  assert.equal(ok.estimatePerPeriodMinor, 200000);
  await rejects(t.call(t.owner, "saveSettings", { commissionTiers: [{ minDepositTargetMinor: 1, rateBp: 1600 }] }), "invalid-argument", /5%–15%/);
});

test("rate limit and closed applications", async () => {
  const t = await setup();
  for (let i = 0; i < 5; i++) await pub(t, "apply", application({ phone: `709910${i}` }), "1.2.3.4");
  await rejects(pub(t, "apply", application({ phone: "7099199" }), "1.2.3.4"), "failed-precondition", /Too many/);
  await t.call(t.owner, "saveSettings", { applicationsOpen: false });
  await rejects(pub(t, "apply", application({ phone: "7099198" }), "9.9.9.9"), "failed-precondition", /closed/);
});

// ---------- customer share links ----------

test("share links carry the marketer's first name, stay stable, and show only the first name and approved links", async () => {
  const t = await setup();
  await rejects(t.call(t.owner, "myShareLink"), "permission-denied");
  const link = await t.call(t.A, "myShareLink");
  assert.match(link.slug, /^ebrima-[a-z0-9]{4}$/);
  assert.equal(link.url, `https://beteseaviator.com/join/${link.slug}`);
  assert.ok(!link.url.includes(t.A.uid) && !link.url.includes("7000001") && !link.url.includes("jallow"), "no id, phone or surname");
  assert.equal((await t.call(t.A, "myShareLink")).slug, link.slug, "stable link");
  assert.notEqual((await t.call(t.B, "myShareLink")).slug, link.slug, "one link per marketer");

  assert.equal(service.isPublicAction("shareLinkInfo"), true);
  const info = await pub(t, "shareLinkInfo", { slug: link.slug.toUpperCase() });
  assert.deepEqual({ valid: info.valid, firstName: info.firstName }, { valid: true, firstName: "Ebrima" });
  assert.deepEqual(
    info.links.map((l) => l.url),
    ["https://beteseaviator.com/", "https://www.betesegaming.com/"],
  );
  assert.deepEqual(Object.keys(info).sort(), ["firstName", "links", "valid"], "nothing else about the marketer");

  for (const slug of ["nope", "ebrima-zzzz", "../users/owner", ""]) {
    const bad = await pub(t, "shareLinkInfo", { slug });
    assert.equal(bad.valid, false);
    assert.equal(bad.firstName, null);
    assert.equal(bad.links.length, 2, "page still offers the sites");
  }

  // A suspended marketer's link stops naming them; nothing is recorded or verified by opening it.
  await t.call(t.owner, "setMarketerStatus", { uid: t.A.uid, status: "suspended" });
  assert.equal((await pub(t, "shareLinkInfo", { slug: link.slug })).valid, false);
});

// ---------- invites ----------

test("invite links are opaque, record the inviter, and never pay recruitment commission", async () => {
  const t = await setup();
  await rejects(t.call(t.owner, "myInvite"), "permission-denied");
  const inv = await t.call(t.A, "myInvite");
  assert.match(inv.code, /^[A-Za-z0-9]{12}$/);
  assert.equal(inv.url, `https://beteseaviator.com/staff/apply?invite=${inv.code}`);
  assert.ok(!inv.url.includes(t.A.uid) && !inv.url.includes("7000001"), "no id or phone in the link");
  assert.equal((await t.call(t.A, "myInvite")).code, inv.code, "stable link");
  assert.equal((await pub(t, "applicationInfo", { invite: inv.code })).inviteValid, true);
  assert.equal((await pub(t, "applicationInfo", { invite: "nope12345" })).inviteValid, false);

  await pub(t, "apply", application({ invite: inv.code }));
  const [row] = (await t.call(t.owner, "listApplications")).rows;
  assert.equal(row.invitedBy, t.A.uid);
  assert.equal(row.invitedByName, "Ebrima Jallow");
  // The invited applicant still needs owner approval, and the inviter earns nothing for it.
  await t.call(t.owner, "approveApplication", { id: row.id, password: "awa password 1", ...finalTerms() });
  await t.call(t.owner, "recalculateEarnings", { marketerId: t.A.uid });
  assert.equal((await t.call(t.A, "listEarnings")).rows.length, 0);
});

// ---------- approval → acceptance → active ----------

test("owner approval creates the login and an agreement that earns nothing until the applicant accepts", async () => {
  const t = await setup();
  await pub(t, "apply", application());
  const [row] = (await t.call(t.owner, "listApplications")).rows;
  await rejects(t.call(t.A, "approveApplication", { id: row.id, password: "x", ...finalTerms() }), "permission-denied");
  await rejects(t.call(t.owner, "approveApplication", { id: row.id, password: "awa password 1", ...finalTerms({ missedRateBp: 1200 }) }), "invalid-argument", /missed/);
  await rejects(t.call(t.owner, "approveApplication", { id: row.id, password: "awa password 1", ...finalTerms({ qualifyingDays: undefined }) }), "invalid-argument", /days/);
  assert.equal((await t.call(t.owner, "listApplications", { status: "pending" })).rows.length, 1, "a failed approval releases the application");

  const res = await t.call(t.owner, "approveApplication", { id: row.id, password: "awa password 1", ...finalTerms() });
  await rejects(t.call(t.owner, "approveApplication", { id: row.id, password: "awa password 1", ...finalTerms() }), "failed-precondition", /already decided/);
  const awa = { uid: res.marketerId, name: "Awa Touray", role: "marketer" };
  assert.deepEqual(res.signIn, ["awatouray", domain.canonicalPhone("7099001").key]);

  const card0 = await t.call(awa, "myTargetCard");
  assert.equal(card0.target, null, "not active before acceptance");
  assert.equal(card0.awaiting.length, 1);
  assert.equal(card0.awaiting[0].terms[0].rateBp, 1000);
  assert.ok(card0.awaiting[0].terms[0].conditions.some((c) => /within 30 days/.test(c)));

  await verifiedCustomer(t, awa, "7012345", "P1", [dep("d1", 200, T0 + 5 * 60_000)]);
  t.advance(HOUR);
  await t.call(t.owner, "syncNow");
  assert.equal((await t.call(awa, "listEarnings")).rows.length, 0, "nothing earned before acceptance");

  await acceptLatest(t, awa);
  const card = await t.call(awa, "myTargetCard");
  assert.equal(card.target.rateBp, 1000);
  assert.equal(card.target.missedRateBp, 500);
  assert.equal(card.target.customerTarget, 2);
  assert.ok(card.target.current, "current week shown");
});

test("target commission: met week pays the agreed rate, missed week the missed rate, products separate, qualifying window enforced", async () => {
  const t = await setup({ footballConnected: true });
  await pub(t, "apply", application({ products: ["aviator", "football"] }));
  const [row] = (await t.call(t.owner, "listApplications")).rows;
  const { marketerId } = await t.call(t.owner, "approveApplication", { id: row.id, password: "awa password 1", ...finalTerms({ products: ["aviator", "football"], qualifyingDays: 3 }) });
  const awa = { uid: marketerId, name: "Awa Touray", role: "marketer" };
  await acceptLatest(t, awa);

  // Week of Mon 19 Oct: two new customers, GMD 150 qualifying (100 Aviator + 50 Football) → target met → 10%.
  await verifiedCustomer(t, awa, "7012345", "PA", [dep("a1", 100, T0 + HOUR), dep("late", 999, T0 + 5 * DAY)]);
  await verifiedCustomer(t, awa, "7012346", "PF", [dep("f1", 50, T0 + HOUR)], "football");
  t.advance(2 * HOUR);
  await t.call(t.owner, "syncNow");
  // Week of Mon 26 Oct: one new customer, GMD 80 → target missed → 5%.
  t.setClock(Date.UTC(2026, 9, 27, 9));
  await verifiedCustomer(t, awa, "7012347", "PB", [dep("b1", 80, Date.UTC(2026, 9, 27, 10))]);
  t.setClock(Date.UTC(2026, 10, 3, 9));
  await t.call(t.owner, "syncNow");

  const rows = (await t.call(awa, "listEarnings")).rows.filter((l) => l.kind === "target_commission");
  const by = Object.fromEntries(rows.map((l) => [`${l.period}:${l.description.split(" ")[0]}`, l]));
  assert.equal(by["W2026-10-19:Aviator"].amountMinor, 1000, "10% of D100; the late deposit after 3 days is excluded");
  assert.equal(by["W2026-10-19:Football"].amountMinor, 500, "Football paid on its own line");
  assert.equal(by["W2026-10-19:Aviator"].basis.met, true);
  assert.equal(by["W2026-10-26:Aviator"].amountMinor, 400, "missed week → 5% of D80");
  assert.equal(by["W2026-10-26:Aviator"].basis.met, false);
  // Recalculating again never duplicates.
  await t.call(t.owner, "recalculateEarnings", { marketerId });
  assert.equal((await t.call(awa, "listEarnings")).rows.filter((l) => l.kind === "target_commission").length, rows.length);

  const card = await t.call(awa, "myTargetCard");
  assert.equal(card.target.history.length, 2);
  assert.deepEqual(card.target.history.map((h) => h.met), [true, false]);
  assert.ok(card.badges.find((b) => b.id === "target_met").earned);
  assert.ok(card.badges.find((b) => b.id === "first_customer").earned);
});

test("changes need a new version: proposal → owner approval → acceptance; the old agreement and its earnings stay", async () => {
  const t = await setup();
  await pub(t, "apply", application());
  const [row] = (await t.call(t.owner, "listApplications")).rows;
  const { marketerId } = await t.call(t.owner, "approveApplication", { id: row.id, password: "awa password 1", ...finalTerms({ customerTarget: 1 }) });
  const awa = { uid: marketerId, name: "Awa Touray", role: "marketer" };
  const v1 = await acceptLatest(t, awa);
  await verifiedCustomer(t, awa, "7012345", "P1", [dep("d1", 100, T0 + HOUR)]);
  t.advance(2 * HOUR);
  await t.call(t.owner, "syncNow");
  const before = (await t.call(awa, "listEarnings")).rows;
  assert.equal(before.length, 1);

  await t.call(awa, "proposeTerms", { products: ["aviator"], period: "monthly", customerTarget: 10, depositTargetMinor: 1000000, requestedRateBp: 1500 });
  await rejects(t.call(awa, "proposeTerms", { products: ["aviator"], period: "monthly", customerTarget: 10, depositTargetMinor: 1000000, requestedRateBp: 1500 }), "already-exists");
  const [prop] = (await t.call(t.owner, "listApplications", { status: "pending" })).rows;
  assert.equal(prop.kind, "target_proposal");
  await t.call(t.owner, "approveApplication", { id: prop.id, ...finalTerms({ period: "monthly", customerTarget: 10, depositTargetMinor: 1000000, rateBp: 1200, missedRateBp: 0, from: "2026-11-01" }) });

  let ags = (await t.call(awa, "listAgreements")).rows;
  assert.equal(ags.find((a) => a.id === v1.id).status, "active", "old version stays active until the new one is accepted");
  t.setClock(Date.UTC(2026, 10, 1, 8));
  const v2 = await acceptLatest(t, awa);
  ags = (await t.call(awa, "listAgreements")).rows;
  assert.equal(ags.find((a) => a.id === v1.id).status, "ended");
  assert.equal(ags.find((a) => a.id === v2.id).status, "active");
  assert.equal(ags.find((a) => a.id === v1.id).terms[0].rateBp, 1000, "history preserved unchanged");
  const after = (await t.call(awa, "listEarnings")).rows;
  assert.ok(after.some((l) => l.id === before[0].id && l.amountMinor === before[0].amountMinor), "earned amounts preserved");
  await rejects(t.call(awa, "declineAgreement", { id: v2.id }), "failed-precondition");
});

// ---------- payment requests ----------

test("payment requests: marketer asks, owner pays or rejects; no double requests; marketers cannot pay", async () => {
  const t = await setup();
  const { id } = await t.call(t.owner, "saveAgreementDraft", { marketerId: t.A.uid, from: "2026-10-01", terms: [{ type: "customer_reward", product: "aviator", qualifies: "verified_signup", amountMinor: 5000 }] });
  await t.call(t.owner, "approveAgreement", { id });
  await acceptLatest(t, t.A);
  await verifiedCustomer(t, t.A, "7012345", "P1", []);
  await verifiedCustomer(t, t.A, "7012346", "P2", []);
  t.advance(HOUR);
  await t.call(t.owner, "syncNow");
  await rejects(t.call(t.A, "requestPayment"), "failed-precondition", /no approved/);
  const lines = (await t.call(t.A, "listEarnings")).rows;
  await t.call(t.owner, "approveEarnings", { ids: lines.map((l) => l.id) });

  const req = await t.call(t.A, "requestPayment", { method: "wave", note: "October" });
  assert.equal(req.totalMinor, 10000);
  await rejects(t.call(t.A, "requestPayment"), "failed-precondition", /no approved/);
  await rejects(t.call(t.A, "payPaymentRequest", { id: req.id }), "permission-denied");
  await rejects(t.call(t.B, "cancelPaymentRequest", { id: req.id }), "not-found");
  const paid = await t.call(t.owner, "payPaymentRequest", { id: req.id, reference: "WAVE-9" });
  assert.equal(paid.totalMinor, 10000);
  const [r] = (await t.call(t.A, "listPaymentRequests")).rows;
  assert.equal(r.status, "paid");
  assert.ok((await t.call(t.A, "listEarnings")).rows.every((l) => l.status === "paid"));
  await rejects(t.call(t.owner, "payPaymentRequest", { id: req.id }), "failed-precondition");
});

// ---------- disputes ----------

test("earnings disputes: marketer raises, owner resolves with an adjustment that still needs approval", async () => {
  const t = await setup();
  await rejects(t.call(t.owner, "raiseEarningsDispute", { message: "x" }), "permission-denied");
  await rejects(t.call(t.A, "raiseEarningsDispute", { message: "Mine?", earningId: "someone-elses" }), "not-found");
  const { id } = await t.call(t.A, "raiseEarningsDispute", { message: "Customer Lamin signed up with me on 18 Oct" });
  assert.equal((await t.call(t.B, "listEarningsDisputes")).rows.length, 0);
  await rejects(t.call(t.A, "resolveEarningsDispute", { id, decision: "resolved", note: "ok" }), "permission-denied");
  await rejects(t.call(t.owner, "resolveEarningsDispute", { id, decision: "rejected", note: "no", adjustmentMinor: 500 }), "invalid-argument");
  await t.call(t.owner, "resolveEarningsDispute", { id, decision: "resolved", note: "Confirmed with the shop", adjustmentMinor: 2500 });
  await t.call(t.owner, "recalculateEarnings", { marketerId: t.A.uid });
  const [line] = (await t.call(t.A, "listEarnings")).rows;
  assert.equal(line.kind, "manual_adjustment");
  assert.equal(line.amountMinor, 2500);
  assert.equal(line.status, "pending", "recalculation leaves manual adjustments alone");
  assert.equal((await t.call(t.A, "listEarningsDisputes")).rows[0].status, "resolved");
});

// ---------- leaderboard ----------

test("leaderboard is off by default, opt-in only, first name + initial, no private data", async () => {
  const t = await setup();
  assert.deepEqual(await t.call(t.A, "leaderboard"), { enabled: false });
  await t.call(t.owner, "saveSettings", { leaderboardEnabled: true });
  await verifiedCustomer(t, t.A, "7012345", "P1", []);
  await verifiedCustomer(t, t.B, "7012346", "P2", []);
  t.advance(HOUR);
  await t.call(t.owner, "syncNow");
  let lb = await t.call(t.A, "leaderboard");
  assert.equal(lb.rows.length, 0, "nobody opted in");
  await t.call(t.A, "setLeaderboardOptIn", { optIn: true });
  lb = await t.call(t.B, "leaderboard");
  assert.equal(lb.rows.length, 1);
  assert.equal(lb.rows[0].name, "Ebrima J.");
  assert.equal(lb.rows[0].aviator, 1);
  assert.equal(lb.rows[0].me, false);
  const json = JSON.stringify(lb);
  assert.ok(!/7000001|877|\+220|uid|phone|Minor/.test(json.replace(/"privacy":"[^"]*"/, "")), json);
});
