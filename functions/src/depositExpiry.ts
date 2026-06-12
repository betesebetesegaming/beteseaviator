import type { Request, Response } from 'express';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { adminDb } from './adminModem';
import {
  patchDepositOnRtdb,
  removeDepositFromRtdb,
  syncCheckoutToRtdb,
} from './paymentsRtdb';

/** Pending deposits must complete within this window or are permanently expired. */
export const DEPOSIT_PENDING_TTL_MS = 30_000;

const EXPIRE_REASON = 'Expired: not completed within 30 seconds';
const BATCH_LIMIT = 200;

export type ExpireDepositResult = 'expired' | 'still_pending' | 'already_terminal' | 'not_found';

type CheckoutDoc = {
  status?: string;
  created_at?: string;
  customer_id?: string | null;
  credit_blocked?: boolean;
};

type DepositReqDoc = {
  status?: string;
  timestamp?: string;
  customer_id?: string;
  credit_blocked?: boolean;
};

export function depositCreatedAt(
  checkout?: CheckoutDoc | null,
  depositReq?: DepositReqDoc | null,
): string {
  return String(checkout?.created_at || depositReq?.timestamp || '');
}

export function depositAgeMs(createdAt: string, now = Date.now()): number {
  const ms = Date.parse(createdAt);
  if (!Number.isFinite(ms)) return Number.POSITIVE_INFINITY;
  return Math.max(0, now - ms);
}

export function isDepositPastTtl(createdAt: string, now = Date.now()): boolean {
  if (!createdAt) return true;
  return depositAgeMs(createdAt, now) > DEPOSIT_PENDING_TTL_MS;
}

export function isDepositCreditEligible(
  checkout?: CheckoutDoc | null,
  depositReq?: DepositReqDoc | null,
  now = Date.now(),
): boolean {
  if (depositReq?.status === 'Rejected' || depositReq?.credit_blocked === true) return false;
  if (checkout?.credit_blocked === true) return false;
  if (checkout?.status === 'failed') return false;
  const createdAt = depositCreatedAt(checkout, depositReq);
  if (isDepositPastTtl(createdAt, now)) return false;
  return true;
}

async function applyDepositExpiry(
  externalRef: string,
  customerId: string | undefined,
  checkout?: CheckoutDoc | null,
): Promise<void> {
  const expiredAt = new Date().toISOString();

  await adminDb.collection('modempay_checkouts').doc(externalRef).set({
    status: 'failed',
    failure_reason: 'expired_30s',
    credit_blocked: true,
    failed_at: expiredAt,
    expired_at: expiredAt,
  }, { merge: true }).catch((err) => logger.warn('expire checkout write failed', { externalRef, err }));

  await adminDb.collection('deposit_requests').doc(externalRef).set({
    status: 'Rejected',
    processed_by: 'DEPOSIT_EXPIRY',
    processed_by_name: 'System',
    processed_at: expiredAt,
    verification_status: 'VerificationFailed',
    verification_source: 'expiry',
    verification_message: EXPIRE_REASON,
    verified_at: expiredAt,
    credit_blocked: true,
    expired_at: expiredAt,
  }, { merge: true }).catch((err) => logger.warn('expire deposit_request write failed', { externalRef, err }));

  await patchDepositOnRtdb(externalRef, customerId, {
    status: 'Rejected',
    processed_by: 'DEPOSIT_EXPIRY',
    processed_by_name: 'System',
    processed_at: expiredAt,
    verification_status: 'VerificationFailed',
    verification_source: 'expiry',
    verification_message: EXPIRE_REASON,
    verified_at: expiredAt,
  }).catch((err) => logger.warn('expire RTDB patch failed', { externalRef, err }));

  await removeDepositFromRtdb(externalRef, customerId).catch((err) =>
    logger.warn('expire RTDB remove failed', { externalRef, err }),
  );

  await syncCheckoutToRtdb({
    external_ref: externalRef,
    status: 'failed',
    failed_at: expiredAt,
    failure_reason: 'expired_30s',
    customer_id: customerId || null,
    created_at: checkout?.created_at,
  }).catch((err) => logger.warn('expire checkout RTDB sync failed', { externalRef, err }));
}

