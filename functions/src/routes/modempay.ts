import * as crypto from 'crypto';
import type { Request, Response } from 'express';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import {
  createCheckoutSession,
  createTransfer,
  createRefund,
  retrieveBalances,
  retrieveTransaction,
  retrievePaymentIntent,
  verifyWebhookSignature,
  isModemPayMethod,
  isModemPayPayoutNetwork,
  type ModemPayMethod,
  type ModemPayPayoutNetwork,
} from '../modempay';
import { adminDb } from '../adminModem';
import { db, bumpDailyStats, bumpPlatformStats, getSettings, MIN_DEPOSIT_GMD, todayIso, walletRead, walletWrite } from '../helpers';
import {
  applyEarlyWithdrawalPenalties,
  parsePlaythroughWallet,
  withdrawalPlaythroughBlockMessage,
} from '../wagering';
import { syncAviatorWalletCredit } from '../walletSync';
import { consumeOtpVerifiedForPhone, requireOtpVerifiedForPhone } from '../otpVerification';
import {
  patchDepositOnRtdb,
  syncCheckoutToRtdb,
  syncDepositToRtdb,
  patchWithdrawalOnRtdb,
  syncWithdrawalToRtdb,
  linkPaymentIntentIndex,
  linkPaymentLinkIndex,
  resolveExternalRefByPaymentIntent,
  resolveExternalRefByPaymentLink,
  type RtdbDepositRecord,
} from '../paymentsRtdb';

function serializeError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message, stack: err.stack };
  return { message: String(err) };
}

/** Credit wallets/{uid} when checkout completed but sync failed (idempotent via flag). */
async function healAviatorWalletIfNeeded(
  externalRef: string,
  payloadAmount = 0,
): Promise<boolean> {
  const checkoutSnap = await adminDb.collection('modempay_checkouts').doc(externalRef).get();
  if (!checkoutSnap.exists) return false;

  const checkout = checkoutSnap.data() as {
    status?: string;
    aviator_wallet_synced?: boolean;
    customer_id?: string | null;
    credited_amount?: number;
    amount?: number;
  };
  if (checkout.status !== 'completed' || checkout.aviator_wallet_synced || !checkout.customer_id) {
    return false;
  }

  const healAmount = Number(checkout.credited_amount || checkout.amount || payloadAmount || 0);
  if (healAmount <= 0) return false;

  try {
    await syncAviatorWalletCredit(String(checkout.customer_id), healAmount, externalRef);
    await adminDb.collection('modempay_checkouts').doc(externalRef).set(
      { aviator_wallet_synced: true },
      { merge: true },
    );
    logger.info('Aviator wallet sync healed after deposit', { externalRef, customerId: checkout.customer_id, healAmount });
    return true;
  } catch (err) {
    logger.warn('Aviator wallet sync heal failed after deposit', {
      externalRef,
      err: serializeError(err),
    });
    return false;
  }
}

const MERCHANT_NAME = process.env.MODEMPAY_MERCHANT_NAME || 'Betese PMU';

interface CheckoutBody {
  provider?: string;
  method?: string;
  amount?: number | string;
  customerId?: string;
  customerPhone?: string;
  customerName?: string;
  customerEmail?: string;
  externalRef?: string;
  returnUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, string>;
}

/**
 * POST /api/modempay-checkout
 *
 * Creates a Modem Pay hosted-checkout session for any of the five supported
 * methods (wave, aps, afrimoney, qmoney, card). Front-end posts amount,
 * customer info, and a unique externalRef; we return the checkoutUrl which the
 * front-end opens in a new tab.
 */
export async function checkoutHandler(req: Request, res: Response): Promise<void> {
  const body = (req.body || {}) as CheckoutBody;

  const provider = String(body.method || body.provider || '').toLowerCase();
  if (!isModemPayMethod(provider)) {
    res.status(400).json({ error: 'method must be one of wave, aps, afrimoney, qmoney, card' });
    return;
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'amount must be a positive number' });
    return;
  }
  if (!body.externalRef) {
    res.status(400).json({ error: 'externalRef is required' });
    return;
  }

  const customerId = body.customerId ? String(body.customerId).trim() : '';
  if (customerId) {
    if (!Number.isFinite(amount) || amount < MIN_DEPOSIT_GMD) {
      res.status(400).json({ error: `Minimum deposit is GMD ${MIN_DEPOSIT_GMD}.` });
      return;
    }
    const walletSnap = await db.doc(`wallets/${customerId}`).get();
    if (walletSnap.exists && Boolean(walletSnap.data()?.frozen)) {
      res.status(403).json({ error: 'Wallet is frozen. Contact customer service.' });
      return;
    }
  }

  try {
    const result = await createCheckoutSession({
      method: provider as ModemPayMethod,
      amount,
      externalRef: body.externalRef,
      description: `${MERCHANT_NAME} wallet top-up`,
      customer: {
        id: body.customerId,
        name: body.customerName,
        email: body.customerEmail,
        phone: body.customerPhone,
      },
      successUrl: body.returnUrl,
      cancelUrl: body.cancelUrl || body.returnUrl,
      metadata: body.metadata,
    });

    if (!result.ok || !result.checkoutUrl) {
      logger.warn('ModemPay checkout creation failed', { status: result.status, raw: result.raw });
      res.status(502).json({
        error: 'ModemPay checkout creation failed',
        upstreamStatus: result.status,
        details: result.raw,
      });
      return;
    }

    // Critical markers MUST land before we respond — Cloud Run may freeze CPU
    // after the HTTP response. Keep this path tight so mobile Safari does not
    // time out with "Load failed" before checkoutUrl arrives.
    const createdAt = new Date().toISOString();
    const methodLabel = mapModemPayMethodLabel(provider);

    const checkoutDoc = {
      external_ref: body.externalRef,
      session_id: result.sessionId,
      payment_link_id: result.paymentLinkId || null,
      intent_secret: result.intentSecret || null,
      method: provider,
      amount,
      customer_id: body.customerId || null,
      customer_phone: body.customerPhone || null,
      customer_name: body.customerName || null,
      status: 'pending',
      created_at: createdAt,
    };

    const criticalWrites: Promise<unknown>[] = [
      adminDb.collection('modempay_checkouts').doc(body.externalRef).set(checkoutDoc, { merge: true }),
    ];

    if (body.customerId && body.externalRef) {
      criticalWrites.push(
        adminDb.collection('deposit_requests').doc(body.externalRef).set({
          id: body.externalRef,
          amount: Number(amount.toFixed(2)),
          method: methodLabel,
          transaction_id: body.customerPhone || null,
          customer_id: body.customerId,
          customer_name: body.customerName || null,
          status: 'Pending',
          timestamp: createdAt,
          provider_reference: body.externalRef,
          verification_status: 'PendingProviderConfirmation',
          verification_source: 'webhook',
          verification_message: 'Waiting for ModemPay to confirm payment before your wallet is credited.',
        }, { merge: true }),
      );
    }

    await Promise.all(criticalWrites);

    // Intent / link indexes are small Firestore writes — keep them on the
    // critical path so webhooks can resolve the deposit without RTDB.
    const indexWrites: Promise<unknown>[] = [];
    if (result.sessionId) {
      indexWrites.push(
        linkPaymentIntentIndex(result.sessionId, body.externalRef)
          .catch(err => logger.warn('intentIndex link failed', { sessionId: result.sessionId, externalRef: body.externalRef, err })),
      );
    } else {
      logger.warn('ModemPay /v1/payments did not return a session id — webhook will rely on hint matching', {
        externalRef: body.externalRef,
        raw: result.raw,
      });
    }
    if (result.paymentLinkId) {
      indexWrites.push(
        linkPaymentLinkIndex(result.paymentLinkId, body.externalRef)
          .catch(err => logger.warn('linkIndex link failed', { paymentLinkId: result.paymentLinkId, externalRef: body.externalRef, err })),
      );
    }
    if (indexWrites.length) {
      await Promise.all(indexWrites);
    }

    // RTDB mirrors — best-effort; do not block the customer on a checkout URL.
    const secondary: Promise<unknown>[] = [
      syncCheckoutToRtdb({
        external_ref: body.externalRef,
        session_id: result.sessionId || null,
        payment_link_id: result.paymentLinkId || null,
        intent_secret: result.intentSecret || null,
        method: provider,
        amount,
        customer_id: body.customerId || null,
        customer_phone: body.customerPhone || null,
        customer_name: body.customerName || null,
        status: 'pending',
        created_at: createdAt,
      }).catch(err => logger.warn('RTDB checkout sync failed', err)),
    ];

    if (body.customerId && body.externalRef) {
      const pendingDeposit: RtdbDepositRecord = {
        id: body.externalRef,
        customer_id: body.customerId,
        customer_name: body.customerName || null,
        amount,
        method: methodLabel,
        transaction_id: body.customerPhone || null,
        status: 'Pending',
        timestamp: createdAt,
        provider_reference: body.externalRef,
        verification_status: 'PendingProviderConfirmation',
        verification_source: 'webhook',
        verification_message: 'Waiting for ModemPay to confirm payment before your wallet is credited.',
      };
      secondary.push(
        syncDepositToRtdb(pendingDeposit).catch(err => logger.warn('RTDB deposit sync failed', err)),
      );
    }

    // Respond immediately so the phone can open Wave; finish RTDB in the
    // same request with a short budget so warm instances still sync reliably.
    res.json({
      ok: true,
      checkoutUrl: result.checkoutUrl,
      sessionId: result.sessionId,
      provider,
      externalRef: body.externalRef,
    });

    await Promise.race([
      Promise.allSettled(secondary),
      new Promise<void>(resolve => setTimeout(resolve, 2500)),
    ]);
  } catch (err) {
    logger.error('Checkout error', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  }
}

