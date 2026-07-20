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

  const title = input.description || 'Betese wallet top-up';
  const description = `${title} — ${input.method.toUpperCase()} GMD ${Number(input.amount).toFixed(0)}`;

  // Payment Links use ModemPay's hosted checkout (checkout.modempay.com/pay/…).
  // Direct Wave charges (network + account_number) create Abandoned/Processing
  // intents that never deduct — this account has 0 successful Wave transactions
  // via that path. Hosted links are the working collection flow.
  const { ok, status, data } = await modemFetch({
    method: 'POST',
    path: '/v1/payment-links',
    body: {
      data: {
        title,
        description,
        amount: input.amount,
        currency: input.currency || 'GMD',
        redirect_url: input.successUrl,
        cancel_url: input.cancelUrl || input.successUrl,
        callback_url: webhookCallback,
        collect_customer_phone: true,
        collect_customer_name: true,
        metadata: {
          source: 'betese-aviator',
          method: input.method,
          external_reference: input.externalRef,
          customer_id: input.customer?.id || '',
          customer_phone: accountNumber || input.customer?.phone || '',
          ...(input.metadata || {}),
        },
      },
    },
  });

  const envelope = data as {
    status?: boolean | string;
    message?: string;
    error?: string;
    id?: string;
    payment_link?: string;
    unique_code?: string;
    data?: Record<string, unknown>;
  };

  // Payment-links API returns the link object at the top level (not always wrapped).
  const row = (envelope.data && typeof envelope.data === 'object' ? envelope.data : data) as Record<string, unknown>;
  const checkoutUrl =
    (typeof row.payment_link === 'string' && row.payment_link) ||
    (typeof envelope.payment_link === 'string' && envelope.payment_link) ||
    null;

  const paymentLinkId =
    (typeof row.id === 'string' && row.id) ||
    (typeof envelope.id === 'string' && envelope.id) ||
    null;

  const uniqueCode =
    (typeof row.unique_code === 'string' && row.unique_code) ||
    (typeof envelope.unique_code === 'string' && envelope.unique_code) ||
    null;

  const resolvedUrl =
    checkoutUrl ||
    (uniqueCode ? `https://checkout.modempay.com/pay/${uniqueCode}` : null);

  const apiOk = ok && !!resolvedUrl;

  if (!apiOk) {
    logger.warn('ModemPay payment-link creation failed', { status, data });
  }

  return {
    ok: apiOk,
    status,
    checkoutUrl: resolvedUrl,
    sessionId: null as string | null,
    paymentLinkId,
    intentSecret: null as string | null,
    intentStatus: 'requires_payment_method',
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
