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

export function modemPayMethodLabel(method: string): string {
  switch (String(method || '').toLowerCase()) {
    case 'aps':
      return 'APS';
    case 'afrimoney':
      return 'AfriMoney';
    case 'qmoney':
      return 'QMoney';
    case 'wave':
      return 'Wave';
    case 'card':
      return 'Card';
    default:
      return 'Wallet';
  }
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

export type StoredWalletPayLink = {
  checkoutUrl: string;
  sessionId: string | null;
  intentSecret: string | null;
  externalRef: string;
};

export type PersistPayLinkInput = {
  phone: string;
  amount: number;
  method: string;
  checkoutUrl: string;
  sessionId: string | null;
  intentSecret: string | null;
  externalRef: string;
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

export function isModemPayHostedCheckoutUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.toLowerCase().includes('checkout.modempay.com');
  } catch {
    return false;
  }
}

/**
 * Wave/AfriMoney deep links that actually charge — same path as successful GMD 25
 * deposits (pay.wave.com). ModemPay hosted confirm pages are NOT accepted.
 */
export function isWalletDeepPayUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('checkout.modempay.com')) return false;
    return (
      host.includes('pay.wave.com') ||
      host.includes('wave.com') ||
      host.includes('afrimoney') ||
      host.includes('qmoney') ||
      host.includes('aps')
    );
  } catch {
    return false;
  }
}

function extractCheckoutFields(inner: Record<string, unknown>): {
  checkoutUrl: string | null;
  sessionId: string | null;
  paymentLinkId: string | null;
  intentSecret: string | null;
  intentStatus: string | null;
} {
  const candidates = [
    inner.payment_link,
    inner.link,
    inner.checkout_url,
    inner.url,
    inner.payment_url,
  ];

  // Prefer wallet deep links (pay.wave.com). Never prefer ModemPay hosted pages —
  // those stick on "Transaction in Progress" unlike the working GMD 25 flow.
  let checkoutUrl: string | null = null;
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim() && isWalletDeepPayUrl(c)) {
      checkoutUrl = c.trim();
      break;
    }
  }
  if (!checkoutUrl) {
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) {
        checkoutUrl = c.trim();
        break;
      }
    }
  }

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
 * Create a ModemPay checkout.
 *
 * Mobile money uses DIRECT CHARGE only (network + account_number) so ModemPay
 * returns pay.wave.com — identical to successful GMD 25 deposits.
 * We never fall back to checkout.modempay.com hosted confirm pages.
 */