/**
 * Convenience wrappers — keep the dedicated /api/wave-payment etc. paths the
 * front-end already uses; they forward to checkoutHandler with the provider
 * pinned. This lets us add per-method validation later without touching the UI.
 */
function makeMethodWrapper(method: ModemPayMethod) {
  return async function methodHandler(req: Request, res: Response): Promise<void> {
    const body = (req.body || {}) as CheckoutBody;
    if (!body.customerPhone || !body.amount || !body.externalRef) {
      res.status(400).json({ error: 'customerPhone, amount and externalRef are required' });
      return;
    }
    req.body = { ...body, method };
    return checkoutHandler(req, res);
  };
}

export const wavePaymentHandler      = makeMethodWrapper('wave');
export const apsPaymentHandler       = makeMethodWrapper('aps');
export const afrimoneyPaymentHandler = makeMethodWrapper('afrimoney');
export const qmoneyPaymentHandler    = makeMethodWrapper('qmoney');
export const cardPaymentHandler      = makeMethodWrapper('card');

/**
 * POST /api/modempay-payout
 *
 * Initiates a Modem Pay mobile-money transfer (Wave / AfriMoney).
 * Deducts the customer wallet immediately, then sends funds via ModemPay.
 * Webhook `transfer.succeeded` marks the request Completed; failures refund the hold.
 */
interface PayoutBody {
  amount?: number | string;
  recipientPhone?: string;
  recipientName?: string;
  method?: string;
  network?: string;
  externalRef?: string;
  customerId?: string;
  withdrawalRequestId?: string;
  withdrawalCode?: string;
  processedById?: string;
  processedByName?: string;
  reason?: string;
  metadata?: Record<string, string>;
}

