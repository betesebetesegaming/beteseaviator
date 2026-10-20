/**
 * The production Firestore storage implementation (src/marketers/store.ts) against the real
 * emulator, plus the full service flows run on it — proving the in-memory store used by the
 * unit suites matches Firestore's behaviour for everything the service relies on.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { firestoreStore, AlreadyExistsError } = require("../../lib/marketers/store");
const service = require("../../lib/marketers/service");
const domain = require("../../lib/marketers/domain");
const { fakeProvider, fakeAuth, customer, dep, T0, HOUR } = require("../harness");

const PROJECT = "demo-betese-marketers";
if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();
const store = firestoreStore(db);

async function wipe() {
  const cols = await db.listCollections();
  for (const c of cols) await db.recursiveDelete(c);
}

test.after(async () => {
  await admin.app().delete();
});

test("create() conflicts, deep-merge set, top-level update", async () => {
  await wipe();
  await store.create("mkTest/a", { n: 1, nested: { x: 1, y: 1 } });
  await assert.rejects(store.create("mkTest/a", { n: 2 }), AlreadyExistsError);
  await store.set("mkTest/a", { nested: { y: 2 } }, true);
  assert.deepEqual((await store.get("mkTest/a")).data, { n: 1, nested: { x: 1, y: 2 } });
  await store.update("mkTest/a", { nested: { z: 3 } });
  assert.deepEqual((await store.get("mkTest/a")).data.nested, { z: 3 });
  assert.equal(await store.get("mkTest/missing"), null);
});

test("ordered queries with cursors, count and sum", async () => {
  await wipe();
  for (let i = 0; i < 7; i++) await store.set(`mkTest/r${i}`, { m: i % 2 ? "A" : "B", at: 100 + (i % 3), amt: i * 10 });
  const all = [];
  let after = null;
  for (;;) {
    const page = await store.query("mkTest", { where: [["m", "==", "A"]], orderBy: ["at", "desc"], limit: 2, after });
    all.push(...page.map((r) => r.id));
    if (page.length < 2) break;
    after = { v: page[page.length - 1].data.at, id: page[page.length - 1].id };
  }
  assert.deepEqual(all.sort(), ["r1", "r3", "r5"]);
  assert.equal(await store.count("mkTest", [["m", "==", "A"]]), 3);
  assert.equal(await store.sum("mkTest", [["m", "==", "A"]], "amt"), 90);
  assert.equal(await store.sum("mkTest", [["m", "==", "none"]], "amt"), 0);
});

test("transaction create conflict surfaces as AlreadyExistsError and writes nothing", async () => {
  await wipe();
  await store.create("mkTest/t1", { v: 1 });
  await assert.rejects(
    store.txn(async (tx) => {
      tx.set("mkTest/t2", { v: 2 });
      tx.create("mkTest/t1", { v: 3 });
    }),
    AlreadyExistsError,
  );
  assert.equal(await store.get("mkTest/t2"), null);
  assert.equal((await store.get("mkTest/t1")).data.v, 1);
});

test("service flows on real Firestore: isolation, verification, deposit de-duplication, earnings", async () => {
  await wipe();
  let clock = T0;
  const ctx = {
    store,
    auth: fakeAuth(),
    providers: { aviator: fakeProvider("aviator"), football: fakeProvider("football", { connected: false }) },
    now: () => clock,
    timestamp: (ms) => admin.firestore.Timestamp.fromMillis(ms),
  };
  await store.set("users/owner", { name: "Gregory", role: "admin", status: "active" });
  const owner = { uid: "owner", name: "Gregory", role: "admin" };
  const call = (c, a, d = {}) => service.handle(ctx, c, a, d);
  const A = { uid: (await call(owner, "createMarketer", { name: "Ebrima Jallow", phone: "7000001", password: "correct horse 1" })).uid, name: "Ebrima", role: "marketer" };
  const B = { uid: (await call(owner, "createMarketer", { name: "Fatou Ceesay", phone: "7000002", password: "correct horse 1" })).uid, name: "Fatou", role: "marketer" };

  await call(A, "createContact", customer("7012345"));
  const key = domain.canonicalPhone("7012345").key;
  ctx.providers.aviator.accounts.set(key, { state: "matched", accountId: "P1", registeredAtMs: T0 + 60_000 });
  ctx.providers.aviator.deposits.set("P1", [dep("d1", 100, T0 + 5 * 60_000), dep("d1", 100, T0 + 5 * 60_000), dep("d2", 25, T0 + HOUR)]);
  const { id: agreementId } = await call(owner, "saveAgreementDraft", { marketerId: A.uid, from: "2026-10-01", terms: [{ type: "customer_reward", product: "aviator", qualifies: "verified_signup", amountMinor: 5000 }] });
  await call(owner, "approveAgreement", { id: agreementId });
  const offered = (await call(A, "listAgreements")).rows[0];
  await call(A, "acceptAgreement", { id: agreementId, termsHash: offered.termsHash });
  clock += 2 * HOUR;
  await call(owner, "syncNow");
  await call(owner, "syncNow");

  assert.equal((await call(B, "listContacts")).rows.length, 0);
  assert.equal((await call(A, "listContacts")).rows[0].accounts.aviator.attribution, "new_signup");
  const dash = await call(A, "dashboard", { range: "all" });
  assert.equal(dash.totals.products.aviator.depositsMinor, 12500);
  assert.equal(dash.totals.products.aviator.firstDepositCount, 1);
  const earnings = (await call(A, "listEarnings")).rows;
  assert.equal(earnings.length, 1);
  assert.equal(earnings[0].amountMinor, 5000);
  assert.equal((await call(B, "listEarnings")).rows.length, 0);
  // createMarketer wrote real staff login docs
  assert.equal((await store.get("staffLogins/ebrimajallow")).data.role, "marketer");

  // Public application → owner approval (creates the login) → applicant accepts the exact terms.
  const applied = await service.handlePublic(ctx, "apply", { name: "Awa Touray", phone: "7099001", products: ["aviator"], period: "weekly", customerTarget: 2, depositTargetMinor: 10000, requestedRateBp: 1000, consent: true }, { ip: "1.1.1.1" });
  assert.match(applied.reference, /^[A-Z0-9-]{8}$/);
  const [app] = (await call(owner, "listApplications", { status: "pending" })).rows;
  const approved = await call(owner, "approveApplication", { id: app.id, password: "awa password 1", products: ["aviator"], period: "weekly", customerTarget: 2, depositTargetMinor: 10000, rateBp: 1000, missedRateBp: 500, qualifyingDays: 30, from: "2026-10-19" });
  const awa = { uid: approved.marketerId, name: "Awa Touray", role: "marketer" };
  const offer = (await call(awa, "listAgreements")).rows[0];
  assert.equal(offer.status, "awaiting_acceptance");
  await call(awa, "acceptAgreement", { id: offer.id, termsHash: offer.termsHash });
  const card = await call(awa, "myTargetCard");
  assert.equal(card.target.rateBp, 1000);
  assert.equal((await store.get("staffLogins/awatouray")).data.uid, awa.uid);
});
