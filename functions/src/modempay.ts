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

/** Card rails are USD-priced; ModemPay rejects card intents below ~$1 (~GMD 75). */
export const MODEMPAY_CARD_MIN_GMD = 75;

export type CheckoutSessionResult = {
  ok: boolean;
  status: number;
  checkoutUrl: string | null;
  sessionId: string | null;
  paymentLinkId: string | null;
  intentSecret: string | null;
  intentStatus: string | null;
  raw: unknown;
  reused?: boolean;
};

export function normalizeModemPayAccountNumber(phone: string | undefined | null): string {
  return String(phone || '')
    .replace(/\D/g, '')
    .replace(/^220/, '');
}

/** Pull a human-readable reason out of ModemPay's often-generic error bodies. */
export function modemPayErrorMessage(raw: unknown, fallback = 'ModemPay checkout failed'): string {
  if (!raw || typeof raw !== 'object') return fallback;
  const row = raw as Record<string, unknown>;
  const nested = row.data && typeof row.data === 'object' ? (row.data as Record<string, unknown>) : null;
  const candidates = [row.message, row.error, nested?.message, nested?.error];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return fallback;
}

function phoneMatchesAccount(rowPhone: unknown, accountNumber: string): boolean {
  const digits = String(rowPhone || '').replace(/\D/g, '').replace(/^220/, '');
  return Boolean(digits) && digits === accountNumber;
}

function extractCheckoutFields(inner: Record<string, unknown>): {
  checkoutUrl: string | null;
  sessionId: string | null;
  paymentLinkId: string | null;
  intentSecret: string | null;
  intentStatus: string | null;
} {
  const checkoutUrl =
    (inner.payment_link as string | undefined) ||
    (inner.link as string | undefined) ||
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

  return { checkoutUrl, sessionId, paymentLinkId, intentSecret, intentStatus };
}

/**
 * ModemPay/Wave rejects a second direct charge for the same phone + amount while
 * an earlier intent is still open. List status can still say requires_payment_method
 * after the checkout token expired — always retrieve and skip expired/failed ones.
 */
export async function findOpenDirectChargeIntent(opts: {
  phone: string;
  amount: number;
  method?: ModemPayMethod;
}): Promise<CheckoutSessionResult | null> {
  const accountNumber = normalizeModemPayAccountNumber(opts.phone);
  if (!/^\d{7}$/.test(accountNumber)) return null;
  const amount = Math.round(Number(opts.amount) * 100) / 100;
  const liveStatuses = new Set(['requires_payment_method', 'processing']);

  // Scan recent intents (newest first). 90 covers busy shops without huge latency.
  for (const offset of [0, 30, 60]) {
    const { ok, data } = await modemFetch<{ data?: Record<string, unknown>[] }>({
      method: 'GET',
      path: '/v1/payments',
      query: { offset, limit: 30 },
    });
    if (!ok || !Array.isArray(data?.data)) continue;

    for (const row of data.data) {
      if (Math.abs(Number(row.amount || 0) - amount) > 0.009) continue;

      const rowPhone = row.customer_phone || row.account_number || row.phone;
      if (!phoneMatchesAccount(rowPhone, accountNumber)) continue;

      if (opts.method && opts.method !== 'card') {
        const network = String(row.network || row.payment_method || '').toLowerCase();
        if (network && network !== opts.method && network !== 'wallet') continue;
      }

      const sessionId =
        (typeof row.payment_intent_id === 'string' && row.payment_intent_id) ||
        (typeof row.id === 'string' && row.id) ||
        null;
      if (!sessionId) continue;

      // List can lie about status — retrieve is the source of truth.
      let live: Record<string, unknown> = row;
      try {
        const retrieved = await retrievePaymentIntent(sessionId);
        if (retrieved.ok && retrieved.data && typeof retrieved.data === 'object') {
          live = retrieved.data as Record<string, unknown>;
        }
      } catch {
        /* use list row */
      }

      const liveStatus = String(live.status || '').toLowerCase();
      if (!liveStatuses.has(liveStatus)) {
        logger.info('Skipping non-live ModemPay intent', { sessionId, liveStatus, amount, accountNumber });
        continue;
      }

      const fields = extractCheckoutFields(live);
      if (!fields.checkoutUrl && fields.sessionId) {
        fields.checkoutUrl = `https://checkout.modempay.com/${fields.sessionId}`;
      }
      if (!fields.checkoutUrl && !fields.sessionId) continue;

      logger.info('Reusing live ModemPay intent for same phone+amount', {
        sessionId: fields.sessionId,
        amount,
        accountNumber,
        status: fields.intentStatus,
      });

      return {
        ok: true,
        status: 200,
        ...fields,
        raw: live,
        reused: true,
      };
    }
  }
  return null;
}

