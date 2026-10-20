/**
 * My Business & Earnings: targets, owner-approved agreements, earnings lines, payment records.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { HOUR, T0, setup, customer, rejects, dep, domain } = require("./harness");

const DAY = 24 * HOUR;

/** Marketer records the number, the customer then registers and deposits — a verified new signup. */
async function verifiedCustomer(t, marketer, phone, accountId, deposits) {
  const { contact } = await t.call(marketer, "createContact", customer(phone));
  const key = domain.canonicalPhone(phone).key;
  t.ctx.providers.aviator.accounts.set(key, { state: "matched", accountId, registeredAtMs: t.ctx.now() + 60_000 });
  t.ctx.providers.aviator.deposits.set(accountId, deposits);
  return contact.id;
}

const reward = (amountMinor, extra = {}) => ({ type: "customer_reward", product: "aviator", qualifies: "verified_signup", amountMinor, ...extra });

async function approvedAgreement(t, marketer, terms, from = "2026-10-01") {
  const { id } = await t.call(t.owner, "saveAgreementDraft", { marketerId: marketer.uid, from, terms });
  await t.call(t.owner, "approveAgreement", { id });
  return id;
}

const lines = async (t, who, data = {}) => (await t.call(who, "listEarnings", data)).rows;

test("rates come only from the owner: no defaults, validation, marketers cannot create or approve", async () => {
  const t = await setup();
  await rejects(t.call(t.owner, "saveAgreementDraft", { marketerId: t.A.uid, from: "2026-10-01", terms: [] }), "invalid-argument", /terms/);
  await rejects(t.call(t.owner, "saveAgreementDraft", { marketerId: t.A.uid, from: "2026-10-01", terms: [{ type: "customer_reward", product: "aviator", qualifies: "verified_signup" }] }), "invalid-argument", /bututs/);
  await rejects(t.call(t.owner, "saveAgreementDraft", { marketerId: t.A.uid, from: "2026-10-01", terms: [{ type: "deposit_commission", product: "aviator" }] }), "invalid-argument", /basis points/);
  await rejects(t.call(t.owner, "saveAgreementDraft", { marketerId: t.A.uid, from: "2026-10-01", terms: [{ type: "deposit_commission", product: "aviator", basisPoints: 2.5 }] }), "invalid-argument");
  await rejects(t.call(t.owner, "saveAgreementDraft", { marketerId: t.A.uid, from: "2026-10-01", terms: [{ type: "campaign_payment", campaignId: "nope123", amountMinor: 100 }] }), "invalid-argument", /approved campaigns/);
  for (const action of ["saveAgreementDraft", "approveAgreement", "endAgreement", "reviewTarget", "approveEarnings", "voidEarning", "recordPayment", "recalculateEarnings", "confirmCampaignCompleted"]) {
    await rejects(t.call(t.A, action, { marketerId: t.A.uid, id: "x", ids: ["x"], terms: [reward(1)] }), "permission-denied");
  }
  const { id } = await t.call(t.owner, "saveAgreementDraft", { marketerId: t.A.uid, from: "2026-10-01", terms: [reward(5000)] });
  assert.equal((await t.call(t.A, "listAgreements")).rows.length, 0, "marketers never see drafts");
  await t.call(t.owner, "approveAgreement", { id });
  const mine = (await t.call(t.A, "listAgreements")).rows;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].terms[0].amountMinor, 5000);
  await rejects(t.call(t.owner, "saveAgreementDraft", { id, marketerId: t.A.uid, from: "2026-10-01", terms: [reward(9000)] }), "failed-precondition", /Only drafts/);
  assert.equal((await t.call(t.B, "listAgreements")).rows.length, 0);
});

test("fixed customer reward: pending → approved → paid, with payment history", async () => {
  const t = await setup();
  await approvedAgreement(t, t.A, [reward(5000)]);
  await verifiedCustomer(t, t.A, "7012345", "P1", [dep("d1", 100, T0 + 5 * 60_000)]);
  await verifiedCustomer(t, t.A, "7012346", "P2", []);
  t.advance(HOUR);
  await t.call(t.owner, "syncNow");

  let mine = await lines(t, t.A);
  assert.equal(mine.length, 2);
  assert.ok(mine.every((l) => l.status === "pending" && l.amountMinor === 5000 && l.kind === "customer_reward"));
  await rejects(t.call(t.owner, "recordPayment", { ids: [mine[0].id], method: "wave" }), "failed-precondition", /approved/);
  await t.call(t.owner, "approveEarnings", { ids: mine.map((l) => l.id) });
  const pay = await t.call(t.owner, "recordPayment", { ids: mine.map((l) => l.id), method: "wave", reference: "WAVE-123" });
  assert.equal(pay.totalMinor, 10000);
  await rejects(t.call(t.owner, "recordPayment", { ids: [mine[0].id], method: "wave" }), "failed-precondition", /approved/);

  const biz = await t.call(t.A, "myBusiness");
  assert.equal(biz.summary.paidMinor, 10000);
  assert.equal(biz.summary.pendingMinor, 0);
  assert.equal(biz.payouts.length, 1);
  assert.equal(biz.payouts[0].reference, "WAVE-123");
  assert.equal(biz.thisMonth.newCustomers, 2);
  // Bookkeeping only: nothing touched wallets, the ledger or agent commissions.
  for (const path of t.store.docs.keys()) assert.ok(!/^(wallets|transactions|commissions|agentDailyGgr)\//.test(path), path);
  assert.equal((await lines(t, t.B)).length, 0, "marketer B sees none of A's earnings");
});

test("first-deposit reward needs a counted first deposit above the owner's minimum", async () => {
  const t = await setup();
  await approvedAgreement(t, t.A, [reward(3000, { qualifies: "first_deposit", minFirstDepositMinor: 10000 })]);
  await verifiedCustomer(t, t.A, "7012345", "P1", [dep("d1", 50, T0 + 5 * 60_000)]);
  await verifiedCustomer(t, t.A, "7012346", "P2", [dep("d2", 150, T0 + 5 * 60_000)]);
  await verifiedCustomer(t, t.A, "7012347", "P3", []);
  t.advance(HOUR);
  await t.call(t.owner, "syncNow");
  const mine = await lines(t, t.A);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].amountMinor, 3000);
});

