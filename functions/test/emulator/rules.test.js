/**
 * Firestore security rules against the real emulator (firestore.rules from the repo root).
 * Covers the new mk* collections AND a regression matrix proving players, agents and admin
 * keep exactly their existing access while marketers gain none of it.
 *
 * Run via `npm run test:emulator` (starts the Firestore emulator with project demo-betese-marketers).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { initializeApp, deleteApp } = require("firebase/app");
const { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, collection, getDocs, query, where } = require("firebase/firestore");

const PROJECT = "demo-betese-marketers";
const [HOST, PORT] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");

if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT });
const adb = admin.firestore();

const apps = [];
function clientAs(uid, role) {
  const app = initializeApp({ projectId: PROJECT, apiKey: "demo" }, `c${apps.length}`);
  apps.push(app);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, HOST, Number(PORT), uid ? { mockUserToken: { sub: uid, user_id: uid, ...(role ? { role } : {}) } } : undefined);
  return db;
}

async function allowed(p) {
  try {
    await p;
    return true;
  } catch (e) {
    if (String(e.code || e).includes("permission-denied")) return false;
    throw e;
  }
}

const MK = [
  "mkContacts",
  "mkConsentEvents",
  "mkProductAccounts",
  "mkDeposits",
  "mkCampaignRevisions",
  "mkTemplates",
  "mkSettings",
  "mkAudit",
  "mkTargets",
  "mkAgreements",
  "mkEarnings",
  "mkPayouts",
  "mkCampaignCompletions",
];

let players, agent, owner, marketer, marketerB, anon;

test.before(async () => {
  const seed = {
    "users/player1": { role: "player", status: "active", parentId: "agent1", ancestors: ["agent1"], name: "P1" },
    "users/player2": { role: "player", status: "active", parentId: null, ancestors: [], name: "P2" },
    "users/agent1": { role: "agent", status: "active", ancestors: [], name: "Agent" },
    "users/admin1": { role: "admin", status: "active", ancestors: [], name: "Owner" },
    "users/mk1": { role: "marketer", status: "active", ancestors: [], name: "Ebrima" },
    "users/mk2": { role: "marketer", status: "active", ancestors: [], name: "Fatou" },
    "wallets/player1": { balance: 100 },
    "wallets/agent1": { balance: 500 },
    "transactions/t1": { userId: "player1", type: "deposit", meta: {} },
    "commissions/c1": { agentId: "agent1" },
    "slugs/fatou": { uid: "agent1", active: true },
    "staffLogins/ebrima": { uid: "mk1", role: "marketer" },
    "settings/publicPlatform": { ok: true },
    "settings/platform": { secret: true },
    "phones/877012345": { uid: "player1" },
  };
  for (const c of MK) seed[`${c}/doc1`] = { marketerId: "mk1", note: "seed" };
  const batch = adb.batch();
  for (const [p, d] of Object.entries(seed)) batch.set(adb.doc(p), d);
  await batch.commit();

  players = clientAs("player1", "player");
  agent = clientAs("agent1", "agent");
  owner = clientAs("admin1", "admin");
  marketer = clientAs("mk1", "marketer");
  marketerB = clientAs("mk2", "marketer");
  anon = clientAs(null);
});

test.after(async () => {
  for (const a of apps) await deleteApp(a);
  await admin.app().delete();
});

test("every mk* collection is closed to all clients, including owner and the owning marketer", async () => {
  for (const c of MK) {
    for (const [who, db] of [["owner", owner], ["marketer", marketer], ["marketerB", marketerB], ["player", players], ["agent", agent], ["anon", anon]]) {
      assert.equal(await allowed(getDoc(doc(db, c, "doc1"))), false, `${who} read ${c}`);
      assert.equal(await allowed(setDoc(doc(db, c, "x"), { marketerId: "mk1" })), false, `${who} write ${c}`);
    }
    assert.equal(await allowed(getDocs(query(collection(marketer, c), where("marketerId", "==", "mk1")))), false, `marketer list ${c}`);
  }
});

test("marketers read only their own profile and nothing from betting, wallets or agents", async () => {
  assert.equal(await allowed(getDoc(doc(marketer, "users", "mk1"))), true, "own profile");
  for (const p of ["users/player1", "users/agent1", "users/mk2", "wallets/player1", "wallets/agent1", "transactions/t1", "commissions/c1", "settings/platform", "phones/877012345", "staffLogins/ebrima"]) {
    const [c, id] = p.split("/");
    assert.equal(await allowed(getDoc(doc(marketer, c, id))), false, p);
  }
  // Same public data any visitor can read.
  assert.equal(await allowed(getDoc(doc(marketer, "settings", "publicPlatform"))), true);
  assert.equal(await allowed(getDoc(doc(marketer, "slugs", "fatou"))), true);
});

test("marketers cannot create payment requests (players still can)", async () => {
  assert.equal(await allowed(setDoc(doc(marketer, "deposit_requests", "d-mk"), { customer_id: "mk1", status: "Pending" })), false);
  assert.equal(await allowed(setDoc(doc(marketer, "withdrawal_requests", "w-mk"), { user_id: "mk1", status: "Pending" })), false);
  assert.equal(await allowed(setDoc(doc(players, "deposit_requests", "d-p1"), { customer_id: "player1", status: "Pending" })), true);
  assert.equal(await allowed(setDoc(doc(players, "withdrawal_requests", "w-p1"), { user_id: "player1", status: "Pending" })), true);
});

test("regression: players, agents and admin keep their existing access", async () => {
  // players
  assert.equal(await allowed(getDoc(doc(players, "users", "player1"))), true);
  assert.equal(await allowed(getDoc(doc(players, "users", "player2"))), false);
  assert.equal(await allowed(getDoc(doc(players, "wallets", "player1"))), true);
  assert.equal(await allowed(getDoc(doc(players, "transactions", "t1"))), true);
  // agents see their own tree
  assert.equal(await allowed(getDoc(doc(agent, "users", "player1"))), true);
  assert.equal(await allowed(getDoc(doc(agent, "users", "player2"))), false);
  assert.equal(await allowed(getDoc(doc(agent, "wallets", "player1"))), true);
  assert.equal(await allowed(getDoc(doc(agent, "transactions", "t1"))), true);
  assert.equal(await allowed(getDoc(doc(agent, "commissions", "c1"))), true);
  // admin
  assert.equal(await allowed(getDoc(doc(owner, "users", "mk1"))), true);
  assert.equal(await allowed(getDoc(doc(owner, "settings", "platform"))), true);
  assert.equal(await allowed(getDoc(doc(owner, "phones", "877012345"))), true);
  // public
  assert.equal(await allowed(getDoc(doc(anon, "slugs", "fatou"))), true);
  assert.equal(await allowed(getDoc(doc(anon, "staffLogins", "ebrima"))), false);
});
