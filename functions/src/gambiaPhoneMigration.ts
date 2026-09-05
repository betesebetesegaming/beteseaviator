import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { FieldPath } from "firebase-admin/firestore";
import { auth, db, FieldValue, phoneToEmail, requireRole, writePhoneIndex, type ProfileData } from "./helpers";
import { classifyGambia9, type Gambia9Plan, type Gambia9Status } from "./gambia9";

const PAGE = 250;
const SAMPLE = 25;
const STATE_DOC = "settings/gambiaPhoneMigration";
const BACKUP_ROOT = "gambia9_phone_backups";

export type Gambia9PreviewRow = Gambia9Plan & {
  uid: string;
  role: string;
  name: string;
  storedPhone: string;
};

type Counts = Record<Gambia9Status, number>;

function emptyCounts(): Counts {
  return { convert: 0, already_converted: 0, gamcel_unchanged: 0, unsafe: 0, empty: 0 };
}

async function scanUsers(
  onRow: (uid: string, data: ProfileData, plan: Gambia9Plan) => Promise<void> | void,
): Promise<{ scanned: number; counts: Counts }> {
  const counts = emptyCounts();
  let scanned = 0;
  let lastId: string | null = null;
  for (;;) {
    let query = db.collection("users").orderBy(FieldPath.documentId()).limit(PAGE);
    if (lastId) query = query.startAfter(lastId);
    const snap = await query.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      scanned += 1;
      const data = doc.data() as ProfileData;
      const plan = classifyGambia9(String(data.phone ?? ""));
      counts[plan.status] += 1;
      await onRow(doc.id, data, plan);
    }
    lastId = snap.docs[snap.docs.length - 1]?.id ?? null;
    if (snap.size < PAGE) break;
  }
  return { scanned, counts };
}