test("percentage commission per month on net verified deposits, open month updates while pending", async () => {
  const t = await setup();
  await approvedAgreement(t, t.A, [{ type: "deposit_commission", product: "aviator", basisPoints: 250 }]);
  await verifiedCustomer(t, t.A, "7012345", "P1", [dep("d1", 100, T0 + 5 * 60_000), dep("d2", 50.5, T0 + HOUR)]);
  t.advance(2 * HOUR);
  await t.call(t.owner, "syncNow");
  let [line] = await lines(t, t.A);
  assert.equal(line.kind, "deposit_commission");
  assert.equal(line.period, "2026-10");
  assert.equal(line.amountMinor, 376, "2.5% of D150.50 = 376 bututs (truncated)");
  assert.equal(line.basis.netDepositsMinor, 15050);

  t.ctx.providers.aviator.deposits.get("P1").push(dep("d3", 100, T0 + 3 * HOUR), dep("r1", 50, T0 + 3 * HOUR, { kind: "reversal" }));
  t.advance(2 * HOUR);
  await t.call(t.owner, "syncNow");
  [line] = await lines(t, t.A);
  assert.equal(line.amountMinor, 501, "net 200.50 × 2.5%");
  assert.equal((await lines(t, t.A)).length, 1, "still one pending line for the month");
});

test("approved lines never change: later facts create adjustment lines", async () => {
  const t = await setup();
  await approvedAgreement(t, t.A, [{ type: "deposit_commission", product: "aviator", basisPoints: 1000 }]);
  await verifiedCustomer(t, t.A, "7012345", "P1", [dep("d1", 100, T0 + 5 * 60_000)]);
  t.advance(HOUR);
  await t.call(t.owner, "syncNow");
  const [first] = await lines(t, t.A);
  assert.equal(first.amountMinor, 1000);
  await t.call(t.owner, "approveEarnings", { ids: [first.id] });

  t.ctx.providers.aviator.deposits.get("P1").push(dep("r1", 40, T0 + 2 * HOUR, { kind: "reversal" }));
  t.advance(2 * HOUR);
  await t.call(t.owner, "syncNow");
  const all = await lines(t, t.owner, { marketerId: t.A.uid });
  const original = all.find((l) => l.id === first.id);
  const adj = all.find((l) => l.kind === "adjustment");
  assert.equal(original.amountMinor, 1000);
  assert.equal(original.status, "approved");
  assert.equal(adj.amountMinor, -400);
  assert.equal(adj.status, "pending");
  assert.deepEqual(adj.adjusts, [first.id]);
});

test("rejecting attribution after payment creates a clawback; owner voids stick", async () => {
  const t = await setup();
  await approvedAgreement(t, t.A, [reward(5000)]);
  // Registered before recording → needs owner review, so nothing is earned yet.
  const key = domain.canonicalPhone("7012345").key;
  t.ctx.providers.aviator.accounts.set(key, { state: "matched", accountId: "P9", registeredAtMs: T0 - 10 * 60_000 });
  t.ctx.providers.aviator.deposits.set("P9", []);
  await t.call(t.A, "createContact", customer("7012345"));
  await t.call(t.owner, "syncNow");
  assert.equal((await lines(t, t.A)).length, 0, "no reward without owner review");

  const [dispute] = (await t.call(t.owner, "listDisputes")).rows;
  await t.call(t.owner, "resolveAttribution", { id: dispute.id, decision: "accept", countFrom: "recorded", note: "Assisted signup" });
  let [line] = await lines(t, t.A);
  assert.equal(line.amountMinor, 5000);
  await t.call(t.owner, "approveEarnings", { ids: [line.id] });
  await t.call(t.owner, "recordPayment", { ids: [line.id], method: "cash" });

  await t.call(t.owner, "resolveAttribution", { id: dispute.id, decision: "reject", note: "Found it was an existing player" });
  const all = await lines(t, t.owner, { marketerId: t.A.uid });
  const clawback = all.find((l) => l.kind === "adjustment");
  assert.equal(clawback.amountMinor, -5000);
  assert.equal(all.find((l) => l.id === line.id).status, "paid", "the payment record is untouched");

  await t.call(t.owner, "voidEarning", { id: clawback.id, note: "Waived" });
  await t.call(t.owner, "recalculateEarnings", { marketerId: t.A.uid });
  const after = await lines(t, t.owner, { marketerId: t.A.uid, status: "pending" });
  assert.equal(after.length, 0, "a voided line is not recreated");
});