/**
 * Expire a single deposit if it is still Pending and older than 30 seconds.
 */
export async function expireDepositIfStale(externalRef: string): Promise<ExpireDepositResult> {
  if (!externalRef || externalRef.startsWith('BETESE-WD-')) return 'not_found';

  const [checkoutSnap, depositSnap] = await Promise.all([
    adminDb.collection('modempay_checkouts').doc(externalRef).get(),
    adminDb.collection('deposit_requests').doc(externalRef).get(),
  ]);

  if (!checkoutSnap.exists && !depositSnap.exists) return 'not_found';

  const checkout = checkoutSnap.exists ? (checkoutSnap.data() as CheckoutDoc) : null;
  const depositReq = depositSnap.exists ? (depositSnap.data() as DepositReqDoc) : null;

  const checkoutStatus = String(checkout?.status || '').toLowerCase();
  const depositStatus = String(depositReq?.status || '');

  if (
    checkoutStatus === 'completed'
    || checkoutStatus === 'failed'
    || depositStatus === 'Approved'
    || depositStatus === 'Rejected'
    || checkout?.credit_blocked === true
    || depositReq?.credit_blocked === true
  ) {
    return 'already_terminal';
  }

  const createdAt = depositCreatedAt(checkout, depositReq);
  if (!isDepositPastTtl(createdAt)) return 'still_pending';

  const customerId = String(checkout?.customer_id || depositReq?.customer_id || '') || undefined;
  await applyDepositExpiry(externalRef, customerId, checkout);
  logger.info('Expired stale deposit', { externalRef, customerId, createdAt });
  return 'expired';
}

/** Expire all stale pending deposits for one customer (called before new checkout). */
export async function expireCustomerStaleDeposits(customerId: string): Promise<number> {
  if (!customerId) return 0;

  const snap = await adminDb.collection('deposit_requests')
    .where('customer_id', '==', customerId)
    .limit(100)
    .get()
    .catch(() => null);

  if (!snap || snap.empty) return 0;

  let expired = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as DepositReqDoc;
    if (String(data.status || '') !== 'Pending') continue;
    const result = await expireDepositIfStale(doc.id);
    if (result === 'expired') expired += 1;
  }
  return expired;
}

/** Process up to BATCH_LIMIT globally stale pending checkouts. */
export async function expireStaleDepositsBatch(): Promise<number> {
  const cutoff = new Date(Date.now() - DEPOSIT_PENDING_TTL_MS).toISOString();
  const snap = await adminDb.collection('modempay_checkouts')
    .where('status', '==', 'pending')
    .where('created_at', '<', cutoff)
    .orderBy('created_at', 'desc')
    .limit(BATCH_LIMIT)
    .get()
    .catch((err) => {
      logger.warn('expireStaleDepositsBatch query failed', err);
      return null;
    });

  if (!snap || snap.empty) return 0;

  let expired = 0;
  for (const doc of snap.docs) {
    const result = await expireDepositIfStale(doc.id);
    if (result === 'expired') expired += 1;
  }
  logger.info('expireStaleDepositsBatch done', { scanned: snap.size, expired });
  return expired;
}

/** POST /modempay-expire-stale-deposits — flush backlog immediately after deploy. */
export async function expireStaleDepositsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const expired = await expireStaleDepositsBatch();
    res.json({ ok: true, expired });
  } catch (err) {
    logger.error('expireStaleDepositsHandler error', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

/** Scheduled sweep: clears abandoned pending deposits every minute. */
export const expireStaleDeposits = onSchedule('every 1 minutes', async () => {
  await expireStaleDepositsBatch();
});
