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

/**
 * Client RTDB payment writes are intentionally no-ops.
 *
 * database.rules.json sets payments/* .write = false for clients (Admin SDK /
 * Cloud Functions own those paths). Calling update(ref(db), multipath) still
 * triggers Firebase's "FIREBASE WARNING: update at / failed: permission_denied"
 * even when callers catch the promise — so we skip the write entirely.
 * Server checkout / payout handlers already mirror deposits & withdrawals.
 */
export async function rtdbWriteDeposit(_record: RtdbDepositRecord): Promise<void> {
  return;
}

export async function rtdbPatchDeposit(
  _id: string,
  _customerId: string | undefined,
  _patch: Partial<RtdbDepositRecord>,
): Promise<void> {
  return;
}

export async function rtdbWriteWithdrawal(_record: RtdbWithdrawalRecord): Promise<void> {
  return;
}

export async function rtdbPatchWithdrawal(
  _id: string,
  _userId: string | undefined,
  _patch: Partial<RtdbWithdrawalRecord>,
): Promise<void> {
  return;
}

export async function rtdbWriteCheckout(_record: RtdbCheckoutRecord): Promise<void> {
  return;
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
