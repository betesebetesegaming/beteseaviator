/**
 * Aviator ModemPay external refs — kept distinct from Betese PMU (`BETESE-*`).
 * Legacy `BETESE-*` refs are still accepted for older pending deposits.
 */

export const AVIATOR_DEPOSIT_PREFIX = "AVIATOR-";
export const AVIATOR_WITHDRAWAL_PREFIX = "AVIATOR-WD-";
/** Older Aviator deposits used the shared BETESE- prefix before brand split. */
export const LEGACY_DEPOSIT_PREFIX = "BETESE-";
export const LEGACY_WITHDRAWAL_PREFIX = "BETESE-WD-";

export function generateAviatorDepositRef(): string {
  return `${AVIATOR_DEPOSIT_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function generateAviatorWithdrawalRef(): string {
  return `${AVIATOR_WITHDRAWAL_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function isAviatorPaymentRef(ref: string | null | undefined): boolean {
  const v = String(ref || "").trim();
  return (
    v.startsWith(AVIATOR_DEPOSIT_PREFIX) ||
    v.startsWith(AVIATOR_WITHDRAWAL_PREFIX) ||
    v.startsWith(LEGACY_DEPOSIT_PREFIX)
  );
}

export function isAviatorDepositRef(ref: string | null | undefined): boolean {
  const v = String(ref || "").trim();
  if (!v) return false;
  if (v.startsWith(AVIATOR_WITHDRAWAL_PREFIX) || v.startsWith(LEGACY_WITHDRAWAL_PREFIX)) return false;
  return v.startsWith(AVIATOR_DEPOSIT_PREFIX) || v.startsWith(LEGACY_DEPOSIT_PREFIX);
}
