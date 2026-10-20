/** Shared fakes for the marketers test suites (in-memory store, providers, auth). */
const assert = require("node:assert/strict");
const { memoryStore } = require("./memoryStore");
const service = require("../lib/marketers/service");
const domain = require("../lib/marketers/domain");

const HOUR = 3600_000;
const T0 = Date.UTC(2026, 9, 20, 10, 0, 0); // 20 Oct 2026 10:00 GMT

function fakeProvider(product, { connected = true } = {}) {
  const accounts = new Map(); // phoneKey -> result
  const deposits = new Map(); // accountId -> ProviderDeposit[]
  return {
    product,
    connected,
    missing: connected ? [] : ["docs"],
    accounts,
    deposits,
    async findAccount(phoneKey) {
      return accounts.get(phoneKey) ?? { state: "not_found" };
    },
    async fetchDeposits(accountId, sinceMs) {
      const rows = (deposits.get(accountId) ?? []).filter((d) => d.depositedAtMs >= sinceMs);
      const next = rows.reduce((m, d) => Math.max(m, d.depositedAtMs), sinceMs);
      return { state: "ok", deposits: rows, nextSinceMs: next, complete: true };
    },
    async hasDepositsBefore(accountId, beforeMs) {
      return (deposits.get(accountId) ?? []).some((d) => d.depositedAtMs < beforeMs);
    },
  };
}

function fakeAuth() {
  const users = new Map();
  let n = 0;
  return {
    users,
    async createUser({ email, password, displayName }) {
      for (const u of users.values()) if (u.email === email) throw new Error("auth/email-already-exists");
      const uid = `u${++n}`;
      users.set(uid, { email, password, displayName, disabled: false, revoked: 0, role: null });
      return uid;
    },
    async deleteUser(uid) {
      users.delete(uid);
    },
    async updatePassword(uid, password) {
      users.get(uid).password = password;
    },
    async setDisabled(uid, disabled) {
      users.get(uid).disabled = disabled;
    },
    async revokeSessions(uid) {
      users.get(uid).revoked += 1;
    },
    async setRole(uid, role) {
      users.get(uid).role = role;
    },
  };
}

async function setup({ footballConnected = false } = {}) {
  const store = memoryStore();
  let clock = T0;
  const ctx = {
    store,
    auth: fakeAuth(),
    providers: { aviator: fakeProvider("aviator"), football: fakeProvider("football", { connected: footballConnected }) },
    now: () => clock,
    timestamp: (ms) => ms,
  };
  await store.set("users/owner", { name: "Gregory", role: "admin", status: "active" });
  const owner = { uid: "owner", name: "Gregory", role: "admin" };
  const call = (caller, action, data = {}) => service.handle(ctx, caller, action, data);
  const mkMarketer = async (name, phone) => {
    const { uid } = await call(owner, "createMarketer", { name, phone, password: "correct horse 1" });
    return { uid, name, role: "marketer" };
  };
  const A = await mkMarketer("Ebrima Jallow", "7000001");
  const B = await mkMarketer("Fatou Ceesay", "7000002");
  return {
    ctx,
    store,
    owner,
    A,
    B,
    call,
    mkMarketer,
    advance: (ms) => (clock += ms),
    setClock: (ms) => (clock = ms),
  };
}

const customer = (phone, extra = {}) => ({
  name: "Demo Customer",
  phone,
  products: ["aviator"],
  smsConsent: true,
  adultConfirmed: true,
  ...extra,
});

async function rejects(promise, code, re) {
  await assert.rejects(promise, (e) => {
    assert.ok(e instanceof domain.DomainError, `expected DomainError, got ${e}`);
    assert.equal(e.code, code);
    if (re) assert.match(e.message, re);
    return true;
  });
}

function dep(id, amountGmd, atMs, extra = {}) {
  return { externalTxnId: id, amountMinor: Math.round(amountGmd * 100), currency: "GMD", kind: "deposit", depositedAtMs: atMs, channel: "modempay", ...extra };
}

module.exports = { HOUR, T0, fakeProvider, fakeAuth, setup, customer, rejects, dep, assert, service, domain };
