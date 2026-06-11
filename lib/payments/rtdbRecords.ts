/** RTDB paths for payment data — low-latency realtime updates. */
export const RTDB_PAYMENTS = {
  deposits: 'payments/deposits',
  withdrawals: 'payments/withdrawals',
  checkouts: 'payments/checkouts',
  byCustomer: (customerId: string) => `payments/byCustomer/${customerId}`,
  customerDeposits: (customerId: string) => `payments/byCustomer/${customerId}/deposits`,
  customerWithdrawals: (customerId: string) => `payments/byCustomer/${customerId}/withdrawals`,
  deposit: (id: string) => `payments/deposits/${id}`,
  withdrawal: (id: string) => `payments/withdrawals/${id}`,
  checkout: (id: string) => `payments/checkouts/${id}`,
} as const;

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
};

export function depositToRtdb(request: {
  id: string;
  customerId: string;
  customerName?: string;
  amount: number;
  method: string;
  transactionId?: string;
  status: string;
  timestamp: Date | string;
  providerReference?: string;
  verificationStatus?: string;
  verificationSource?: string;
  verificationMessage?: string;
  processedBy?: string;
  processedByName?: string;
  processedAt?: Date | string;
  verifiedAt?: Date | string;
}): RtdbDepositRecord {
  const ts = request.timestamp instanceof Date ? request.timestamp.toISOString() : String(request.timestamp);
  return {
    id: request.id,
    customer_id: request.customerId,
    customer_name: request.customerName || null,
    amount: Number(Number(request.amount).toFixed(2)),
    method: request.method,
    transaction_id: request.transactionId || null,
    status: request.status,
    timestamp: ts,
    provider_reference: request.providerReference || null,
    verification_status: request.verificationStatus || null,
    verification_source: request.verificationSource || null,
    verification_message: request.verificationMessage || null,
    processed_by: request.processedBy || null,
    processed_by_name: request.processedByName || null,
    processed_at: request.processedAt
      ? (request.processedAt instanceof Date ? request.processedAt.toISOString() : String(request.processedAt))
      : null,
    verified_at: request.verifiedAt
      ? (request.verifiedAt instanceof Date ? request.verifiedAt.toISOString() : String(request.verifiedAt))
      : null,
  };
}

export function withdrawalToRtdb(request: {
  id: string;
  customerId: string;
  customerName?: string;
  amount: number;
  status: string;
  code?: string;
  requestedAt: Date | string;
  payoutMethod?: string;
  recipientPhone?: string;
  processedBy?: string;
  processedByName?: string;
  completedAt?: Date | string;
  failedAt?: Date | string;
  failureReason?: string;
}): RtdbWithdrawalRecord {
  const requestedAt = request.requestedAt instanceof Date
    ? request.requestedAt.toISOString()
    : String(request.requestedAt);
  return {
    id: request.id,
    user_id: request.customerId,
    user_name: request.customerName || null,
    amount: Number(Number(request.amount).toFixed(2)),
    status: request.status,
    code: request.code || null,
    requested_at: requestedAt,
    payout_method: request.payoutMethod || null,
    recipient_phone: request.recipientPhone || null,
    external_ref: request.id,
    processed_by: request.processedBy || null,
    processed_by_name: request.processedByName || null,
    completed_at: request.completedAt
      ? (request.completedAt instanceof Date ? request.completedAt.toISOString() : String(request.completedAt))
      : null,
    failed_at: request.failedAt
      ? (request.failedAt instanceof Date ? request.failedAt.toISOString() : String(request.failedAt))
      : null,
    failure_reason: request.failureReason || null,
  };
}
