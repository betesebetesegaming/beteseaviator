import * as crypto from "crypto";
import { db, FieldValue, round2, walletRead, walletWrite } from "../helpers";
import { getQTechSettings } from "./config";
import { createWalletSession } from "./session";

const TEST_AMOUNT = 10;
const MIN_BALANCE = 50;
const GAME_ID = "SPB-aviator";

type Step = { name: string; ok: boolean; detail?: string };

function randomId(): string {
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

function isoCreated(): string {
  return new Date().toISOString();
}

function decEq(a: number, b: number): boolean {
  return Math.abs(round2(a) - round2(b)) < 0.02;
}

function assertBalance(label: string, actual: number, expected: number, steps: Step[]): number {
  if (!decEq(actual, expected)) {
    steps.push({
      name: label,
      ok: false,
      detail: `Expected balance ${expected}, got ${actual}`,
    });
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
  steps.push({ name: label, ok: true });
  return actual;
}

type CwCtx = {
  baseUrl: string;
  passKey: string;
  playerId: string;
  session: string;
  sessionExpired: string;
  currency: string;
  gameId: string;
  amount: number;
};

async function cwFetch(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: Record<string, unknown> }
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = {};
  }
  return { status: res.status, json };
}

function authHeaders(ctx: CwCtx, session?: string): Record<string, string> {
  const h: Record<string, string> = { "Pass-Key": ctx.passKey };
  const s = session ?? ctx.session;
  if (s) h["Wallet-Session"] = s;
  return h;
}

function balanceOf(json: Record<string, unknown>): number {
  return round2(Number(json.balance ?? 0));
}

async function getBalance(ctx: CwCtx, session?: string): Promise<number> {
  const url = `${ctx.baseUrl}/accounts/${encodeURIComponent(ctx.playerId)}/balance?gameId=${encodeURIComponent(ctx.gameId)}`;
  const { status, json } = await cwFetch(url, { headers: authHeaders(ctx, session) });
  if (status >= 400) {
    throw new Error(`getBalance failed (${status}): ${JSON.stringify(json)}`);
  }
  return balanceOf(json);
}

async function verifySession(ctx: CwCtx): Promise<number> {
  const url = `${ctx.baseUrl}/accounts/${encodeURIComponent(ctx.playerId)}/session?gameId=${encodeURIComponent(ctx.gameId)}`;
  const { status, json } = await cwFetch(url, { headers: authHeaders(ctx) });
  if (status >= 400) {
    throw new Error(`verifySession failed (${status}): ${JSON.stringify(json)}`);
  }
  return balanceOf(json);
}

async function withdrawal(
  ctx: CwCtx,
  amount: number,
  txnId: string,
  roundId: string,
  clientRoundId: string
): Promise<{ balance: number; referenceId: string }> {
  const url = `${ctx.baseUrl}/transactions/`;
  const body = {
    txnType: "DEBIT",
    txnId,
    playerId: ctx.playerId,
    roundId,
    clientRoundId,
    amount,
    currency: ctx.currency,
    gameId: ctx.gameId,
    device: "MOBILE",
    clientType: "HTML5",
    category: "CASINO/CRASH",
    completed: "false",
    created: isoCreated(),
  };
  const { status, json } = await cwFetch(url, {
    method: "POST",
    headers: authHeaders(ctx),
    body,
  });
  if (status >= 400) {
    throw new Error(`withdrawal failed (${status}): ${JSON.stringify(json)}`);
  }
  return { balance: balanceOf(json), referenceId: String(json.referenceId ?? "") };
}

async function deposit(
  ctx: CwCtx,
  amount: number,
  txnId: string,
  roundId: string,
  betId: string | null,
  clientRoundId: string,
  completed = "true"
): Promise<number> {
  const url = `${ctx.baseUrl}/transactions`;
  const body: Record<string, unknown> = {
    txnType: "CREDIT",
    txnId,
    playerId: ctx.playerId,
    roundId,
    clientRoundId,
    amount,
    currency: ctx.currency,
    gameId: ctx.gameId,
    device: "MOBILE",
    clientType: "HTML5",
    category: "CASINO/CRASH",
    completed,
    created: isoCreated(),
  };
  if (betId) body.betId = betId;
  const { status, json } = await cwFetch(url, {
    method: "POST",
    headers: authHeaders(ctx),
    body,
  });
  if (status >= 400) {
    throw new Error(`deposit failed (${status}): ${JSON.stringify(json)}`);
  }
  return balanceOf(json);
}