test("targets: marketer proposes, owner approves with a bonus; bonus earned only after the period if met", async () => {
  const t = await setup();
  await rejects(t.call(t.owner, "proposeTarget", { metric: "new_customers", product: "aviator", threshold: 1, from: "2026-10-01", to: "2026-10-31" }), "permission-denied");
  const { id } = await t.call(t.A, "proposeTarget", { metric: "new_customers", product: "aviator", threshold: 2, from: "2026-10-01", to: "2026-10-31", note: "October push" });
  const { id: low } = await t.call(t.A, "proposeTarget", { metric: "verified_deposits", product: "any", threshold: 100000000, from: "2026-10-01", to: "2026-10-31" });
  await rejects(t.call(t.owner, "reviewTarget", { id, decision: "approve" }), "invalid-argument", /bonus/);
  await t.call(t.owner, "reviewTarget", { id, decision: "approve", bonusMinor: 20000 });
  await t.call(t.owner, "reviewTarget", { id: low, decision: "approve", bonusMinor: 50000 });
  await rejects(t.call(t.A, "withdrawTarget", { id }), "failed-precondition");

  await verifiedCustomer(t, t.A, "7012345", "P1", []);
  await verifiedCustomer(t, t.A, "7012346", "P2", []);
  t.advance(HOUR);
  await t.call(t.owner, "syncNow");
  const [row] = (await t.call(t.A, "listTargets", { status: "approved" })).rows.filter((r) => r.id === id);
  assert.equal(row.progress, 2);
  assert.equal((await lines(t, t.A)).length, 0, "not earned before the period ends");

  t.setClock(Date.UTC(2026, 10, 1, 1));
  await t.call(t.owner, "recalculateEarnings", { marketerId: t.A.uid });
  const mine = await lines(t, t.A);
  assert.equal(mine.length, 1, "only the met target pays");
  assert.equal(mine[0].kind, "target_bonus");
  assert.equal(mine[0].amountMinor, 20000);
});

test("fixed campaign payment is earned only once the owner confirms the approved campaign was completed", async () => {
  const t = await setup();
  const id1 = (await t.call(t.A, "createContact", customer("7012345"))).contact.id;
  const tpl = await t.call(t.owner, "saveTemplate", { title: "Promo", body: "Betese weekend offer. 18+ only." });
  const camp = await t.call(t.A, "requestCampaign", { linkId: "aviator", templateId: tpl.id, recipients: [id1] });
  await rejects(approvedAgreement(t, t.A, [{ type: "campaign_payment", campaignId: camp.id, amountMinor: 15000 }]), "invalid-argument");
  await t.call(t.owner, "reviewCampaign", { id: camp.id, decision: "approve" });
  await approvedAgreement(t, t.A, [{ type: "campaign_payment", campaignId: camp.id, amountMinor: 15000 }]);
  assert.equal((await lines(t, t.A)).length, 0);
  await t.call(t.owner, "confirmCampaignCompleted", { campaignId: camp.id, note: "Flyers handed out at the market" });
  const [line] = await lines(t, t.A);
  assert.equal(line.kind, "campaign_payment");
  assert.equal(line.amountMinor, 15000);
  await rejects(t.call(t.owner, "confirmCampaignCompleted", { campaignId: camp.id, note: "again" }), "already-exists");
});

test("a newer agreement ends the previous one; earnings follow each agreement's own dates", async () => {
  const t = await setup();
  const first = await approvedAgreement(t, t.A, [reward(1000)], "2026-10-01");
  await verifiedCustomer(t, t.A, "7012345", "P1", []);
  t.advance(DAY);
  await t.call(t.owner, "syncNow");
  const second = await approvedAgreement(t, t.A, [reward(2000)], "2026-10-21");
  await verifiedCustomer(t, t.A, "7012346", "P2", []);
  t.advance(HOUR);
  await t.call(t.owner, "syncNow");
  const rows = (await t.call(t.owner, "listAgreements", { marketerId: t.A.uid })).rows;
  assert.equal(rows.find((r) => r.id === first).status, "ended");
  assert.equal(rows.find((r) => r.id === second).status, "approved");
  const amounts = (await lines(t, t.A)).map((l) => l.amountMinor).sort();
  assert.deepEqual(amounts, [1000, 2000]);
  await rejects(approvedAgreement(t, t.A, [reward(3000)], "2026-10-05"), "failed-precondition", /starts on or after/);
});