export async function createCheckoutSession(
  input: CreateCheckoutInput,
  opts?: {
    findStoredPayLink?: (
      phone: string,
      amount: number,
      method: string,
      findOpts?: { allowStale?: boolean },
    ) => Promise<StoredWalletPayLink | null>;
    persistPayLink?: (input: PersistPayLinkInput) => Promise<void>;
  },
): Promise<CheckoutSessionResult> {
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

  // Same path as successful GMD 25: direct charge → pay.wave.com.
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

  // Prefer an existing Wave deep link before creating another direct charge.
  // ModemPay rejects a second phone+amount while one is still open.
  // Only reuse fresh links here so expired Wave QR codes don't stick forever.
  if (input.method !== 'card' && opts?.findStoredPayLink) {
    try {
      const stored = await opts.findStoredPayLink(accountNumber, amount, input.method, {
        allowStale: false,
      });
      if (stored?.checkoutUrl && isWalletDeepPayUrl(stored.checkoutUrl)) {
        logger.info('Reusing stored wallet deep-pay link (before create)', {
          amount,
          accountNumber,
          method: input.method,
          externalRef: stored.externalRef,
        });
        return {
          ok: true,
          status: 200,
          checkoutUrl: stored.checkoutUrl,
          sessionId: stored.sessionId,
          paymentLinkId: null,
          intentSecret: stored.intentSecret,
          intentStatus: 'processing',
          raw: { reused_from: stored.externalRef },
          reused: true,
        };
      }
    } catch (err) {
      logger.warn('stored pay-link lookup failed (before create)', { err });
    }
  }

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

  // Wave must use pay.wave.com — hosted ModemPay sticks on "Transaction in Progress".
  // AfriMoney / APS / QMoney often only return checkout.modempay.com; accept that so
  // the charge + webhook can complete (we still persist session_id for credit).
  if (
    input.method === 'wave' &&
    fields.checkoutUrl &&
    isModemPayHostedCheckoutUrl(fields.checkoutUrl)
  ) {
    logger.warn('ModemPay returned hosted checkout for Wave direct charge — rejecting', {
      method: input.method,
      amount,
      sessionId: fields.sessionId,
    });
    fields.checkoutUrl = null;
  }

  const walletUrlOk =
    Boolean(fields.checkoutUrl) &&
    (input.method === 'wave'
      ? isWalletDeepPayUrl(fields.checkoutUrl)
      : isWalletDeepPayUrl(fields.checkoutUrl) || isModemPayHostedCheckoutUrl(fields.checkoutUrl));

  const apiOk =
    ok &&
    envelope.status !== false &&
    (input.method === 'card'
      ? Boolean(fields.checkoutUrl || fields.sessionId)
      : walletUrlOk || Boolean(fields.sessionId && input.method !== 'wave'));

  // Prefer a usable checkout URL; for AfriMoney/APS fall back to hosted session page.
  if (
    apiOk &&
    input.method !== 'card' &&
    input.method !== 'wave' &&
    !fields.checkoutUrl &&
    fields.sessionId
  ) {
    fields.checkoutUrl = `https://checkout.modempay.com/${fields.sessionId}`;
  }

  if (apiOk) {
    // Persist pay link / session immediately so retries and webhooks can credit.
    if (input.method !== 'card' && opts?.persistPayLink && fields.checkoutUrl) {
      try {
        await opts.persistPayLink({
          phone: accountNumber,
          amount,
          method: input.method,
          checkoutUrl: fields.checkoutUrl,
          sessionId: fields.sessionId,
          intentSecret: fields.intentSecret,
          externalRef: input.externalRef,
        });
      } catch (err) {
        logger.warn('persistPayLink failed', { err });
      }
    }
    return {
      ok: true,
      status,
      ...fields,
      raw: data,
      reused: false,
    };
  }

  // Duplicate open direct charge for this phone+amount → reuse OUR stored Wave link
  // even if stale (ModemPay still blocking; hosted retrieve URLs break Wave).
  if (input.method !== 'card' && opts?.findStoredPayLink) {
    try {
      const stored = await opts.findStoredPayLink(accountNumber, amount, input.method, {
        allowStale: true,
      });
      if (stored?.checkoutUrl && isWalletDeepPayUrl(stored.checkoutUrl)) {
        logger.info('Reusing stored wallet deep-pay link (after create fail)', {
          amount,
          accountNumber,
          method: input.method,
          externalRef: stored.externalRef,
        });
        return {
          ok: true,
          status: 200,
          checkoutUrl: stored.checkoutUrl,
          sessionId: stored.sessionId,
          paymentLinkId: null,
          intentSecret: stored.intentSecret,
          intentStatus: 'processing',
          raw: { reused_from: stored.externalRef },
          reused: true,
        };
      }
    } catch (err) {
      logger.warn('stored pay-link lookup failed', { err });
    }
  }

  const upstream = modemPayErrorMessage(data, `${modemPayMethodLabel(input.method)} checkout failed`);
  const blockedDuplicate =
    input.method !== 'card' &&
    (upstream.toLowerCase().includes('validation') || status === 500);

  logger.warn('ModemPay /v1/payments rejected checkout', {
    method: input.method,
    amount,
    accountLen: accountNumber.length,
    status,
    message: upstream,
  });

  const label = modemPayMethodLabel(input.method);
  // ModemPay locks phone+amount across wallet networks — an open Wave GMD 25
  // also blocks APS / AfriMoney for the same amount until it clears.
  return fail(
    blockedDuplicate ? 409 : status || 502,
    blockedDuplicate
      ? `${label} could not start: this number already has an open GMD ${amount} payment (Wave / AfriMoney / APS share the same lock). Approve the open request in that wallet app now, wait ~15 minutes, or try a different amount.`
      : upstream === 'Validation error'
        ? `Could not start ${label} payment. Please try again in a moment.`
        : upstream,
  );
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
