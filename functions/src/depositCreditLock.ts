/** One Wave / ModemPay charge may be attached to several AVIATOR-* checkout refs. */

export function sanitizeCreditLockId(raw: unknown): string | null {
  const id = String(raw ?? "").trim();
  if (!id) return null;
  return id.replace(/\//g, "_").slice(0, 500);
}

function addLockId(ids: string[], raw: unknown, prefix?: string): void {
  const id = sanitizeCreditLockId(raw);
  if (!id) return;
  const key = prefix ? `${prefix}${id}` : id;
  if (!ids.includes(key)) ids.push(key);
}

/**
 * All Firestore `deposit_credits/{id}` docs that represent the same paid charge.
 * Existing docs stay keyed by AVIATOR-* / BETESE-* ref. Provider ids use `pay:`
 * so a reused Wave link cannot credit a second checkout.
 */
export function depositCreditLockIds(opts: {
  externalRef?: string | null;
  reusedFrom?: string | null;
  providerIds?: Array<string | null | undefined>;
}): string[] {
  const ids: string[] = [];
  addLockId(ids, opts.externalRef);
  addLockId(ids, opts.reusedFrom);
  for (const raw of opts.providerIds ?? []) {
    const id = sanitizeCreditLockId(raw);
    if (!id) continue;
    if (id.startsWith("AVIATOR-") || id.startsWith("BETESE-")) {
      addLockId(ids, id);
      continue;
    }
    addLockId(ids, id, "pay:");
  }
  return ids;
}

export function collectModemPayPaymentIds(
  payload?: Record<string, unknown> | null,
  checkout?: {
    session_id?: string | null;
    payment_intent_id?: string | null;
    provider_transaction_id?: string | null;
    reused_from?: string | null;
    canonical_external_ref?: string | null;
  } | null,
): string[] {
  const metadata = (payload?.metadata as Record<string, unknown> | undefined) || {};
  const candidates = [
    checkout?.provider_transaction_id,
    checkout?.payment_intent_id,
    checkout?.session_id,
    payload?.id,
    payload?.transaction_id,
    payload?.provider_transaction_id,
    payload?.payment_intent_id,
    payload?.payment_intentId,
    payload?.transaction_reference,
    metadata.payment_intent_id,
    metadata.transaction_id,
  ];
  const ids: string[] = [];
  for (const raw of candidates) {
    const id = sanitizeCreditLockId(raw);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}