async function rollbackV2(
  ctx: CwCtx,
  betId: string,
  amount: number,
  txnId: string,
  roundId: string,
  clientRoundId: string,
  session?: string
): Promise<number> {
  const url = `${ctx.baseUrl}/transactions/rollback`;
  const body = {
    betId,
    txnId,
    playerId: ctx.playerId,
    roundId,
    clientRoundId,
    amount,
    currency: ctx.currency,
    gameId: ctx.gameId,
    device: "MOBILE",
    clientType: "HTML5",
    category: "CASINO/CRASH",
    completed: "true",
    created: isoCreated(),
  };
  const { status, json } = await cwFetch(url, {
    method: "POST",
    headers: authHeaders(ctx, session),
    body,
  });
  if (status >= 400) {
    throw new Error(`rollback failed (${status}): ${JSON.stringify(json)}`);
  }
  return balanceOf(json);
}

async function reward(ctx: CwCtx, amount: number, txnId: string): Promise<number> {
  const url = `${ctx.baseUrl}/bonus/reward`;
  const body = {
    txnId,
    playerId: ctx.playerId,
    amount,
    currency: ctx.currency,
    rewardType: "TOURNAMENT",
    rewardTitle: "CW test reward",
    created: isoCreated(),
  };
  const { status, json } = await cwFetch(url, {
    method: "POST",
    headers: authHeaders(ctx),
    body,
  });
  if (status >= 400) {
    throw new Error(`reward failed (${status}): ${JSON.stringify(json)}`);
  }
  return balanceOf(json);
}

async function runCommonWalletFlow(ctx: CwCtx, steps: Step[]): Promise<void> {
  let balance = await getBalance(ctx);
  steps.push({ name: "GetBalance (initial)", ok: true, detail: String(balance) });

  balance = await verifySession(ctx);
  steps.push({ name: "VerifySession", ok: true, detail: String(balance) });

  const roundId = randomId();
  const clientRoundId = randomId();
  const amount = ctx.amount;
  const betId1 = randomId();
  const betId2 = randomId();

  const w1 = await withdrawal(ctx, amount, betId1, roundId, clientRoundId);
  balance = assertBalance("Bet #1 (withdrawal)", w1.balance, balance - amount, steps);
  balance = assertBalance("GetBalance after bet #1", await getBalance(ctx), balance, steps);

  const w2 = await withdrawal(ctx, amount, betId2, roundId, clientRoundId);
  balance = assertBalance("Bet #2 (withdrawal)", w2.balance, balance - amount, steps);

  const beforePayout = balance;
  balance = await deposit(ctx, amount, randomId(), roundId, betId2, clientRoundId, "true");
  assertBalance("Payout (deposit / win)", balance, beforePayout + amount, steps);
  balance = assertBalance("GetBalance after payout", await getBalance(ctx), balance, steps);

  const rbStart = await getBalance(ctx);
  const rbBetId = randomId();
  await withdrawal(ctx, amount, rbBetId, randomId(), randomId());
  const afterRb = await rollbackV2(ctx, rbBetId, amount, randomId(), randomId(), randomId());
  assertBalance("Rollback (net zero)", afterRb, rbStart, steps);

  const rbBetId2 = randomId();
  await withdrawal(ctx, amount, rbBetId2, randomId(), randomId());
  const afterRbExpired = await rollbackV2(
    ctx,
    rbBetId2,
    amount,
    randomId(),
    randomId(),
    randomId(),
    ctx.sessionExpired
  );
  assertBalance("Rollback with expired session", afterRbExpired, rbStart, steps);

  const beforeReward = await getBalance(ctx);
  const afterReward = await reward(ctx, amount, randomId());
  assertBalance("Reward (bonus credit)", afterReward, beforeReward + amount, steps);
}

