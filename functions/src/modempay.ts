import { createHmac, timingSafeEqual } from 'node:crypto';
import { logger } from 'firebase-functions';

/**
 * Thin Modem Pay REST client. We deliberately avoid the official `modem-pay`
 * SDK so the function bundle stays small and we can run on Cloud Functions
 * without surprises from third-party dependencies.
 *
 * All requests are signed with the secret key (`MODEMPAY_SECRET_KEY`); the
 * public key (`MODEMPAY_PUBLIC_KEY`) is forwarded as `X-Public-Key` for the
 * endpoints that require it.
 */

export type ModemPayMethod = 'wave' | 'aps' | 'afrimoney' | 'qmoney' | 'card';

export const MODEMPAY_METHODS: ReadonlyArray<ModemPayMethod> = [
  'wave', 'aps', 'afrimoney', 'qmoney', 'card',
];

export function isModemPayMethod(v: unknown): v is ModemPayMethod {
  return typeof v === 'string' && (MODEMPAY_METHODS as ReadonlyArray<string>).includes(v.toLowerCase());
}

function baseUrl(): string {
  return process.env.MODEMPAY_BASE_URL || 'https://api.modempay.com';
}

function secretKey(): string {
  const k = process.env.MODEMPAY_SECRET_KEY;
  if (!k) throw new Error('MODEMPAY_SECRET_KEY is not configured');
  return k;
}

function publicKey(): string {
  return process.env.MODEMPAY_PUBLIC_KEY || '';
}

interface ModemFetchOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

export async function modemFetch<T = unknown>(opts: ModemFetchOptions): Promise<{ ok: boolean; status: number; data: T }> {
  const url = new URL(`${baseUrl().replace(/\/+$/, '')}${opts.path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: opts.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secretKey()}`,
        'X-Public-Key': publicKey(),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      // Fail before mobile browsers abandon the parent checkout request.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new Error('ModemPay request timed out. Please try again.');
    }
    throw err;
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data: data as T };
}

// -----------------------------------------------------------------------------
// Checkout sessions
// -----------------------------------------------------------------------------