async function previewMigration() {
  const samples: Record<Gambia9Status, Gambia9PreviewRow[]> = {
    convert: [],
    already_converted: [],
    gamcel_unchanged: [],
    unsafe: [],
    empty: [],
  };
  const { scanned, counts } = await scanUsers((uid, data, plan) => {
    const bucket = samples[plan.status];
    if (bucket.length >= SAMPLE) return;
    bucket.push({
      ...plan,
      uid,
      role: String(data.role ?? ""),
      name: String(data.name ?? ""),
      storedPhone: String(data.phone ?? ""),
    });
  });
  const preview = {
    scanned,
    counts,
    samples,
    previewedAt: new Date().toISOString(),
    applied: false,
  };
  await db.doc(STATE_DOC).set(
    {
      preview,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return preview;
}

async function backupPhones() {
  const backupId = `gambia9-${Date.now()}`;
  let saved = 0;
  await scanUsers(async (uid, data) => {
    const storedPhone = String(data.phone ?? "");
    if (!storedPhone) return;
    let authEmail: string | null = null;
    try {
      authEmail = (await auth.getUser(uid)).email ?? null;
    } catch {
      authEmail = null;
    }
    await db.doc(`${BACKUP_ROOT}/${backupId}/accounts/${uid}`).set({
      uid,
      phone: storedPhone,
      role: data.role ?? null,
      name: data.name ?? null,
      authEmail,
      backedUpAt: FieldValue.serverTimestamp(),
    });
    saved += 1;
  });
  await db.doc(`${BACKUP_ROOT}/${backupId}`).set({
    createdAt: FieldValue.serverTimestamp(),
    saved,
  });
  await db.doc(STATE_DOC).set(
    {
      lastBackupId: backupId,
      lastBackupSaved: saved,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { backupId, saved };
}

async function applyMigration(confirm: string, backupId: string) {
  if (confirm !== "CONVERT") {
    throw new HttpsError("failed-precondition", "Type CONVERT to apply. Preview and backup first.");
  }
  const state = (await db.doc(STATE_DOC).get()).data() ?? {};
  if (!backupId || state.lastBackupId !== backupId) {
    throw new HttpsError("failed-precondition", "Create a backup from this page immediately before converting.");
  }
  if (!state.preview) {
    throw new HttpsError("failed-precondition", "Run a preview before converting.");
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const failures: { uid: string; reason: string }[] = [];

  await scanUsers(async (uid, data, plan) => {
    if (plan.status !== "convert") {
      skipped += 1;
      return;
    }
    try {
      const taken = await db.doc(`phones/${plan.newNumber}`).get();
      const takenUid = String(taken.data()?.uid ?? "");
      if (takenUid && takenUid !== uid) {
        failed += 1;
        failures.push({ uid, reason: `New number ${plan.newNumber} already belongs to ${takenUid}` });
        return;
      }
      await db.doc(`users/${uid}`).set(
        {
          phone: plan.newNumber,
          phoneMigratedAt: FieldValue.serverTimestamp(),
          phoneMigratedFrom: plan.oldNumber,
        },
        { merge: true },
      );
      const batch = db.batch();
      writePhoneIndex(batch, uid, plan.newNumber);
      await batch.commit();
      if (data.role === "player") {
        try {
          const user = await auth.getUser(uid);
          const nextEmail = phoneToEmail(plan.newNumber);
          if (user.email !== nextEmail) {
            await auth.updateUser(uid, { email: nextEmail });
          }
        } catch (err) {
          logger.warn("gambia9 apply auth email skipped", { uid, err: String(err) });
        }
      }
      updated += 1;
    } catch (err) {
      failed += 1;
      failures.push({ uid, reason: String(err) });
    }
  });

  const result = {
    updated,
    skipped,
    failed,
    failures: failures.slice(0, 50),
    appliedAt: new Date().toISOString(),
    backupId,
  };
  await db.doc(STATE_DOC).set(
    {
      lastApply: result,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return result;
}

async function rollbackMigration(backupId: string) {
  if (!backupId) throw new HttpsError("invalid-argument", "backupId is required.");
  const accounts = await db.collection(`${BACKUP_ROOT}/${backupId}/accounts`).get();
  let restored = 0;
  let failed = 0;
  for (const doc of accounts.docs) {
    const row = doc.data() as { phone?: string; authEmail?: string | null };
    const phone = String(row.phone ?? "");
    if (!phone) continue;
    try {
      await db.doc(`users/${doc.id}`).set({ phone }, { merge: true });
      const batch = db.batch();
      writePhoneIndex(batch, doc.id, phone);
      await batch.commit();
      if (row.authEmail) {
        try {
          await auth.updateUser(doc.id, { email: row.authEmail });
        } catch (err) {
          logger.warn("gambia9 rollback auth email skipped", { uid: doc.id, err: String(err) });
        }
      }
      restored += 1;
    } catch {
      failed += 1;
    }
  }
  const result = { backupId, restored, failed, rolledBackAt: new Date().toISOString() };
  await db.doc(STATE_DOC).set({ lastRollback: result, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return result;
}

export const adminGambia9Migration = onCall(
  { timeoutSeconds: 540, memory: "1GiB" },
  async (req) => {
    await requireRole(req, ["admin"]);
    const action = String(req.data?.action ?? "preview");
    if (action === "preview") return { ok: true as const, action, ...(await previewMigration()) };
    if (action === "backup") return { ok: true as const, action, ...(await backupPhones()) };
    if (action === "apply") {
      return {
        ok: true as const,
        action,
        ...(await applyMigration(String(req.data?.confirm ?? ""), String(req.data?.backupId ?? ""))),
      };
    }
    if (action === "rollback") {
      return { ok: true as const, action, ...(await rollbackMigration(String(req.data?.backupId ?? ""))) };
    }
    throw new HttpsError("invalid-argument", "action must be preview, backup, apply, or rollback.");
  },
);

/** Old callable — preview only. Never writes customer phones. */
export const adminMigrateGambiaNineDigitPhones = onCall(
  { timeoutSeconds: 540, memory: "1GiB" },
  async (req) => {
    await requireRole(req, ["admin"]);
    const preview = await previewMigration();
    return {
      ok: true as const,
      scanned: preview.scanned,
      updated: 0,
      aliases: 0,
      authEmails: 0,
      done: true,
      lastId: null,
      preview,
    };
  },
);

/** Automatic writes are disabled until an admin approves conversion. */
export const migrateGambiaNineDigitPhonesHourly = onSchedule(
  { schedule: "every 24 hours", timeoutSeconds: 60, memory: "256MiB" },
  async () => {
    logger.info("gambia9 auto-convert disabled; use admin Gambia9 preview/backup/apply");
  },
);