async function runIdempotencyChecks(ctx: CwCtx, steps: Step[]): Promise<void> {
  const amount = ctx.amount;
  const roundId = randomId();
  const clientRoundId = randomId();
  const txnId = randomId();

  let balance = await getBalance(ctx);
  const first = await withdrawal(ctx, amount, txnId, roundId, clientRoundId);
  assertBalance("Idempotent withdrawal #1", first.balance, balance - amount, steps);

  const second = await withdrawal(ctx, amount, txnId, roundId, clientRoundId);
  assertBalance("Idempotent withdrawal #2 (same txnId)", second.balance, first.balance, steps);
  if (first.referenceId !== second.referenceId) {
    steps.push({
      name: "Idempotent withdrawal referenceId",
      ok: false,
      detail: `${first.referenceId} != ${second.referenceId}`,
    });
    throw new Error("Duplicate withdrawal returned different referenceId");
  }
  steps.push({ name: "Idempotent withdrawal referenceId", ok: true });

  const depTxn = randomId();
  const betTxn = randomId();
  balance = await getBalance(ctx);
  await withdrawal(ctx, amount, betTxn, roundId, clientRoundId);
  const dep1 = await deposit(ctx, amount, depTxn, roundId, betTxn, clientRoundId, "true");
  const dep2 = await deposit(ctx, amount, depTxn, roundId, betTxn, clientRoundId, "true");
  assertBalance("Idempotent deposit", dep2, dep1, steps);
}

export async function seedCwTestSessions(
  uid: string,
  gameId = "qtech-crash",
  qtechGameId = GAME_ID
): Promise<{ active: string; expired: string }> {
  const active = await createWalletSession(uid, gameId, qtechGameId);
  const expired = crypto.randomUUID().replace(/-/g, "");
  await db.doc(`qtechSessions/${expired}`).set({
    uid,
    gameId,
    qtechGameId,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now() - 60 * 60 * 1000),
  });
  return { active, expired };
}

async function ensureCwTestFunding(uid: string, targetBalance: number): Promise<number> {
  const walletSnap = await db.doc(`wallets/${uid}`).get();
  const balance = round2(Number(walletSnap.data()?.balance ?? 0));
  const bonus = round2(Number(walletSnap.data()?.bonusBalance ?? 0));
  const playable = round2(balance + bonus);
  if (playable >= targetBalance) return playable;

  const topUp = round2(targetBalance - playable);
  await db.runTransaction(async (tx) => {
    const wallet = await walletRead(tx, uid);
    walletWrite(tx, wallet, {
      uid,
      amount: topUp,
      type: "deposit",
      description: "QTech CW certification test funding",
      meta: { source: "qtech_cw_certification" },
      ignoreFrozen: true,
    });
  });
  const after = await db.doc(`wallets/${uid}`).get();
  return round2(Number(after.data()?.balance ?? 0) + Number(after.data()?.bonusBalance ?? 0));
}

import { ensureCwTestPlayer } from "./cwTestPlayer";

async function pickTestPlayer(preferredUid?: string): Promise<{
  uid: string;
  balance: number;
}> {
  if (preferredUid) {
    const user = await db.doc(`users/${preferredUid}`).get();
    if (!user.exists || user.data()?.role !== "player") {
      throw new Error("Player UID not found or not a player account.");
    }
    const wallet = await db.doc(`wallets/${preferredUid}`).get();
    const balance = round2(
      Number(wallet.data()?.balance ?? 0) + Number(wallet.data()?.bonusBalance ?? 0)
    );
    return { uid: preferredUid, balance };
  }

  return ensureCwTestPlayer();
}

export type CwTestResult = {
  ok: boolean;
  playerId: string;
  walletUrl: string;
  sessions: { active: string; expired: string };
  steps: Step[];
  error?: string;
  durationMs: number;
};

