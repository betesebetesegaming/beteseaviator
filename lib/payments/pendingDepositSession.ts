import { isAviatorDepositRef } from "@/lib/payments/aviatorPaymentRefs";

/** Storage keys set when mobile checkout redirects away from the app. */
export const PENDING_DEPOSIT_SESSION_KEY = "betese_pending_deposit";
const PENDING_DEPOSIT_LOCAL_KEY = "betese_pending_deposit_ls";

export function isModemPayDepositRef(ref: string | null | undefined): boolean {
  return isAviatorDepositRef(ref);
}

function readStoredRef(key: string, consume: boolean): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
    if (!isModemPayDepositRef(stored)) return null;
    if (consume) {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    }
    return stored;
  } catch {
    return null;
  }
}

/** URL ?deposit= takes priority; otherwise recover from storage after mobile checkout. */
export function readPendingDepositRef(): string | null {
  if (typeof window === "undefined") return null;

  const fromUrl = new URLSearchParams(window.location.search).get("deposit");
  if (isModemPayDepositRef(fromUrl)) {
    clearPendingDepositRef();
    return fromUrl;
  }

  return readStoredRef(PENDING_DEPOSIT_LOCAL_KEY, true) ?? readStoredRef(PENDING_DEPOSIT_SESSION_KEY, true);
}

export function rememberPendingDepositRef(ref: string): void {
  if (!isModemPayDepositRef(ref)) return;
  try {
    window.localStorage.setItem(PENDING_DEPOSIT_LOCAL_KEY, ref);
    window.sessionStorage.setItem(PENDING_DEPOSIT_SESSION_KEY, ref);
  } catch {
    /* private mode / blocked storage */
  }
}

export function clearPendingDepositRef(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_DEPOSIT_LOCAL_KEY);
    window.sessionStorage.removeItem(PENDING_DEPOSIT_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