export interface CreateCheckoutInput {
  method: ModemPayMethod;
  amount: number;
  currency?: string;
  externalRef: string;
  description?: string;
  customer?: {
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, string>;
}

export async function createCheckoutSession(input: CreateCheckoutInput) {
  const accountNumber = String(input.customer?.phone || '')
    .replace(/\D/g, '')
    .replace(/^220/, '');

  const webhookCallback =
    process.env.MODEMPAY_CALLBACK_URL ||
    'https://us-central1-beteseaviator-a05ae.cloudfunctions.net/modempayApi/modempay-webhook';

  const dataPayload: Record<string, unknown> = {
    amount: input.amount,
    currency: input.currency || 'GMD',
    from_sdk: false,
    return_url: input.successUrl,
    cancel_url: input.cancelUrl || input.successUrl,
    callback_url: webhookCallback,
    title: input.description || 'Wallet top-up',
    description: input.description,
    metadata: {
      source: 'betese-aviator',
      method: input.method,
      external_reference: input.externalRef,
      ...(input.metadata || {}),
    },
  };

  // Mobile money = ModemPay "direct charge": network + 7-digit account_number.
  // Create returns status "processing" and a Wave (or wallet) pay link. Do NOT
  // swap that for checkout.modempay.com — hosted checkout leaves direct intents
  // Abandoned/Expired without ever charging Wave.
  if (input.method !== 'card') {
    dataPayload.network = input.method;
    if (accountNumber) dataPayload.account_number = accountNumber;
  } else {
    dataPayload.payment_methods = ['card'];
  }

  if (input.customer?.name) dataPayload.customer_name = input.customer.name;
  if (input.customer?.email) dataPayload.customer_email = input.customer.email;
  if (input.customer?.phone) dataPayload.customer_phone = input.customer.phone;

  const { ok, status, data } = await modemFetch({
    method: 'POST',
    path: '/v1/payments',
    body: { data: dataPayload },
  });

  const envelope = data as {
    status?: boolean;
    message?: string;
    data?: Record<string, unknown>;
  };
  const inner = envelope.data || (data as Record<string, unknown>);
  const checkoutUrl =
    (inner.payment_link as string | undefined) ||
    (inner.checkout_url as string | undefined) ||
    (inner.url as string | undefined) ||
    (inner.payment_url as string | undefined) ||
    null;

  const sessionId =
    (inner.payment_intent_id as string | undefined) ||
    (inner.id as string | undefined) ||
    null;

  const intentSecret = (inner.intent_secret as string | undefined) || null;
  const intentStatus = typeof inner.status === 'string' ? inner.status : null;

  const paymentLinkId =
    (inner.payment_link_id as string | undefined) ||
    (checkoutUrl?.match(/checkout\.modempay\.com\/([a-f0-9-]+)/i)?.[1] ??
      checkoutUrl?.match(/pay\.wave\.com\/c\/([a-z0-9-]+)/i)?.[1] ??
      null);

  // Direct Wave charges are valid even while still "processing" — customer must
  // approve in the Wave app. checkoutUrl is the Wave pay link for that.
  const apiOk = ok && envelope.status !== false && (!!checkoutUrl || !!sessionId);

  return {
    ok: apiOk,
    status,
    checkoutUrl,
    sessionId,
    paymentLinkId,
    intentSecret,
    intentStatus,
    raw: data,
  };
}

// -----------------------------------------------------------------------------
// Transfers / payouts (used to settle vendor withdrawals)
// -----------------------------------------------------------------------------

export interface CreateTransferInput {
  amount: number;
  currency?: string;
  recipient: {
    name?: string;
    phone: string;
    method: ModemPayPayoutNetwork;
  };
  reason?: string;
  externalRef: string;
  metadata?: Record<string, string>;
}

export type ModemPayPayoutNetwork = 'wave' | 'afrimoney';

export const MODEMPAY_PAYOUT_NETWORKS: ReadonlyArray<ModemPayPayoutNetwork> = [
  'wave', 'afrimoney',
];

export function isModemPayPayoutNetwork(v: unknown): v is ModemPayPayoutNetwork {
  return typeof v === 'string' && (MODEMPAY_PAYOUT_NETWORKS as ReadonlyArray<string>).includes(v.toLowerCase());
}

export async function createTransfer(input: CreateTransferInput) {
  const network = input.recipient.method.toLowerCase();
  if (!isModemPayPayoutNetwork(network)) {
    throw new Error(`Payout network must be one of: ${MODEMPAY_PAYOUT_NETWORKS.join(', ')}`);
  }

  const accountNumber = String(input.recipient.phone || '')
    .replace(/\D/g, '')
    .replace(/^220/, '');

  const payload = {
    amount: input.amount,
    currency: input.currency || 'GMD',
    network,
    account_number: accountNumber,
    beneficiary_name: input.recipient.name || 'Customer',
    narration: input.reason || 'Betese PMU withdrawal',
    metadata: {
      source: 'betese-aviator',
      external_reference: input.externalRef,
      ...(input.metadata || {}),
    },
  };

  const url = `${baseUrl().replace(/\/+$/, '')}/v1/transfers`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secretKey()}`,
      'Idempotency-Key': input.externalRef,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  const envelope = data as { data?: Record<string, unknown>; status?: boolean; message?: string; error?: string };
  const inner = envelope.data || (data as Record<string, unknown>);
  const errorMessage =
    envelope.message ||
    envelope.error ||
    (typeof inner.message === 'string' ? inner.message : undefined) ||
    (typeof inner.error === 'string' ? inner.error : undefined);

  return {
    ok: res.ok && envelope.status !== false,
    status: res.status,
    data: inner,
    errorMessage,
    raw: data,
  };
}

// -----------------------------------------------------------------------------
// Refunds
// -----------------------------------------------------------------------------

export interface CreateRefundInput {
  transactionId: string;
  amount?: number;
  reason?: string;
}

export async function createRefund(input: CreateRefundInput) {
  return modemFetch({
    method: 'POST',
    path: `/v1/transactions/${encodeURIComponent(input.transactionId)}/refund`,
    body: { amount: input.amount, reason: input.reason },
  });
}

// -----------------------------------------------------------------------------
// Balances + transactions
// -----------------------------------------------------------------------------

export function retrieveBalances() {
  return modemFetch({ method: 'GET', path: '/v1/balances' });
}

export function retrieveTransaction(id: string) {
  return modemFetch({ method: 'GET', path: `/v1/transactions/${encodeURIComponent(id)}` });
}

/** Fetch a payment intent status from ModemPay (used to reconcile stuck Pending deposits). */
export function retrievePaymentIntent(id: string) {
  return modemFetch({ method: 'GET', path: `/v1/payments/${encodeURIComponent(id)}` });
}

// -----------------------------------------------------------------------------
// Webhook signature verification (HMAC-SHA512 over raw body)
// -----------------------------------------------------------------------------

export function verifyWebhookSignature(rawBody: string, providedSignature: string): boolean {
  const secret = process.env.MODEMPAY_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('MODEMPAY_WEBHOOK_SECRET is not configured — rejecting webhook');
    return false;
  }
  if (!providedSignature || typeof providedSignature !== 'string') return false;

  const computed = createHmac('sha512', secret).update(rawBody).digest('hex');
  if (computed.length !== providedSignature.length) return false;

  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(providedSignature));
  } catch {
    return false;
  }
}
