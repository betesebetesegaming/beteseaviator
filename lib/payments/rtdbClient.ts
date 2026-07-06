import type { Database, Unsubscribe } from 'firebase/database';
import { app as firebaseApp } from "../firebase";
import {
  RTDB_PAYMENTS,
  depositToRtdb,
  withdrawalToRtdb,
  type RtdbCheckoutRecord,
  type RtdbDepositRecord,
  type RtdbWithdrawalRecord,
} from './rtdbRecords';

// ---------- Lazy RTDB loader ----------
// firebase/database is ~50KB gzipped — keeping it out of the initial App
// chunk saves cold-load time on slow networks. The SDK loads on the first
// call into any function below (typically the first subscribeDeposits()
// after login, well after first paint).

type RtdbModule = typeof import('firebase/database');

let cachedLoad: Promise<{ mod: RtdbModule; db: Database }> | null = null;

function loadRtdb(): Promise<{ mod: RtdbModule; db: Database }> {
  if (!cachedLoad) {
    cachedLoad = import('firebase/database').then((mod) => ({
      mod,
      db: mod.getDatabase(firebaseApp),
    }));
  }
  return cachedLoad;
}

function sortByTimestampDesc<T extends { timestamp?: string; requested_at?: string }>(rows: T[]): T[] {
  return rows.sort((a, b) => {
    const aTs = String(a.timestamp || a.requested_at || '');
    const bTs = String(b.timestamp || b.requested_at || '');
    return bTs.localeCompare(aTs);
  });
}

function snapshotToList<T extends { id?: string }>(
  snap: { forEach: (cb: (c: { key: string | null; val: () => unknown }) => void) => void },
): T[] {
  const rows: T[] = [];
  snap.forEach((child) => {
    if (!child.key) return;
    const raw = child.val();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    const record = raw as Record<string, unknown>;
    rows.push({ ...record, id: String(record.id || child.key) } as T);
  });
  return rows;
}

export async function rtdbWriteDeposit(record: RtdbDepositRecord): Promise<void> {
  const { mod, db } = await loadRtdb();
  const updates: Record<string, RtdbDepositRecord> = {
    [RTDB_PAYMENTS.deposit(record.id)]: record,
  };
  if (record.customer_id) {
    updates[`${RTDB_PAYMENTS.customerDeposits(record.customer_id)}/${record.id}`] = record;
  }
  await mod.update(mod.ref(db), updates);
}

export async function rtdbPatchDeposit(id: string, customerId: string | undefined, patch: Partial<RtdbDepositRecord>): Promise<void> {
  // Per-field paths so update() merges instead of replacing the whole node.
  // A slash-containing key in update() is treated as a full-write at that
  // path — passing the patch object whole would wipe amount/customer_id/etc.
  const updates: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    updates[`${RTDB_PAYMENTS.deposit(id)}/${field}`] = value;
    if (customerId) {
      updates[`${RTDB_PAYMENTS.customerDeposits(customerId)}/${id}/${field}`] = value;
    }
  }
  if (Object.keys(updates).length === 0) return;
  const { mod, db } = await loadRtdb();
  await mod.update(mod.ref(db), updates);
}

export async function rtdbWriteWithdrawal(record: RtdbWithdrawalRecord): Promise<void> {
  const { mod, db } = await loadRtdb();
  const updates: Record<string, RtdbWithdrawalRecord> = {
    [RTDB_PAYMENTS.withdrawal(record.id)]: record,
  };
  if (record.user_id) {
    updates[`${RTDB_PAYMENTS.customerWithdrawals(record.user_id)}/${record.id}`] = record;
  }
  await mod.update(mod.ref(db), updates);
}

export async function rtdbPatchWithdrawal(id: string, userId: string | undefined, patch: Partial<RtdbWithdrawalRecord>): Promise<void> {
  // Per-field paths — see rtdbPatchDeposit for the why.
  const updates: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    updates[`${RTDB_PAYMENTS.withdrawal(id)}/${field}`] = value;
    if (userId) {
      updates[`${RTDB_PAYMENTS.customerWithdrawals(userId)}/${id}/${field}`] = value;
    }
  }
  if (Object.keys(updates).length === 0) return;
  const { mod, db } = await loadRtdb();
  await mod.update(mod.ref(db), updates);
}

export async function rtdbWriteCheckout(record: RtdbCheckoutRecord): Promise<void> {
  const { mod, db } = await loadRtdb();
  await mod.set(mod.ref(db, RTDB_PAYMENTS.checkout(record.external_ref)), record);
}