/** Runs QTech Common Wallet certification flow against the live qtcwApi deployment. */
export async function runQTechCwTestSuite(opts?: {
  playerUid?: string;
  amount?: number;
  gameId?: string;
}): Promise<CwTestResult> {
  const started = Date.now();
  const steps: Step[] = [];
  const cfg = await getQTechSettings();
  if (!cfg.passKey) {
    return {
      ok: false,
      playerId: "",
      walletUrl: "",
      sessions: { active: "", expired: "" },
      steps: [{ name: "Pass-Key configured", ok: false, detail: "Save Pass-Key in Admin → QTech & Games" }],
      error: "Wallet Pass-Key is not configured.",
      durationMs: Date.now() - started,
    };
  }

  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "beteseaviator-a05ae";
  const baseUrl = `https://us-central1-${projectId}.cloudfunctions.net/qtcwApi`.replace(/\/+$/, "");

  let player: { uid: string; balance: number };
  try {
    player = await pickTestPlayer(opts?.playerUid);
  } catch (e) {
    return {
      ok: false,
      playerId: opts?.playerUid ?? "",
      walletUrl: baseUrl,
      sessions: { active: "", expired: "" },
      steps: [{ name: "Pick test player", ok: false, detail: e instanceof Error ? e.message : String(e) }],
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - started,
    };
  }

  if (player.balance < MIN_BALANCE) {
    player.balance = await ensureCwTestFunding(player.uid, MIN_BALANCE + TEST_AMOUNT * 3);
  }

  const gameId = opts?.gameId ?? GAME_ID;
  const sessions = await seedCwTestSessions(player.uid, "qtech-crash", gameId);
  const ctx: CwCtx = {
    baseUrl,
    passKey: cfg.passKey,
    playerId: player.uid,
    session: sessions.active,
    sessionExpired: sessions.expired,
    currency: cfg.currency || "GMD",
    gameId,
    amount: opts?.amount ?? TEST_AMOUNT,
  };

  try {
    const health = await cwFetch(`${baseUrl}/health`, {});
    if (health.status !== 200) {
      throw new Error(`Wallet health check failed (${health.status})`);
    }
    steps.push({ name: "Wallet API health", ok: true });
    steps.push({
      name: "Test player funded",
      ok: true,
      detail: `${player.uid} playable ${player.balance} GMD`,
    });

    await runCommonWalletFlow(ctx, steps);
    await runIdempotencyChecks(ctx, steps);

    return {
      ok: true,
      playerId: player.uid,
      walletUrl: baseUrl,
      sessions,
      steps,
      durationMs: Date.now() - started,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!steps.some((s) => !s.ok)) {
      steps.push({ name: "Test run", ok: false, detail: msg });
    }
    return {
      ok: false,
      playerId: player.uid,
      walletUrl: baseUrl,
      sessions,
      steps,
      error: msg,
      durationMs: Date.now() - started,
    };
  }
}

const WALLET_BASE =
  "https://us-central1-beteseaviator-a05ae.cloudfunctions.net/qtcwApi";

/** INI contents for QTech's cw_qtcw_tester.cfg certification script. */
export function buildCwTesterCfg(opts: {
  walletUrl?: string;
  passKey: string;
  playerId: string;
  sessions: { active: string; expired: string };
  gameId?: string;
  currency?: string;
  amount?: number;
}): string {
  const base = (opts.walletUrl || WALLET_BASE).replace(/\/+$/, "");
  const gameId = opts.gameId || GAME_ID;
  const currency = opts.currency || "GMD";
  const amount = opts.amount ?? TEST_AMOUNT;
  return `[wallet]
walleturl = ${base}/
withdrawurl = ${base}/transactions/
depositurl = ${base}/transactions
rollbackurl = ${base}/transactions/rollback
walletsession = ${opts.sessions.active}
walletsessionExpired = ${opts.sessions.expired}
passkey = ${opts.passKey}
playerid = ${opts.playerId}
currency = ${currency}
gameid = ${gameId}
device = MOBILE
clienttype = HTML5
category = CASINO/CRASH
completed = false
amount = ${amount}
blockedplayerid =
blockedwalletsession =
amounttoreachinsufficientfund = 99999999
rewardurl = ${base}/bonus/reward
verifybalanceondeposit = 1
`;
}

export type CwHandoverPackage = {
  testResult: CwTestResult;
  cfg: string;
  endpoints: Array<{ method: string; path: string; purpose: string }>;
};

export async function runCwHandoverPackage(opts?: {
  playerUid?: string;
  amount?: number;
  gameId?: string;
}): Promise<CwHandoverPackage> {
  const settings = await getQTechSettings();
  const testResult = await runQTechCwTestSuite(opts);
  const cfg = buildCwTesterCfg({
    walletUrl: testResult.walletUrl,
    passKey: settings.passKey,
    playerId: testResult.playerId,
    sessions: testResult.sessions,
    gameId: opts?.gameId,
    currency: settings.currency,
    amount: opts?.amount,
  });
  return {
    testResult,
    cfg,
    endpoints: [
      { method: "GET", path: "/accounts/{playerId}/session", purpose: "Verify Session" },
      { method: "GET", path: "/accounts/{playerId}/balance", purpose: "Get Balance" },
      { method: "POST", path: "/transactions/", purpose: "Withdrawal (bet / DEBIT)" },
      { method: "POST", path: "/transactions", purpose: "Deposit (payout / CREDIT)" },
      { method: "POST", path: "/bonus/reward", purpose: "Reward" },
      { method: "POST", path: "/transactions/rollback", purpose: "Rollback (v2)" },
      { method: "POST", path: "/transactions/{referenceId}/rollback", purpose: "Rollback (v1)" },
    ],
  };
}
