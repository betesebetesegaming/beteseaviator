/** sessionStorage key set when mobile checkout redirects away from the app. */
export const PENDING_DEPOSIT_SESSION_KEY = "betese_pending_deposit";

export function isModemPayDepositRef(ref: string | null | undefined): boolean {
  return Boolean(ref?.startsWith("BETESE-") && !ref.startsWith("BETESE-WD-"));
}

/** URL ?deposit= takes priority; otherwise recover from sessionStorage after mobile checkout. */
export function readPendingDepositRef(): string | null {
  if (typeof window === "undefined") return null;

  const fromUrl = new URLSearchParams(window.location.search).get("deposit");
  if (isModemPayDepositRef(fromUrl)) return fromUrl;

  try {
    const stored = sessionStorage.getItem(PENDING_DEPOSIT_SESSION_KEY);
    if (isModemPayDepositRef(stored)) {
      sessionStorage.removeItem(PENDING_DEPOSIT_SESSION_KEY);
      return stored;
    }
  } catch {
    /* private mode / blocked storage */
  }

  return null;
}

export function rememberPendingDepositRef(ref: string): void {
  if (!isModemPayDepositRef(ref)) return;
  try {
    sessionStorage.setItem(PENDING_DEPOSIT_SESSION_KEY, ref);
  } catch {
    /* ignore */
  }
}