export async function rtdbFetchDeposits(limit = 200): Promise<RtdbDepositRecord[]> {
  const { mod, db } = await loadRtdb();
  const snap = await mod.get(mod.ref(db, RTDB_PAYMENTS.deposits));
  if (!snap.exists()) return [];
  return sortByTimestampDesc(snapshotToList<RtdbDepositRecord>(snap)).slice(0, limit);
}

export async function rtdbFetchWithdrawals(limit = 200): Promise<RtdbWithdrawalRecord[]> {
  const { mod, db } = await loadRtdb();
  const snap = await mod.get(mod.ref(db, RTDB_PAYMENTS.withdrawals));
  if (!snap.exists()) return [];
  return sortByTimestampDesc(snapshotToList<RtdbWithdrawalRecord>(snap)).slice(0, limit);
}

// ---------- Subscription helpers ----------
// These stay synchronous (return Unsubscribe) so existing useEffect cleanup
// patterns in App.tsx and PaymentSheet.tsx don't need to change. The lazy
// SDK load happens in the background; if the caller unsubscribes before the
// SDK finishes loading, we mark `cancelled` so the listener is never attached.

export function subscribeDeposits(
  customerId: string | undefined,
  onRows: (rows: RtdbDepositRecord[]) => void,
): Unsubscribe {
  let realUnsub: Unsubscribe | null = null;
  let cancelled = false;
  void loadRtdb()
    .then(({ mod, db }) => {
      if (cancelled) return;
      const path = customerId
        ? RTDB_PAYMENTS.customerDeposits(customerId)
        : RTDB_PAYMENTS.deposits;
      realUnsub = mod.onValue(
        mod.ref(db, path),
        (snap) => {
          try {
            if (!snap.exists()) {
              onRows([]);
              return;
            }
            onRows(sortByTimestampDesc(snapshotToList<RtdbDepositRecord>(snap)).slice(0, 500));
          } catch (err) {
            console.error("subscribeDeposits snapshot parse failed", err);
            onRows([]);
          }
        },
        (err) => {
          console.error("subscribeDeposits listener failed", err);
          if (!cancelled) onRows([]);
        },
      );
    })
    .catch(() => {
      if (!cancelled) onRows([]);
    });
  return () => {
    cancelled = true;
    if (realUnsub) {
      realUnsub();
      realUnsub = null;
    }
  };
}

export function subscribeWithdrawals(
  userId: string | undefined,
  onRows: (rows: RtdbWithdrawalRecord[]) => void,
): Unsubscribe {
  let realUnsub: Unsubscribe | null = null;
  let cancelled = false;
  void loadRtdb()
    .then(({ mod, db }) => {
      if (cancelled) return;
      const path = userId
        ? RTDB_PAYMENTS.customerWithdrawals(userId)
        : RTDB_PAYMENTS.withdrawals;
      realUnsub = mod.onValue(
        mod.ref(db, path),
        (snap) => {
          try {
            if (!snap.exists()) {
              onRows([]);
              return;
            }
            onRows(sortByTimestampDesc(snapshotToList<RtdbWithdrawalRecord>(snap)).slice(0, 500));
          } catch (err) {
            console.error("subscribeWithdrawals snapshot parse failed", err);
            onRows([]);
          }
        },
        (err) => {
          console.error("subscribeWithdrawals listener failed", err);
          if (!cancelled) onRows([]);
        },
      );
    })
    .catch(() => {
      if (!cancelled) onRows([]);
    });
  return () => {
    cancelled = true;
    if (realUnsub) {
      realUnsub();
      realUnsub = null;
    }
  };
}

export function subscribeDepositById(
  depositId: string,
  onRecord: (record: RtdbDepositRecord | null) => void,
): Unsubscribe {
  let realUnsub: Unsubscribe | null = null;
  let cancelled = false;
  void loadRtdb()
    .then(({ mod, db }) => {
      if (cancelled) return;
      realUnsub = mod.onValue(
        mod.ref(db, RTDB_PAYMENTS.deposit(depositId)),
        (snap) => {
          if (!snap.exists()) {
            onRecord(null);
            return;
          }
          const raw = snap.val();
          if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            onRecord(null);
            return;
          }
          onRecord({ ...(raw as RtdbDepositRecord), id: depositId });
        },
        () => {
          if (!cancelled) onRecord(null);
        },
      );
    })
    .catch(() => {
      if (!cancelled) onRecord(null);
    });
  return () => {
    cancelled = true;
    if (realUnsub) {
      realUnsub();
      realUnsub = null;
    }
  };
}

export { depositToRtdb, withdrawalToRtdb };
