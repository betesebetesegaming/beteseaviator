import { getDatabase } from 'firebase-admin/database';
import { ensureAdminApp } from './adminModem';

export type RtdbDepositRecord = {
  id: string;
  customer_id: string;
  customer_name?: string | null;
  amount: number;
  method: string;
  transaction_id?: string | null;
  status: string;
  timestamp: string;
  provider_reference?: string | null;
  verification_status?: string | null;
  verification_source?: string | null;
  verification_message?: string | null;
  processed_by?: string | null;
  processed_by_name?: string | null;
  processed_at?: string | null;
  verified_at?: string | null;
};

export type RtdbWithdrawalRecord = {
  id: string;
  user_id: string;
  user_name?: string | null;
  amount: number;
  status: string;
  code?: string | null;
  requested_at: string;
  payout_method?: string | null;
  recipient_phone?: string | null;
  external_ref?: string | null;
  processed_by?: string | null;
  processed_by_name?: string | null;
  completed_at?: string | null;
  failed_at?: string | null;
  failure_reason?: string | null;
};

export type RtdbCheckoutRecord = {
  external_ref: string;
  session_id?: string | null;
  payment_link_id?: string | null;
  intent_secret?: string | null;
  method?: string;
  amount?: number;
  customer_id?: string | null;
  customer_phone?: string | null;
  customer_name?: string | null;
  status: string;
  created_at?: string;
  completed_at?: string | null;
  failed_at?: string | null;
  failure_reason?: string | null;
  provider_transaction_id?: string | null;
};

function rtdbRef() {
  return getDatabase(ensureAdminApp()).ref();
}

/** O(1) lookup: payment_intent_id → BETESE-* external ref */
export async function linkPaymentIntentIndex(paymentIntentId: string, externalRef: string): Promise<void> {
  if (!paymentIntentId || !externalRef) return;
  await rtdbRef().child(`payments/intentIndex/${paymentIntentId}`).set(externalRef);
}

export async function resolveExternalRefByPaymentIntent(paymentIntentId: string): Promise<string | undefined> {
  if (!paymentIntentId) return undefined;
  const snap = await rtdbRef().child(`payments/intentIndex/${paymentIntentId}`).get();
  const value = snap.val();
  return typeof value === 'string' && value.startsWith('BETESE-') ? value : undefined;
}

export async function linkPaymentLinkIndex(paymentLinkId: string, externalRef: string): Promise<void> {
  if (!paymentLinkId || !externalRef) return;
  await rtdbRef().child(`payments/linkIndex/${paymentLinkId}`).set(externalRef);
}

export async function resolveExternalRefByPaymentLink(paymentLinkId: string): Promise<string | undefined> {
  if (!paymentLinkId) return undefined;
  const snap = await rtdbRef().child(`payments/linkIndex/${paymentLinkId}`).get();
  const value = snap.val();
  return typeof value === 'string' && value.startsWith('BETESE-') ? value : undefined;
}

export async function syncDepositToRtdb(record: RtdbDepositRecord): Promise<void> {
  const updates: Record<string, RtdbDepositRecord> = {
    [`payments/deposits/${record.id}`]: record,
  };
  if (record.customer_id) {
    updates[`payments/byCustomer/${record.customer_id}/deposits/${record.id}`] = record;
  }
  await rtdbRef().update(updates);
}

export async function patchDepositOnRtdb(
  id: string,
  customerId: string | undefined,
  patch: Partial<RtdbDepositRecord>,
): Promise<void> {
  // CRITICAL: write each field as its own multi-path entry. RTDB's update()
  // treats a slash-containing key as a full-write at that path, so passing
  // `{ 'payments/deposits/abc': { status: ... } }` would REPLACE the entire
  // record, wiping amount/customer_id/method/timestamp. Per-field keys
  // preserve every other field on the node.
  const updates: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    updates[`payments/deposits/${id}/${field}`] = value;
    if (customerId) {
      updates[`payments/byCustomer/${customerId}/deposits/${id}/${field}`] = value;
    }
  }
  if (Object.keys(updates).length === 0) return;
  await rtdbRef().update(updates);
}

export async function syncWithdrawalToRtdb(record: RtdbWithdrawalRecord): Promise<void> {
  const updates: Record<string, RtdbWithdrawalRecord> = {
    [`payments/withdrawals/${record.id}`]: record,
  };
  if (record.user_id) {
    updates[`payments/byCustomer/${record.user_id}/withdrawals/${record.id}`] = record;
  }
  await rtdbRef().update(updates);
}

export async function patchWithdrawalOnRtdb(
  id: string,
  userId: string | undefined,
  patch: Partial<RtdbWithdrawalRecord>,
): Promise<void> {
  // Per-field paths — see patchDepositOnRtdb for the why.
  const updates: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    updates[`payments/withdrawals/${id}/${field}`] = value;
    if (userId) {
      updates[`payments/byCustomer/${userId}/withdrawals/${id}/${field}`] = value;
    }
  }
  if (Object.keys(updates).length === 0) return;
  await rtdbRef().update(updates);
}

export async function syncCheckoutToRtdb(record: RtdbCheckoutRecord): Promise<void> {
  const updates: Record<string, unknown> = {
    [`payments/checkouts/${record.external_ref}`]: record,
  };
  if (record.session_id) {
    updates[`payments/intentIndex/${record.session_id}`] = record.external_ref;
  }
  if (record.payment_link_id) {
    updates[`payments/linkIndex/${record.payment_link_id}`] = record.external_ref;
  }
  await rtdbRef().update(updates);
}
