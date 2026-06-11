import { apiUrl } from "@/lib/apiUrl";
import type { RtdbDepositRecord } from "./rtdbRecords";

/** Wait this long after checkout before first reconcile attempt. */
export const RECONCILE_AFTER_MS = 20_000;

/** How often to retry reconcile for still-pending deposits. */
export const RECONCILE_INTERVAL_MS = 10_000;

/** Minimum gap between reconcile calls for the same deposit ref. */
export const RECONCILE_THROTTLE_MS = 10_000;

/** Max time to keep reconciling an in-flight checkout from the payment sheet. */
export const RECONCILE_MAX_MS = 10 * 60 * 1000;

export type ReconcileDepositResult = {
  ok?: boolean;
  status?: string;
  checkoutStatus?: string;
  replayed?: boolean;
  error?: string;
};

export function isModemPayDepositRef(id: string, providerReference?: string | null): boolean {
  const ref = String(providerReference || id || "");
  return ref.startsWith("BETESE-") && !ref.startsWith("BETESE-WD-");
}

export function parseDepositTimestamp(record: Pick<RtdbDepositRecord, "timestamp">): number {
  const ms = Date.parse(String(record.timestamp || ""));
  return Number.isFinite(ms) ? ms : 0;
}

export function isTerminalDepositStatus(status: string | undefined | null): boolean {
  const s = String(status || "");
  return s === "Approved" || s === "Rejected";
}

export async function reconcileDepositExternalRef(
  externalRef: string
): Promise<ReconcileDepositResult | null> {
  try {
    const res = await fetch(apiUrl("/modempay-reconcile-deposit"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ externalRef }),
    });
    const data = (await res.json().catch(() => ({}))) as ReconcileDepositResult;
    if (!res.ok) return { error: data.error || res.statusText, ...data };
    return data;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Ask the backend to sync stuck Pending ModemPay deposits with ModemPay. */
export function sweepPendingDeposits(
  deposits: RtdbDepositRecord[],
  customerId: string,
  lastTried: Map<string, number>
): void {
  const now = Date.now();
  for (const req of deposits) {
    if (req.customer_id !== customerId) continue;
    if (String(req.status || "") !== "Pending") continue;

    const externalRef = String(req.provider_reference || req.id || "");
    if (!isModemPayDepositRef(req.id, externalRef)) continue;

    const ageMs = now - parseDepositTimestamp(req);
    if (ageMs < RECONCILE_AFTER_MS) continue;

    const last = lastTried.get(req.id) || 0;
    if (now - last < RECONCILE_THROTTLE_MS) continue;

    lastTried.set(req.id, now);
    void reconcileDepositExternalRef(externalRef).catch(() => {
      /* RTDB subscription delivers the update when reconcile succeeds */
    });
  }
}

/**
 * Poll reconcile for one checkout ref (payment sheet / return URL flows).
 * First attempt after RECONCILE_AFTER_MS, then every RECONCILE_INTERVAL_MS.
 */
export function startDepositReconcilePolling(
  externalRef: string,
  isSettled: () => boolean,
  onStatus?: (status: string) => void
): () => void {
  let stopped = false;
  const started = Date.now();

  const poll = async () => {
    await new Promise((r) => setTimeout(r, RECONCILE_AFTER_MS));
    while (!stopped && !isSettled() && Date.now() - started < RECONCILE_MAX_MS) {
      try {
        const result = await reconcileDepositExternalRef(externalRef);
        const status = String(result?.status || "");
        if (isTerminalDepositStatus(status)) {
          onStatus?.(status);
        }
      } catch {
        /* non-fatal */
      }
      if (isSettled()) break;
      await new Promise((r) => setTimeout(r, RECONCILE_INTERVAL_MS));
    }
  };

  void poll();

  return () => {
    stopped = true;
  };
}