export async function payoutHandler(req: Request, res: Response): Promise<void> {
  const body = (req.body || {}) as PayoutBody;
  const method = String(body.method || body.network || '').toLowerCase();
  if (!isModemPayPayoutNetwork(method)) {
    res.status(400).json({ error: 'method must be wave or afrimoney for mobile money payout' });
    return;
  }

  const requestId = String(body.withdrawalRequestId || body.externalRef || '').trim();
  if (!requestId) {
    res.status(400).json({ error: 'withdrawalRequestId (or externalRef) is required' });
    return;
  }

  let customerId = String(body.customerId || '').trim();
  let amount = Number(body.amount);
  let recipientPhone = String(body.recipientPhone || '').trim();
  let recipientName = String(body.recipientName || '').trim();
  const withdrawalCode = String(body.withdrawalCode || '').trim();
  let holdCompleted = false;

  try {
    const requestRef = adminDb.collection('withdrawal_requests').doc(requestId);
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) {
      res.status(404).json({ error: 'Withdrawal request not found' });
      return;
    }
    const requestData = requestSnap.data() as {
      user_id?: string;
      user_name?: string;
      amount?: number;
      status?: string;
      code?: string;
      recipient_phone?: string;
    };

    if (requestData.status !== 'Pending') {
      res.status(409).json({ error: `Withdrawal request is already ${requestData.status}` });
      return;
    }

    if (withdrawalCode && requestData.code && withdrawalCode !== requestData.code) {
      res.status(403).json({ error: 'Withdrawal code mismatch' });
      return;
    }

    customerId = customerId || String(requestData.user_id || '');
    if (!Number.isFinite(amount) || amount <= 0) amount = Number(requestData.amount || 0);
    recipientPhone = recipientPhone || String(requestData.recipient_phone || '');
    recipientName = recipientName || String(requestData.user_name || 'Customer');

    if (!customerId) {
      res.status(400).json({ error: 'customerId is required' });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'amount must be a positive number' });
      return;
    }
    if (!recipientPhone) {
      res.status(400).json({ error: 'recipientPhone is required' });
      return;
    }

    try {
      await requireOtpVerifiedForPhone(recipientPhone);
    } catch (err) {
      const msg =
        err instanceof HttpsError
          ? err.message
          : 'SMS verification required before withdrawal.';
      res.status(403).json({ error: msg });
      return;
    }

    const settings = await getSettings();
    if (amount < settings.minWithdrawal) {
      await failWithdrawalWithoutHold(requestId, customerId, `Minimum withdrawal is ${settings.minWithdrawal} GMD.`);
      res.status(400).json({ error: `Minimum withdrawal is ${settings.minWithdrawal} GMD.` });
      return;
    }

    const walletSnap = await db.doc(`wallets/${customerId}`).get();
    if (walletSnap.exists && Boolean(walletSnap.data()?.frozen)) {
      await failWithdrawalWithoutHold(requestId, customerId, 'Wallet is frozen. Contact customer service.');
      res.status(403).json({ error: 'Wallet is frozen. Contact customer service.' });
      return;
    }
    const walletPreview = parsePlaythroughWallet(walletSnap.data(), walletSnap.exists);
    if (walletPreview.balance < amount) {
      await failWithdrawalWithoutHold(requestId, customerId, 'Insufficient balance.');
      res.status(400).json({ error: 'Insufficient balance.' });
      return;
    }

    const playthroughBlock = withdrawalPlaythroughBlockMessage(walletPreview, settings);
    if (playthroughBlock) {
      await failWithdrawalWithoutHold(requestId, customerId, playthroughBlock);
      res.status(400).json({ error: playthroughBlock });
      return;
    }

    const cleanPhone = recipientPhone.replace(/\D/g, '').replace(/^220/, '');
    const processedById = body.processedById || 'MODEMPAY_PAYOUT';
    const processedByName = body.processedByName || 'ModemPay Payout';
    const payoutLabel = method === 'wave' ? 'Wave' : 'AfriMoney';
    let payoutAmount = amount;

    // Hold cash balance on wallets/{uid} — same ledger the app displays and bets use.
    try {
      await db.runTransaction(async (tx) => {
        const freshReq = await tx.get(db.collection('withdrawal_requests').doc(requestId));
        if (!freshReq.exists) throw new Error('Withdrawal request not found');
        const fresh = freshReq.data() as { status?: string };
        if (fresh.status !== 'Pending') {
          throw new Error(`Withdrawal request is already ${fresh.status}`);
        }

        const wallet = await walletRead(tx, customerId);
        if (wallet.frozen) throw new Error('Wallet is frozen.');
        if (wallet.balance < amount) throw new Error('Insufficient balance.');

        const playthroughBlockInTx = withdrawalPlaythroughBlockMessage(wallet, settings);
        if (playthroughBlockInTx) {
          throw new Error(playthroughBlockInTx);
        }

        const early = applyEarlyWithdrawalPenalties(tx, customerId, wallet, amount, settings, requestId);
        payoutAmount = early.payoutAmount;

        walletWrite(tx, wallet, {
          uid: customerId,
          amount: -amount,
          type: 'withdrawal',
          description: `Withdrawal hold (${requestId})`,
          meta: {
            externalRef: requestId,
            source: 'modempay',
            earlyWithdrawal: false,
            fee: 0,
            payoutAmount,
            bonusForfeited: 0,
          },
        });

        bumpPlatformStats(tx, { totalWithdrawals: amount });
        bumpDailyStats(tx, todayIso(), { withdrawals: amount });

        tx.update(db.collection('withdrawal_requests').doc(requestId), {
          status: 'Processing',
          payout_method: payoutLabel,
          payout_network: method,
          recipient_phone: cleanPhone,
          external_ref: requestId,
          processed_by: processedById,
          processed_by_name: processedByName,
          processing_at: new Date().toISOString(),
          payout_amount: payoutAmount,
          early_withdrawal_fee: early.fee,
          bonus_forfeited: early.bonusForfeited,
          playthrough_met: early.playthroughMet,
        });
      });
      holdCompleted = true;
      await consumeOtpVerifiedForPhone(recipientPhone).catch((err) =>
        logger.warn('OTP consume after withdrawal hold failed', err),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('Withdrawal hold failed', { requestId, customerId, amount, err: message });
      await failWithdrawalWithoutHold(requestId, customerId, message || 'Could not hold wallet balance for withdrawal');
      res.status(400).json({ error: message || 'Could not hold wallet balance for withdrawal' });
      return;
    }

    await patchWithdrawalOnRtdb(requestId, customerId, {
      status: 'Processing',
      payout_method: payoutLabel,
      recipient_phone: cleanPhone,
      processed_by: processedById,
      processed_by_name: processedByName,
    }).catch(err => logger.warn('RTDB withdrawal processing sync failed', err));

    const result = await createTransfer({
      amount: payoutAmount,
      recipient: {
        name: recipientName,
        phone: cleanPhone,
        method: method as ModemPayPayoutNetwork,
      },
      reason: body.reason || `${MERCHANT_NAME} withdrawal`,
      externalRef: requestId,
      metadata: {
        customer_id: customerId,
        withdrawal_request_id: requestId,
        ...(body.metadata || {}),
      },
    });

    const transfer = result.data as Record<string, unknown>;
    const transferId = (transfer.id as string | undefined) || null;
    const transferStatus = String(transfer.status || '').toLowerCase();

    if (!result.ok) {
      const upstreamMessage = result.errorMessage || 'ModemPay transfer rejected';
      await refundWithdrawalHold(requestId, customerId, amount, upstreamMessage);
      res.status(502).json({
        error: upstreamMessage,
        upstreamStatus: result.status,
        details: result.data,
        hint: /balance/i.test(upstreamMessage)
          ? 'The ModemPay payout wallet has insufficient funds. Top up payout balance in your ModemPay dashboard before sending withdrawals.'
          : undefined,
      });
      return;
    }

    await requestRef.set({
      provider_transfer_id: transferId,
      provider_status: transferStatus || 'processing',
      updated_at: new Date().toISOString(),
    }, { merge: true });

    if (transferStatus === 'completed') {
      await markWithdrawalSettled(requestId, transfer);
    }

    res.json({
      ok: true,
      transferId,
      status: transferStatus || 'processing',
      withdrawalRequestId: requestId,
    });
  } catch (err) {
    logger.error('Payout error', err);
    if (holdCompleted) {
      await refundWithdrawalHold(requestId, customerId, amount, err instanceof Error ? err.message : String(err));
    }
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * POST /api/modempay-refund
 */
interface RefundBody {
  transactionId?: string;
  amount?: number | string;
  reason?: string;
}

export async function refundHandler(req: Request, res: Response): Promise<void> {
  const body = (req.body || {}) as RefundBody;
  if (!body.transactionId) {
    res.status(400).json({ error: 'transactionId is required' });
    return;
  }
  const amount = body.amount !== undefined ? Number(body.amount) : undefined;
  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) {
    res.status(400).json({ error: 'amount must be a positive number' });
    return;
  }
  try {
    const result = await createRefund({ transactionId: body.transactionId, amount, reason: body.reason });
    if (!result.ok) {
      res.status(result.status || 502).json({ error: 'Refund failed', details: result.data });
      return;
    }
    res.json({ ok: true, refund: result.data });
  } catch (err) {
    logger.error('Refund error', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * GET /api/modempay-balances
 */
export async function balancesHandler(_req: Request, res: Response): Promise<void> {
  try {
    const result = await retrieveBalances();
    if (!result.ok) {
      res.status(result.status || 502).json({ error: 'Could not fetch balances', details: result.data });
      return;
    }
    res.json({ ok: true, balances: result.data });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * GET /api/modempay-transactions/:id
 */
export async function transactionHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id || String(req.query.id || '').trim();
  if (!id) {
    res.status(400).json({ error: 'transaction id is required' });
    return;
  }
  try {
    const result = await retrieveTransaction(id);
    if (!result.ok) {
      res.status(result.status || 502).json({ error: 'Could not fetch transaction', details: result.data });
      return;
    }
    res.json({ ok: true, transaction: result.data });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

// -----------------------------------------------------------------------------
// Webhook (POST /api/modempay-webhook)
// -----------------------------------------------------------------------------

interface ModemPayEvent {
  event: string;
  payload: Record<string, unknown>;
}

/**
 * Modem Pay POSTs JSON events here. We:
 *   1. Verify the x-modem-signature header (HMAC-SHA512 over the raw body).
 *   2. Log the raw event to Firestore (modempay_events) for audit.
 *   3. Update business state for the headline events:
 *        charge.succeeded   -> credit customer wallet, mark deposit completed
 *        charge.cancelled / expired -> mark deposit failed
 *        transfer.succeeded -> finalise withdrawal
 *        transfer.failed / reversed / cancelled -> refund withdrawal hold
 *   4. Respond 200 fast so Modem Pay does not retry.
 */
export async function webhookHandler(req: Request, res: Response): Promise<void> {
  const signature = String(req.headers['x-modem-signature'] || '');
  // express raw middleware places the original Buffer on req.body; falls back
  // to JSON-stringified body if the route runs without raw parsing.
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString('utf-8')
    : typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body || {});

  if (!signature) {
    res.status(400).json({ message: 'Signature missing' });
    return;
  }
  if (!verifyWebhookSignature(rawBody, signature)) {
    res.status(400).json({ message: 'Invalid signature' });
    return;
  }

  let event: ModemPayEvent;
  try {
    event = JSON.parse(rawBody) as ModemPayEvent;
  } catch (err) {
    res.status(400).json({ message: 'Invalid event data', error: err instanceof Error ? err.message : String(err) });
    return;
  }

  // IMPORTANT: process BEFORE responding 200. Cloud Functions Gen 2 runs on
  // Cloud Run and may freeze the container as soon as the response is sent,
  // which silently kills any awaited work that runs after `res.send()`. This
  // is why the dashboard previously showed Success while wallets never got
  // credited. ModemPay's timeout is generous; finishing under ~10s is safe.
  try {
    await processModemPayEvent(event);
  } catch (err) {
    logger.error('modempay webhook processing failed', { event: event.event, err });
  }

  res.status(200).json({ ok: true });
}

async function processModemPayEvent(event: ModemPayEvent): Promise<void> {
  const eventType = String(event?.event || '');
  const payload = normalizeModemPayPayload((event?.payload || {}) as Record<string, unknown>);

  // 1. Persist raw event for audit — DEDUPED by logical event identity so
  //    ModemPay webhook RETRIES don't each create a new doc (that bloated
  //    modempay_events to thousands of rows). `expiresAt` drives a Firestore
  //    TTL policy so events auto-expire instead of growing forever.
  const resourceId = String(
    payload.id || payload.payment_intent_id || payload.transaction_reference || payload.payment_link_id || '',
  ).replace(/[^A-Za-z0-9_.-]/g, '_');
  const eventKey = resourceId
    ? `${eventType}__${resourceId}`.slice(0, 400)
    : crypto.createHash('sha256').update(JSON.stringify({ eventType, payload })).digest('hex');
  await adminDb.collection('modempay_events').doc(eventKey).set({
    event_type: eventType,
    payload,
    received_at: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  }, { merge: true }).catch(err => logger.warn('Failed to log modempay event', err));

  // 2. Link payment_intent.created → BETESE ref BEFORE charge.succeeded arrives.
  if (eventType === 'payment_intent.created') {
    await handlePaymentIntentCreated(payload);
    return;
  }

  const depositRef = await resolveDepositExternalRef(payload);
  const transferRef = extractTransferExternalRef(payload) || depositRef;

  switch (eventType) {
    case 'charge.succeeded':
    case 'payment_intent.successful':
    case 'payment_intent.succeeded':
    case 'payment.succeeded': {
      const ref = depositRef || await resolveDepositExternalRef(payload, true);
      if (!ref) {
        logger.error(`${eventType} could not resolve deposit externalRef`, {
          payment_intent_id: payload.payment_intent_id,
          transaction_reference: payload.transaction_reference,
          metadata: payload.metadata,
        });
        return;
      }
      await markDepositCompleted(ref, payload);
      return;
    }

    case 'charge.cancelled':
    case 'charge.expired':
    case 'charge.failed':
    case 'payment_intent.cancelled':
    case 'payment_intent.expired':
    case 'payment_intent.failed':
    case 'payment.failed': {
      const ref = depositRef || await resolveDepositExternalRef(payload, true);
      if (ref) await markDepositFailed(ref, eventType, payload);
      else logger.warn(`${eventType} could not resolve deposit externalRef`, payload);
      return;
    }

    case 'transfer.succeeded': {
      if (transferRef) await markWithdrawalSettled(transferRef, payload);
      else logger.warn('transfer.succeeded missing withdrawal ref', payload);
      return;
    }

    case 'transfer.failed':
    case 'transfer.reversed':
    case 'transfer.cancelled':
    case 'transfer.flagged': {
      if (transferRef) await markWithdrawalFailed(transferRef, eventType, payload);
      else logger.warn(`${eventType} missing withdrawal ref`, payload);
      return;
    }

    case 'charge.created':
    case 'charge.updated': {
      // Link provider charge id → checkout for later lookups.
      const ref = depositRef || await resolveDepositExternalRef(payload, true);
      if (ref && payload.id) {
        await adminDb.collection('modempay_checkouts').doc(ref).set({
          provider_transaction_id: payload.id,
          payment_intent_id: payload.payment_intent_id || null,
        }, { merge: true }).catch(() => null);
      }
      return;
    }

    case 'customer.created':
    case 'customer.updated':
    case 'customer.deleted':
      return;

    default:
      logger.info('Unhandled modempay event', { eventType });
  }
}

/** Flatten nested ModemPay payloads (some events wrap fields under `data`). */
function normalizeModemPayPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const nested = raw.data as Record<string, unknown> | undefined;
  if (nested && typeof nested === 'object') {
    return { ...nested, ...raw, metadata: raw.metadata || nested.metadata };
  }
  return raw;
}

/** When payment_intent.created fires, link intent id → our BETESE-* checkout id. */
async function handlePaymentIntentCreated(payload: Record<string, unknown>): Promise<void> {
  const intentId = String(payload.id || payload.payment_intent_id || '').trim();
  let externalRef = extractExternalRef(payload);

  if (!intentId) {
    logger.warn('payment_intent.created missing intent id', payload);
    return;
  }

  // 1. RTDB intentIndex: written at checkout creation when ModemPay returned
  //    the intent id. This is the fast path — it covers the common case where
  //    /v1/payments echoed the same id back to us.
  if (!externalRef) {
    externalRef = await resolveExternalRefByPaymentIntent(intentId);
  }

  // 2. Firestore: maybe a previous webhook already linked the intent.
  if (!externalRef) {
    const bySession = await adminDb.collection('modempay_checkouts')
      .where('session_id', '==', intentId)
      .limit(1)
      .get()
      .catch(() => null);
    if (bySession && !bySession.empty) externalRef = bySession.docs[0].id;
  }

  // 3. Amount + phone hint match against pending checkouts (last resort).
  if (!externalRef) {
    externalRef = await findPendingCheckoutByHints(payload);
  }
  if (!externalRef) {
    logger.warn('payment_intent.created missing externalRef', { intentId, metadata: payload.metadata });
    return;
  }

  await adminDb.collection('modempay_checkouts').doc(externalRef).set({
    session_id: intentId,
    payment_intent_id: intentId,
    external_ref: externalRef,
    status: 'pending',
    linked_at: new Date().toISOString(),
  }, { merge: true });

  await linkPaymentIntentIndex(intentId, externalRef);

  const checkoutSnap = await adminDb.collection('modempay_checkouts').doc(externalRef).get();
  const checkout = checkoutSnap.data() as Record<string, unknown> | undefined;

  await syncCheckoutToRtdb({
    external_ref: externalRef,
    session_id: intentId,
    payment_link_id: (checkout?.payment_link_id as string) || null,
    method: (checkout?.method as string) || undefined,
    amount: Number(checkout?.amount || payload.amount || 0) || undefined,
    customer_id: (checkout?.customer_id as string) || null,
    customer_phone: (checkout?.customer_phone as string) || null,
    customer_name: (checkout?.customer_name as string) || null,
    status: 'pending',
    created_at: (checkout?.created_at as string) || new Date().toISOString(),
  }).catch(err => logger.warn('RTDB payment_intent.created sync failed', err));

  logger.info('Linked payment_intent to checkout', { intentId, externalRef });
}

/** Match a pending checkout when metadata.external_reference is missing from ModemPay. */
async function findPendingCheckoutByHints(payload: Record<string, unknown>): Promise<string | undefined> {
  const amount = Number(payload.amount || 0);
  const phone = String(payload.customer_phone || payload.account_number || '').replace(/\D/g, '').replace(/^220/, '');
  const intentId = String(payload.payment_intent_id || payload.payment_intentId || payload.id || '').trim();
  const payloadCustomerId = String(
    payload.customer_id
    || (payload.metadata as Record<string, unknown> | undefined)?.customer_id
    || '',
  ).trim();
  const pending = await adminDb.collection('modempay_checkouts')
    .where('status', '==', 'pending')
    .orderBy('created_at', 'desc')
    .limit(25)
    .get()
    .catch(() => null);

  if (!pending || pending.empty) return undefined;

  // A player may legitimately pay from a DIFFERENT Wave/mobile number than the
  // one stored on their account, so the phone is a TIEBREAKER — never a hard
  // requirement — otherwise their deposit gets stuck and is never credited.
  const matches: Array<{ id: string; phoneMatch: boolean }> = [];
  for (const doc of pending.docs) {
    const data = doc.data() as {
      amount?: number;
      customer_phone?: string;
      customer_id?: string | null;
      session_id?: string;
      payment_intent_id?: string;
      created_at?: string;
    };
    if (payloadCustomerId && data.customer_id && data.customer_id !== payloadCustomerId) continue;
    // Skip only if THIS checkout was already linked to a DIFFERENT intent id —
    // we set session_id at creation to the same id ModemPay returns, so a
    // matching session_id is a positive signal, not a reason to skip.
    if (intentId && data.session_id && data.session_id !== intentId && data.payment_intent_id && data.payment_intent_id !== intentId) continue;
    const amountMatch = !amount || Math.abs(Number(data.amount || 0) - amount) < 0.01;
    if (!amountMatch) continue;
    const docPhone = String(data.customer_phone || '').replace(/\D/g, '').replace(/^220/, '');
    const phoneMatch = Boolean(phone && docPhone && (docPhone.endsWith(phone) || phone.endsWith(docPhone)));
    matches.push({ id: doc.id, phoneMatch });
  }
  if (matches.length === 0) return undefined;
  // 1. Same paying number → highest confidence.
  const byPhone = matches.find((m) => m.phoneMatch);
  if (byPhone) return byPhone.id;
  // 2. Paid from a different number but unambiguous: either the payload told us
  //    the customer (so we're scoped to them) or there is a single amount match.
  //    The credit always goes to the customer_id stored on the matched checkout,
  //    so this can never credit a different user than the one who created it.
  if (payloadCustomerId || matches.length === 1) return matches[0].id;
  // 3. Several same-amount deposits from an unknown payer → don't guess.
  logger.warn('findPendingCheckoutByHints: ambiguous amount match with mismatched phone', {
    amount,
    candidates: matches.length,
  });
  return undefined;
}

async function markDepositCompleted(externalRef: string, payload: Record<string, unknown>) {
  const payloadAmount = Number(payload.amount ?? payload.paid_amount ?? payload.total_amount ?? 0);
  let customerId: string | undefined;
  const completedAt = new Date().toISOString();
  const providerTxnId = payload.id || payload.transaction_id || null;
  const txnReference = payload.transaction_reference || null;
  let aviatorCredit = 0;
  let aviatorUid = '';

  // Heal deposits where Firestore was marked completed but wallets/{uid} never credited
  // (syncAviatorWalletCredit used to fail on Firestore read-after-write violations).
  if (await healAviatorWalletIfNeeded(externalRef, payloadAmount)) {
    return;
  }

  const preCheckoutSnap = await adminDb.collection('modempay_checkouts').doc(externalRef).get();
  if (preCheckoutSnap.exists && preCheckoutSnap.data()?.status === 'completed') {
    return;
  }

  await adminDb.runTransaction(async (tx) => {
    // -----------------------------------------------------------------
    // ALL READS FIRST. Firestore transactions require every read to
    // happen before any write — interleaving them throws "Firestore
    // transactions require all reads to be executed before all writes"
    // which rolls back the deposit_request update and the wallet credit
    // even though the RTDB patch (outside the transaction) succeeds.
    // -----------------------------------------------------------------
    const checkoutRef = adminDb.collection('modempay_checkouts').doc(externalRef);
    const depositReqRef = adminDb.collection('deposit_requests').doc(externalRef);
    const [checkoutSnap, depositReqSnap] = await Promise.all([
      tx.get(checkoutRef),
      tx.get(depositReqRef),
    ]);

    const checkout = checkoutSnap.exists
      ? checkoutSnap.data() as {
          status?: string;
          amount?: number;
          customer_id?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          method?: string;
        }
      : null;

    const depositReq = depositReqSnap.exists
      ? depositReqSnap.data() as {
          status?: string;
          amount?: number;
          customer_id?: string;
          customer_name?: string;
          method?: string;
        }
      : null;

    if (!checkout && !depositReq) {
      logger.warn('markDepositCompleted: no checkout or deposit_request', { externalRef });
      return;
    }

    if (checkout?.status === 'completed') return;
    if (depositReq?.status === 'Approved') return;
    if (depositReq?.status === 'Rejected') return;

    const creditAmount = Number(
      (payloadAmount > 0 ? payloadAmount : checkout?.amount ?? depositReq?.amount) || 0,
    );
    if (creditAmount <= 0) {
      logger.warn('markDepositCompleted: no credit amount', { externalRef, payload });
      return;
    }

    customerId = String(checkout?.customer_id || depositReq?.customer_id || '') || undefined;

    // Read the user (if we know who) — still in the read-only phase.
    const userRef = customerId ? adminDb.collection('users').doc(customerId) : null;
    const userSnap = userRef ? await tx.get(userRef) : null;
    const userData = userSnap?.exists ? userSnap.data() as {
      wallet_balance?: number;
      total_deposited_amount?: number;
      first_deposit_at?: string | null;
    } : null;

    const methodLabel = mapModemPayMethodLabel(
      checkout?.method || depositReq?.method || payload.payment_method,
    );

    // -----------------------------------------------------------------
    // WRITES ONLY FROM HERE.
    // -----------------------------------------------------------------
    if (checkoutSnap.exists) {
      tx.update(checkoutRef, {
        status: 'completed',
        credited_amount: creditAmount,
        provider_transaction_id: providerTxnId,
        transaction_reference: txnReference,
        payment_intent_id: payload.payment_intent_id || null,
        completed_at: completedAt,
        raw_payload: payload,
      });
    }

    if (depositReqSnap.exists) {
      tx.update(depositReqRef, {
        status: 'Approved',
        processed_by: 'MODEMPAY_WEBHOOK',
        processed_by_name: 'ModemPay',
        processed_at: completedAt,
        verification_status: 'Verified',
        verification_source: 'webhook',
        verification_message: 'Payment confirmed by ModemPay.',
        verified_at: completedAt,
      });
    } else {
      // Webhook fired before the front-end ever wrote the deposit_request
      // doc (or the write got lost). Create it now so dashboards/back-office
      // see the approved deposit and the front-end subscription wakes up.
      tx.set(depositReqRef, {
        id: externalRef,
        amount: creditAmount,
        method: methodLabel,
        transaction_id: providerTxnId,
        customer_id: customerId || null,
        customer_name: checkout?.customer_name || null,
        status: 'Approved',
        timestamp: completedAt,
        provider_reference: externalRef,
        processed_by: 'MODEMPAY_WEBHOOK',
        processed_by_name: 'ModemPay',
        processed_at: completedAt,
        verification_status: 'Verified',
        verification_source: 'webhook',
        verification_message: 'Payment confirmed by ModemPay.',
        verified_at: completedAt,
      });
    }

    const depositLogRef = adminDb.collection('deposit_logs').doc(externalRef);
    tx.set(depositLogRef, {
      id: externalRef,
      external_ref: externalRef,
      customer_id: customerId || null,
      customer_name: checkout?.customer_name || depositReq?.customer_name || null,
      customer_phone: checkout?.customer_phone || null,
      amount: creditAmount,
      method: methodLabel,
      status: 'completed',
      provider_transaction_id: providerTxnId,
      timestamp: completedAt,
      processed_by_id: 'MODEMPAY_WEBHOOK',
      processed_by_name: 'ModemPay',
      transaction_id: providerTxnId,
    }, { merge: true });

    if (customerId && creditAmount > 0) {
      aviatorCredit = creditAmount;
      aviatorUid = customerId;
    }

    if (userRef && userData) {
      const currentWallet = Number(userData.wallet_balance || 0);
      const currentDeposited = Number(userData.total_deposited_amount || 0);
      tx.update(userRef, {
        wallet_balance: Number((currentWallet + creditAmount).toFixed(2)),
        total_deposited_amount: Number((currentDeposited + creditAmount).toFixed(2)),
        ...(userData.first_deposit_at ? {} : { first_deposit_at: completedAt }),
      });
    } else if (customerId) {
      logger.warn('markDepositCompleted: users doc missing — crediting aviator wallet only', { externalRef, customerId });
    }
  });

  if (aviatorUid && aviatorCredit > 0) {
    try {
      await syncAviatorWalletCredit(aviatorUid, aviatorCredit, externalRef);
      await adminDb.collection('modempay_checkouts').doc(externalRef).set(
        { aviator_wallet_synced: true },
        { merge: true },
      );
    } catch (err) {
      logger.warn('Aviator wallet sync failed after deposit', { externalRef, err: serializeError(err) });
    }
  }

  // Healing pass: re-read the (now-Approved) deposit_request from Firestore
  // and write the FULL record to RTDB. This both (a) keeps RTDB in sync going
  // forward and (b) repairs any deposit whose RTDB node was previously wiped
  // by the legacy patch-overwrites-node bug. Idempotent.
  try {
    const freshSnap = await adminDb.collection('deposit_requests').doc(externalRef).get();
    if (freshSnap.exists) {
      const fresh = freshSnap.data() as Record<string, unknown>;
      await syncDepositToRtdb({
        id: externalRef,
        customer_id: String(fresh.customer_id || customerId || ''),
        customer_name: (fresh.customer_name as string) || null,
        amount: Number(fresh.amount || 0),
        method: String(fresh.method || 'Wave'),
        transaction_id: (fresh.transaction_id as string) || null,
        status: String(fresh.status || 'Approved'),
        timestamp: String(fresh.timestamp || completedAt),
        provider_reference: (fresh.provider_reference as string) || externalRef,
        processed_by: (fresh.processed_by as string) || 'MODEMPAY_WEBHOOK',
        processed_by_name: (fresh.processed_by_name as string) || 'ModemPay',
        processed_at: (fresh.processed_at as string) || completedAt,
        verification_status: (fresh.verification_status as string) || 'Verified',
        verification_source: (fresh.verification_source as string) || 'webhook',
        verification_message: (fresh.verification_message as string) || 'Payment confirmed by ModemPay.',
        verified_at: (fresh.verified_at as string) || completedAt,
      });
    } else {
      // Fallback to a patch if for some reason the doc isn't there.
      await patchDepositOnRtdb(externalRef, customerId, {
        status: 'Approved',
        processed_by: 'MODEMPAY_WEBHOOK',
        processed_by_name: 'ModemPay',
        processed_at: completedAt,
        verification_status: 'Verified',
        verification_source: 'webhook',
        verification_message: 'Payment confirmed by ModemPay.',
        verified_at: completedAt,
      });
    }
  } catch (err) {
    logger.warn('RTDB deposit approve sync failed', err);
  }

  await syncCheckoutToRtdb({
    external_ref: externalRef,
    status: 'completed',
    completed_at: completedAt,
    customer_id: customerId || null,
  }).catch(err => logger.warn('RTDB checkout complete sync failed', err));
}

/** Re-process stored modempay_events for a deposit that webhooks missed linking. */
async function replayStoredEventsForDeposit(externalRef: string): Promise<void> {
  const snap = await adminDb.collection('modempay_events')
    .orderBy('received_at', 'desc')
    .limit(200)
    .get()
    .catch(() => null);
  if (!snap) return;

  const relevantTypes = new Set([
    'payment_intent.created',
    'charge.succeeded',
    'charge.failed',
    'charge.cancelled',
    'charge.expired',
  ]);

  for (const doc of snap.docs) {
    const row = doc.data() as { event_type?: string; payload?: Record<string, unknown> };
    if (!relevantTypes.has(String(row.event_type || ''))) continue;
    const payload = normalizeModemPayPayload(row.payload || {});
    const resolved = await resolveDepositExternalRef(payload, true);
    if (resolved !== externalRef) continue;
    await processModemPayEvent({ event: String(row.event_type), payload: row.payload || {} });
  }
}

function isBeteseExternalRef(value: unknown): value is string {
  return typeof value === 'string' && value.trim().startsWith('BETESE-');
}

function extractExternalRef(payload: Record<string, unknown>): string | undefined {
  const metadata = payload.metadata as Record<string, unknown> | undefined;
  const paymentMeta = payload.payment_metadata as Record<string, unknown> | undefined;
  const nested = payload.data as Record<string, unknown> | undefined;
  const nestedMeta = nested?.metadata as Record<string, unknown> | undefined;
  const candidates = [
    metadata?.external_reference,
    metadata?.externalReference,
    metadata?.external_ref,
    paymentMeta?.external_reference,
    payload.external_reference,
    payload.externalReference,
    nested?.external_reference,
    nestedMeta?.external_reference,
    payload.reference,
  ];
  for (const value of candidates) {
    if (isBeteseExternalRef(value)) return value.trim();
  }
  return undefined;
}

function extractTransferExternalRef(payload: Record<string, unknown>): string | undefined {
  const direct = extractExternalRef(payload);
  if (direct) return direct;
  const metadata = payload.metadata as Record<string, unknown> | undefined;
  const withdrawalId = metadata?.withdrawal_request_id;
  if (isBeteseExternalRef(withdrawalId)) return withdrawalId.trim();
  return undefined;
}

/** Map ModemPay webhook payloads back to our BETESE-* deposit / checkout id. */
async function resolveDepositExternalRef(
  payload: Record<string, unknown>,
  forceLookup = false,
): Promise<string | undefined> {
  const direct = extractExternalRef(payload);
  if (direct && !forceLookup) return direct;
  if (direct) return direct;

  const intentId = String(
    payload.payment_intent_id || payload.payment_intentId || payload.id || '',
  ).trim();

  if (intentId) {
    const fromRtdb = await resolveExternalRefByPaymentIntent(intentId);
    if (fromRtdb) return fromRtdb;

    const bySession = await adminDb.collection('modempay_checkouts')
      .where('session_id', '==', intentId)
      .limit(1)
      .get();
    if (!bySession.empty) return bySession.docs[0].id;

    const byIntentField = await adminDb.collection('modempay_checkouts')
      .where('payment_intent_id', '==', intentId)
      .limit(1)
      .get();
    if (!byIntentField.empty) return byIntentField.docs[0].id;
  }

  const linkId = String(payload.payment_link_id || '').trim();
  if (linkId) {
    const fromLink = await resolveExternalRefByPaymentLink(linkId);
    if (fromLink) return fromLink;
  }

  const providerTxnId = String(payload.id || payload.transaction_id || '').trim();
  if (providerTxnId && providerTxnId !== intentId) {
    const byProvider = await adminDb.collection('modempay_checkouts')
      .where('provider_transaction_id', '==', providerTxnId)
      .limit(1)
      .get();
    if (!byProvider.empty) return byProvider.docs[0].id;
  }

  const txnRef = String(payload.transaction_reference || '').trim();
  if (txnRef) {
    const byTxnRef = await adminDb.collection('modempay_checkouts')
      .where('transaction_reference', '==', txnRef)
      .limit(1)
      .get();
    if (!byTxnRef.empty) return byTxnRef.docs[0].id;
  }

  if (forceLookup) {
    return findPendingCheckoutByHints(payload);
  }

  return undefined;
}

function mapModemPayMethodLabel(method: unknown): string {
  const value = String(method || '').toLowerCase();
  switch (value) {
    case 'wave': return 'Wave';
    case 'aps': return 'APS';
    case 'afrimoney': return 'AfriMoney';
    case 'qmoney': return 'QMoney';
    case 'card': return 'Card';
    default: return value || 'unknown';
  }
}

async function markDepositFailed(externalRef: string, reason: string, payload: Record<string, unknown>) {
  const failedAt = new Date().toISOString();
  const checkoutRef = adminDb.collection('modempay_checkouts').doc(externalRef);
  await checkoutRef.set({
    status: 'failed',
    failure_reason: reason,
    raw_payload: payload,
    failed_at: failedAt,
  }, { merge: true }).catch(err => logger.warn('Failed to mark deposit failed', err));

  const depositSnap = await adminDb.collection('deposit_requests').doc(externalRef).get();
  const customerId = depositSnap.exists
    ? String((depositSnap.data() as { customer_id?: string }).customer_id || '')
    : undefined;

  await adminDb.collection('deposit_requests').doc(externalRef).set({
    status: 'Rejected',
    processed_by: 'MODEMPAY_WEBHOOK',
    processed_by_name: 'ModemPay',
    processed_at: failedAt,
    verification_status: 'VerificationFailed',
    verification_source: 'webhook',
    verification_message: reason,
    verified_at: failedAt,
  }, { merge: true }).catch(err => logger.warn('Failed to mark deposit request failed', err));

  await patchDepositOnRtdb(externalRef, customerId, {
    status: 'Rejected',
    processed_by: 'MODEMPAY_WEBHOOK',
    processed_by_name: 'ModemPay',
    processed_at: failedAt,
    verification_status: 'VerificationFailed',
    verification_source: 'webhook',
    verification_message: reason,
    verified_at: failedAt,
  }).catch(err => logger.warn('RTDB deposit reject sync failed', err));

  await syncCheckoutToRtdb({
    external_ref: externalRef,
    status: 'failed',
    failed_at: failedAt,
    failure_reason: reason,
    customer_id: customerId || null,
  }).catch(err => logger.warn('RTDB checkout fail sync failed', err));
}

async function markWithdrawalSettled(externalRef: string, payload: Record<string, unknown>) {
  const completedAt = new Date().toISOString();
  const ref = adminDb.collection('withdrawal_requests').doc(externalRef);
  const snap = await ref.get();
  const userId = snap.exists ? String((snap.data() as { user_id?: string }).user_id || '') : undefined;
  await ref.set({
    status: 'Completed',
    provider_transfer_id: payload.id || null,
    provider_status: payload.status || 'completed',
    completed_at: completedAt,
    raw_payload: payload,
  }, { merge: true }).catch(err => logger.warn('Failed to settle withdrawal', err));

  // Heal RTDB by writing the FULL withdrawal record from the now-updated
  // Firestore doc. Repairs old withdrawals whose RTDB node was wiped by the
  // legacy patch-overwrites-node bug, and keeps RTDB in sync going forward.
  try {
    const freshSnap = await ref.get();
    if (freshSnap.exists) {
      const fresh = freshSnap.data() as Record<string, unknown>;
      await syncWithdrawalToRtdb({
        id: externalRef,
        user_id: String(fresh.user_id || userId || ''),
        user_name: (fresh.user_name as string) || null,
        amount: Number(fresh.amount || 0),
        status: String(fresh.status || 'Completed'),
        code: (fresh.code as string) || null,
        requested_at: String(fresh.requested_at || completedAt),
        payout_method: (fresh.payout_method as string) || null,
        recipient_phone: (fresh.recipient_phone as string) || null,
        external_ref: externalRef,
        processed_by: (fresh.processed_by as string) || null,
        processed_by_name: (fresh.processed_by_name as string) || null,
        completed_at: completedAt,
      });
    } else {
      await patchWithdrawalOnRtdb(externalRef, userId, {
        status: 'Completed',
        completed_at: completedAt,
      });
    }
  } catch (err) {
    logger.warn('RTDB withdrawal complete sync failed', err);
  }
}

async function failWithdrawalWithoutHold(requestId: string, customerId: string, reason: string) {
  const failedAt = new Date().toISOString();
  await adminDb.collection('withdrawal_requests').doc(requestId).set({
    status: 'Failed',
    failure_reason: reason,
    failed_at: failedAt,
  }, { merge: true }).catch(err => logger.warn('Failed to mark withdrawal failed (no hold)', { requestId, err }));

  if (customerId) {
    await patchWithdrawalOnRtdb(requestId, customerId, {
      status: 'Failed',
      failure_reason: reason,
      failed_at: failedAt,
    }).catch(err => logger.warn('RTDB withdrawal fail sync failed', err));
  }
}

async function refundWithdrawalHold(requestId: string, customerId: string, amount: number, reason: string) {
  const failedAt = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    const reqSnap = await tx.get(db.collection('withdrawal_requests').doc(requestId));
    if (!reqSnap.exists) return;
    const status = String((reqSnap.data() as { status?: string }).status || '');
    if (status === 'Failed' || status === 'Canceled') return;

    const wallet = await walletRead(tx, customerId);
    walletWrite(tx, wallet, {
      uid: customerId,
      amount,
      type: 'refund',
      description: `Withdrawal refund: ${reason}`,
      meta: { externalRef: requestId, source: 'modempay' },
      ignoreFrozen: true,
    });

    if (status === 'Processing') {
      bumpPlatformStats(tx, { totalWithdrawals: -amount });
      bumpDailyStats(tx, todayIso(), { withdrawals: -amount });
    }

    tx.update(db.collection('withdrawal_requests').doc(requestId), {
      status: 'Failed',
      failure_reason: reason,
      failed_at: failedAt,
    });
  }).catch(err => logger.warn('Failed to refund withdrawal hold', { requestId, err }));

  await patchWithdrawalOnRtdb(requestId, customerId, {
    status: 'Failed',
    failure_reason: reason,
    failed_at: failedAt,
  }).catch(err => logger.warn('RTDB withdrawal fail sync failed', err));
}

async function markWithdrawalFailed(externalRef: string, reason: string, payload: Record<string, unknown>) {
  const ref = adminDb.collection('withdrawal_requests').doc(externalRef);
  const snap = await ref.get();
  if (!snap.exists) {
    logger.warn('Withdrawal request not found for failure', { externalRef });
    return;
  }
  const data = snap.data() as { user_id?: string; amount?: number; status?: string };
  if (data.status === 'Failed' || data.status === 'Canceled') return;

  const customerId = String(data.user_id || '');
  const amount = Number(data.amount || 0);
  if (customerId && amount > 0 && data.status === 'Processing') {
    await refundWithdrawalHold(externalRef, customerId, amount, reason);
    return;
  }

  await ref.set({
    status: 'Failed',
    failure_reason: reason,
    failed_at: new Date().toISOString(),
    raw_payload: payload,
  }, { merge: true }).catch(err => logger.warn('Failed to mark withdrawal failed', err));

  const userId = String(data.user_id || '');
  await patchWithdrawalOnRtdb(externalRef, userId, {
    status: 'Failed',
    failure_reason: reason,
    failed_at: new Date().toISOString(),
  }).catch(err => logger.warn('RTDB withdrawal fail sync failed', err));
}

/**
 * POST /api/modempay-reconcile-deposit
 * Sync a stuck Pending deposit_request from its modempay_checkouts marker.
 */
export async function reconcileDepositHandler(req: Request, res: Response): Promise<void> {
  const externalRef = String(req.body?.externalRef || req.query?.externalRef || '').trim();
  if (!externalRef) {
    res.status(400).json({ error: 'externalRef is required' });
    return;
  }

  try {
    const checkoutSnap = await adminDb.collection('modempay_checkouts').doc(externalRef).get();
    if (!checkoutSnap.exists) {
      // No checkout marker — its write may have been lost. Do NOT hard-404: the
      // client polls this endpoint and a 404 makes it retry forever. Try to
      // recover the deposit from any stored webhook events, then report the
      // resulting status with 200 so the client can stop or react.
      await replayStoredEventsForDeposit(externalRef).catch((err) =>
        logger.warn('reconcile replay (missing checkout) failed', { externalRef, err }),
      );
      const recovered = await adminDb.collection('deposit_requests').doc(externalRef).get();
      const status = recovered.exists ? String(recovered.data()?.status || 'Pending') : 'Unknown';
      res.json({ ok: true, status, checkoutStatus: 'missing' });
      return;
    }

    const checkout = checkoutSnap.data() as {
      status?: string;
      failure_reason?: string;
      raw_payload?: Record<string, unknown>;
      session_id?: string | null;
      payment_link_id?: string | null;
      amount?: number;
      credited_amount?: number;
      method?: string;
    };
    const depositSnap = await adminDb.collection('deposit_requests').doc(externalRef).get();
    const depositStatus = String(depositSnap.data()?.status || 'Pending');

    let checkoutStatus = String(checkout.status || 'pending').toLowerCase();
    let providerPayload = checkout.raw_payload || {};

    // If webhook hasn't updated Firestore yet, ask ModemPay directly.
    const intentId = checkout.session_id
      || (checkout as { payment_intent_id?: string }).payment_intent_id
      || checkout.payment_link_id
      || null;
    if (checkoutStatus === 'pending' && intentId) {
      const intentResult = await retrievePaymentIntent(intentId);
      if (!intentResult.ok) {
        logger.warn('reconcile retrievePaymentIntent failed', {
          externalRef,
          intentId,
          status: intentResult.status,
          data: intentResult.data,
        });
      }
      const envelope = intentResult.data as { data?: Record<string, unknown> };
      const intent = envelope?.data || (intentResult.data as Record<string, unknown>);
      const intentStatus = String(
        intent.status || intent.payment_status || (intent.data as Record<string, unknown> | undefined)?.status || '',
      ).toLowerCase();
      providerPayload = intent;

      if (['completed', 'succeeded', 'successful', 'paid', 'complete', 'processing'].includes(intentStatus)) {
        // "processing" means Wave accepted — wait for webhook, but also try credit if already paid fields exist
        if (intentStatus === 'processing' && !intent.paid_date && !intent.transaction_reference) {
          checkoutStatus = 'pending';
        } else {
          checkoutStatus = 'completed';
          await adminDb.collection('modempay_checkouts').doc(externalRef).set({
            status: 'completed',
            provider_status: intentStatus,
            raw_payload: intent,
            updated_at: new Date().toISOString(),
          }, { merge: true });
        }
      } else if (['failed', 'cancelled', 'canceled', 'expired'].includes(intentStatus)) {
        checkoutStatus = 'failed';
        await adminDb.collection('modempay_checkouts').doc(externalRef).set({
          status: 'failed',
          failure_reason: intentStatus,
          raw_payload: intent,
          failed_at: new Date().toISOString(),
        }, { merge: true });
      } else {
        logger.info('reconcile intent still open', { externalRef, intentId, intentStatus });
      }
    }

    if (checkoutStatus === 'completed') {
      if (!depositSnap.exists || depositStatus === 'Pending') {
        await markDepositCompleted(externalRef, providerPayload);
      } else {
        await healAviatorWalletIfNeeded(
          externalRef,
          Number(checkout.credited_amount || checkout.amount || providerPayload.amount || 0),
        );
      }
      res.json({ ok: true, status: 'Approved' });
      return;
    }

    if (checkoutStatus === 'failed') {
      if (!depositSnap.exists || depositStatus === 'Pending') {
        await markDepositFailed(externalRef, checkout.failure_reason || 'failed', providerPayload);
      }
      res.json({ ok: true, status: 'Rejected' });
      return;
    }

    // Last resort: replay stored webhook events for this deposit ref.
    if (depositStatus === 'Pending') {
      await replayStoredEventsForDeposit(externalRef);
      const refreshedDeposit = await adminDb.collection('deposit_requests').doc(externalRef).get();
      const newStatus = String(refreshedDeposit.data()?.status || depositStatus);
      if (newStatus !== depositStatus) {
        res.json({ ok: true, status: newStatus, replayed: true });
        return;
      }
    }

    res.json({ ok: true, status: depositStatus, checkoutStatus });
  } catch (err) {
    logger.error('Reconcile deposit error', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
