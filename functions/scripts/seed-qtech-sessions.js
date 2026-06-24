#!/usr/bin/env node
/**
 * Seed QTech wallet sessions for the Common Wallet certification tester.
 *
 * Creates two `qtechSessions/*` docs for one player UID:
 *   - an ACTIVE session  (expires in 24h)  -> cfg `walletsession`
 *   - an EXPIRED session (already expired)  -> cfg `walletsessionExpired`
 * then prints the lines to paste into docs/qtech/cw_qtcw_tester.cfg.
 *
 * Usage:
 *   node functions/scripts/seed-qtech-sessions.js <playerUid>
 *   node functions/scripts/seed-qtech-sessions.js            # list candidate player UIDs
 *
 * Credentials (this writes to project beteseaviator-a05ae Firestore):
 *   Prod:     gcloud auth application-default login
 *             (or set GOOGLE_APPLICATION_CREDENTIALS=<service-account.json>)
 *   Emulator: set FIRESTORE_EMULATOR_HOST=localhost:8080 (admin SDK auto-detects)
 *
 * Mirrors createWalletSession() in functions/src/qtech/session.ts.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const PROJECT_ID = process.env.GCLOUD_PROJECT || "beteseaviator-a05ae";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// Auth order: emulator → GOOGLE_APPLICATION_CREDENTIALS → functions/serviceAccountKey.json → ADC.
// (gcloud is not installed on this machine, so a service-account key is the prod path.)
const localKey = path.join(__dirname, "..", "serviceAccountKey.json");
if (
  !process.env.FIRESTORE_EMULATOR_HOST &&
  !process.env.GOOGLE_APPLICATION_CREDENTIALS &&
  fs.existsSync(localKey)
) {
  admin.initializeApp({ credential: admin.credential.cert(require(localKey)), projectId: PROJECT_ID });
} else {
  admin.initializeApp({ projectId: PROJECT_ID });
}
const db = admin.firestore();

const newSessionId = () => crypto.randomUUID().replace(/-/g, "");

async function walletBalance(uid) {
  const w = await db.doc(`wallets/${uid}`).get();
  if (!w.exists) return { balance: 0, bonus: 0 };
  const d = w.data();
  return { balance: Number(d.balance ?? 0), bonus: Number(d.bonusBalance ?? 0) };
}

async function listPlayers() {
  const snap = await db.collection("users").where("role", "==", "player").limit(15).get();
  if (snap.empty) {
    console.log("No player users found in this project.");
    return;
  }
  console.log("Pass a player UID as the first argument. Candidates:\n");
  for (const doc of snap.docs) {
    const u = doc.data();
    const { balance, bonus } = await walletBalance(doc.id);
    const label = u.name || u.phone || u.email || "";
    console.log(`  ${doc.id}  ${label}  balance=${balance} bonus=${bonus} ${u.status || ""}`);
  }
  console.log("\nThen: node functions/scripts/seed-qtech-sessions.js <uid>");
}

async function seed(uid) {
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) {
    console.error(`users/${uid} does not exist. Run with no arguments to list players.`);
    process.exit(1);
  }
  if (userSnap.data().role !== "player") {
    console.error(
      `users/${uid} has role "${userSnap.data().role}", not "player". ` +
        `The tester moves real money — point it at a player wallet.`
    );
    process.exit(1);
  }

  const now = Date.now();
  const active = newSessionId();
  const expired = newSessionId();
  const base = {
    uid,
    gameId: "qtech-crash",
    qtechGameId: process.env.QT_TEST_GAME_ID || "TEST-GAME",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.doc(`qtechSessions/${active}`).set({ ...base, expiresAt: new Date(now + SESSION_TTL_MS) });
  await db.doc(`qtechSessions/${expired}`).set({ ...base, expiresAt: new Date(now - 60 * 60 * 1000) });

  const { balance, bonus } = await walletBalance(uid);
  const target = process.env.FIRESTORE_EMULATOR_HOST
    ? `emulator (${process.env.FIRESTORE_EMULATOR_HOST})`
    : `project ${PROJECT_ID}`;

  console.log(`\nSeeded 2 sessions for ${uid} on ${target}.`);
  console.log(`Wallet: balance=${balance} bonus=${bonus}\n`);
  console.log("Paste into docs/qtech/cw_qtcw_tester.cfg:\n");
  console.log(`playerid = ${uid}`);
  console.log(`walletsession = ${active}`);
  console.log(`walletsessionExpired = ${expired}`);
  console.log("");
  if (balance < 200) {
    console.log(
      "WARNING: balance < 200. `all`/`commonwallet`/`withdrawal` runs do several debits; " +
        "top this player up or use a smaller `amount` in the cfg to avoid spurious INSUFFICIENT_FUNDS."
    );
  }
}

(async () => {
  const uid = process.argv[2];
  if (uid) await seed(uid);
  else await listPlayers();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
