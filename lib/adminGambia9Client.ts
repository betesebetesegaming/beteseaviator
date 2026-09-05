import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  writeBatch,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firestore";
import { classifyGambia9, type Gambia9Status } from "@/lib/gambia9";
import { phoneStorageKeys } from "@/lib/phone";
import type { Gambia9PreviewRow } from "@/lib/api";

const PAGE = 200;
const SAMPLE = 25;

export type Gambia9ClientPreview = {
  scanned: number;
  counts: Record<Gambia9Status, number>;
  samples: Record<Gambia9Status, Gambia9PreviewRow[]>;
  convertUids: string[];
};

type BackupRow = {
  uid: string;
  phone: string;
  name: string;
  role: string;
};

function emptyCounts(): Record<Gambia9Status, number> {
  return { convert: 0, already_converted: 0, gamcel_unchanged: 0, unsafe: 0, empty: 0 };
}

function emptySamples(): Record<Gambia9Status, Gambia9PreviewRow[]> {
  return { convert: [], already_converted: [], gamcel_unchanged: [], unsafe: [], empty: [] };
}

async function forEachUser(
  onDoc: (snap: QueryDocumentSnapshot) => Promise<void> | void,
): Promise<number> {
  let scanned = 0;
  let cursor: DocumentSnapshot | null = null;
  for (;;) {
    const q = cursor
      ? query(collection(db, "users"), orderBy("__name__"), startAfter(cursor), limit(PAGE))
      : query(collection(db, "users"), orderBy("__name__"), limit(PAGE));
    const snap = await getDocs(q);
    if (snap.empty) break;
    for (const row of snap.docs) {
      scanned += 1;
      await onDoc(row);
    }
    cursor = snap.docs[snap.docs.length - 1] ?? null;
    if (snap.size < PAGE) break;
  }
  return scanned;
}

export async function previewGambia9Accounts(): Promise<Gambia9ClientPreview> {
  const counts = emptyCounts();
  const samples = emptySamples();
  const convertUids: string[] = [];
  const scanned = await forEachUser((row) => {
    const data = row.data();
    const plan = classifyGambia9(String(data.phone ?? ""));
    counts[plan.status] += 1;
    if (plan.status === "convert") convertUids.push(row.id);
    const bucket = samples[plan.status];
    if (bucket.length < SAMPLE) {
      bucket.push({
        uid: row.id,
        role: String(data.role ?? ""),
        name: String(data.name ?? ""),
        storedPhone: String(data.phone ?? ""),
        ...plan,
      });
    }
  });
  return { scanned, counts, samples, convertUids };
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function backupGambia9Accounts(): Promise<{ backupId: string; saved: number }> {
  const backupId = `gambia9-${Date.now()}`;
  const accounts: BackupRow[] = [];
  await forEachUser((row) => {
    const data = row.data();
    const phone = String(data.phone ?? "");
    if (!phone) return;
    accounts.push({
      uid: row.id,
      phone,
      name: String(data.name ?? ""),
      role: String(data.role ?? ""),
    });
  });

  const payload = { backupId, saved: accounts.length, createdAt: new Date().toISOString(), accounts };
  downloadJson(`${backupId}.json`, payload);
  window.localStorage.setItem("gambia9_last_backup", JSON.stringify(payload));

  try {
    const meta = doc(db, "gambia9_phone_backups", backupId);
    const chunk = 400;
    for (let i = 0; i < accounts.length; i += chunk) {
      const batch = writeBatch(db);
      if (i === 0) {
        batch.set(meta, { createdAt: new Date().toISOString(), saved: accounts.length });
      }
      for (const row of accounts.slice(i, i + chunk)) {
        batch.set(doc(db, "gambia9_phone_backups", backupId, "accounts", row.uid), row);
      }
      await batch.commit();
    }
  } catch {
    // Browser download + localStorage still keep the backup if Firestore write is blocked.
  }

  return { backupId, saved: accounts.length };
}

export async function applyGambia9Accounts(confirm: string, backupId: string): Promise<{
  updated: number;
  skipped: number;
  failed: number;
  failures: { uid: string; reason: string }[];
}> {
  if (confirm !== "CONVERT") {
    throw new Error("Type CONVERT, then click Confirm conversion.");
  }
  if (!backupId) {
    throw new Error("Create a backup first.");
  }

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const failures: { uid: string; reason: string }[] = [];

  await forEachUser(async (row) => {
    const data = row.data();
    const plan = classifyGambia9(String(data.phone ?? ""));
    if (plan.status !== "convert") {
      skipped += 1;
      return;
    }
    try {
      const taken = await getDoc(doc(db, "phones", plan.newNumber));
      const takenUid = String(taken.data()?.uid ?? "");
      if (takenUid && takenUid !== row.id) {
        failed += 1;
        failures.push({ uid: row.id, reason: `${plan.newNumber} already belongs to another account` });
        return;
      }
      const batch = writeBatch(db);
      batch.set(
        row.ref,
        {
          phone: plan.newNumber,
          phoneMigratedAt: new Date().toISOString(),
          phoneMigratedFrom: plan.oldNumber,
        },
        { merge: true },
      );
      for (const key of phoneStorageKeys(plan.newNumber)) {
        batch.set(doc(db, "phones", key), { uid: row.id, canonical: plan.newNumber });
      }
      await batch.commit();
      updated += 1;
    } catch (err) {
      failed += 1;
      failures.push({ uid: row.id, reason: err instanceof Error ? err.message : String(err) });
    }
  });

  return { updated, skipped, failed, failures: failures.slice(0, 50) };
}

export async function rollbackGambia9Accounts(backupId: string): Promise<{ restored: number; failed: number }> {
  const raw = window.localStorage.getItem("gambia9_last_backup");
  let accounts: BackupRow[] = [];
  if (raw) {
    const parsed = JSON.parse(raw) as { backupId?: string; accounts?: BackupRow[] };
    if (parsed.backupId === backupId && parsed.accounts) accounts = parsed.accounts;
  }
  if (!accounts.length) {
    const snap = await getDocs(collection(db, "gambia9_phone_backups", backupId, "accounts"));
    accounts = snap.docs.map((d) => d.data() as BackupRow);
  }
  if (!accounts.length) {
    throw new Error("Backup not found in this browser. Use the downloaded JSON file if you still have it.");
  }

  let restored = 0;
  let failed = 0;
  for (const row of accounts) {
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, "users", row.uid), { phone: row.phone }, { merge: true });
      for (const key of phoneStorageKeys(row.phone)) {
        batch.set(doc(db, "phones", key), { uid: row.uid, canonical: row.phone });
      }
      await batch.commit();
      restored += 1;
    } catch {
      failed += 1;
    }
  }
  return { restored, failed };
}