async function createHostedWalletCheckout(
  input: CreateCheckoutInput,
  amount: number,
  accountNumber: string,
): Promise<CheckoutSessionResult> {
  const webhookCallback =
    process.env.MODEMPAY_CALLBACK_URL ||
    'https://us-central1-beteseaviator-a05ae.cloudfunctions.net/modempayApi/modempay-webhook';
  const customerName = String(input.customer?.name || '').trim();

  // Hosted wallet checkout does NOT use network+account_number, so it is not
  // blocked by Wave's "one open direct charge per phone+amount" rule.
  const dataPayload: Record<string, unknown> = {
    amount,
    currency: input.currency || 'GMD',
    from_sdk: false,
    payment_methods: ['wallet'],
    return_url: input.successUrl,
    cancel_url: input.cancelUrl || input.successUrl,
    callback_url: webhookCallback,
    skip_url_validation: true,
    title: input.description || 'Wallet top-up',
    description: input.description || 'Wallet top-up',
    customer_phone: accountNumber,
    metadata: {
      source: 'betese-aviator',
      method: input.method,
      external_reference: input.externalRef,
      preferred_network: input.method,
      ...(input.metadata || {}),
    },
  };
  if (customerName) dataPayload.customer_name = customerName;
  if (input.customer?.email) dataPayload.customer_email = input.customer.email;

  const { ok, status, data } = await modemFetch({
    method: 'POST',
    path: '/v1/payments',
    body: { data: dataPayload },
  });

  const envelope = data as { status?: boolean; data?: Record<string, unknown> };
  const inner = envelope.data || (data as Record<string, unknown>);
  const fields = extractCheckoutFields(inner as Record<string, unknown>);
  const apiOk = ok && envelope.status !== false && (!!fields.checkoutUrl || !!fields.sessionId);

  if (!apiOk) {
    logger.warn('Hosted wallet checkout failed', { status, message: modemPayErrorMessage(data) });
  }

  return {
    ok: apiOk,
    status,
    ...fields,
    raw: data,
    reused: false,
  };
}

export async function createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSessionResult> {
  const accountNumber = normalizeModemPayAccountNumber(input.customer?.phone);
  const amount = Math.round(Number(input.amount) * 100) / 100;

  const fail = (status: number, message: string): CheckoutSessionResult => ({
    ok: false,
    status,
    checkoutUrl: null,
    sessionId: null,
    paymentLinkId: null,
    intentSecret: null,
    intentStatus: null,
    raw: { message },
  });

  if (!Number.isFinite(amount) || amount <= 0) {
    return fail(400, 'Amount must be a positive number.');
  }

  if (input.method === 'card' && amount < MODEMPAY_CARD_MIN_GMD) {
    return fail(
      400,
      `Card deposits require at least GMD ${MODEMPAY_CARD_MIN_GMD}. Use Wave or AfriMoney for smaller amounts.`,
    );
  }

  if (input.method !== 'card' && !/^\d{7}$/.test(accountNumber)) {
    return fail(400, 'Enter a valid 7-digit Gambian mobile money number (e.g. 7701234).');
  }

  const webhookCallback =
    process.env.MODEMPAY_CALLBACK_URL ||
    'https://us-central1-beteseaviator-a05ae.cloudfunctions.net/modempayApi/modempay-webhook';

  const customerName = String(input.customer?.name || '').trim();

  const dataPayload: Record<string, unknown> = {
    amount,
    currency: input.currency || 'GMD',
    from_sdk: false,
    return_url: input.successUrl,
    cancel_url: input.cancelUrl || input.successUrl,
    callback_url: webhookCallback,
    skip_url_validation: true,
    title: input.description || 'Wallet top-up',
    description: input.description || 'Wallet top-up',
    metadata: {
      source: 'betese-aviator',
      method: input.method,
      external_reference: input.externalRef,
      ...(input.metadata || {}),
    },
  };

  // Prefer direct Wave/AfriMoney charge (push into wallet app).
  if (input.method !== 'card') {
    dataPayload.network = input.method;
    dataPayload.account_number = accountNumber;
    dataPayload.customer_phone = accountNumber;
  } else {
    dataPayload.payment_methods = ['card'];
    if (accountNumber) dataPayload.customer_phone = accountNumber;
  }

  if (customerName) dataPayload.customer_name = customerName;
  if (input.customer?.email) dataPayload.customer_email = input.customer.email;

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
  const fields = extractCheckoutFields(inner as Record<string, unknown>);
  const apiOk = ok && envelope.status !== false && (!!fields.checkoutUrl || !!fields.sessionId);

  if (apiOk) {
    return {
      ok: true,
      status,
      ...fields,
      raw: data,
      reused: false,
    };
  }

  if (input.method !== 'card') {
    // 1) Reuse only a LIVE open intent (never expired — that caused "Payment intent has expired").
    try {
      const existing = await findOpenDirectChargeIntent({
        phone: accountNumber,
        amount,
        method: input.method,
      });
      if (existing?.ok) return existing;
    } catch (err) {
      logger.warn('reuse-after-validation failed', { err });
    }

    // 2) Fresh hosted wallet checkout — not blocked by direct-charge duplicates.
    try {
      const hosted = await createHostedWalletCheckout(input, amount, accountNumber);
      if (hosted.ok) {
        logger.info('Fell back to hosted wallet checkout after direct-charge failure', {
          amount,
          accountNumber,
          method: input.method,
          directMessage: modemPayErrorMessage(data),
        });
        return hosted;
      }
    } catch (err) {
      logger.warn('hosted wallet fallback failed', { err });
    }
  }

  logger.warn('ModemPay /v1/payments rejected checkout', {
    method: input.method,
    amount,
    accountLen: accountNumber.length,
    status,
    message: modemPayErrorMessage(data),
  });

  return {
    ok: false,
    status,
    ...fields,
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
    narration: input.reason || 'Betese Aviator withdrawal',
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
