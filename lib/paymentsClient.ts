import { doc, setDoc } from "firebase/firestore";
import { db } from "./firestore";
import { depositToRtdb, withdrawalToRtdb } from "./payments/rtdbRecords";
import { rtdbWriteDeposit, rtdbWriteWithdrawal } from "./payments/rtdbClient";

/** Same shape + Firestore/RTDB writes as betesepmu firebaseClient.dbDepositRequest */
export async function dbDepositRequest(request: {
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
}) {
  const row = depositToRtdb({
    id: request.id,
    customerId: request.customerId,
    customerName: request.customerName,
    amount: request.amount,
    method: request.method,
    transactionId: request.transactionId,
    status: request.status,
    timestamp: request.timestamp,
    providerReference: request.providerReference,
    verificationStatus: request.verificationStatus,
    verificationSource: request.verificationSource,
    verificationMessage: request.verificationMessage,
  });
  await rtdbWriteDeposit(row);
  const ts =
    request.timestamp instanceof Date
      ? request.timestamp.toISOString()
      : String(request.timestamp);
  try {
    await setDoc(doc(db, "deposit_requests", request.id), {
      id: request.id,
      amount: Number(Number(request.amount).toFixed(2)),
      method: request.method,
      transaction_id: request.transactionId,
      customer_id: request.customerId,
      customer_name: request.customerName || null,
      status: request.status,
      timestamp: ts,
      provider_reference: request.providerReference || null,
      verification_status: request.verificationStatus || null,
      verification_source: request.verificationSource || null,
      verification_message: request.verificationMessage || null,
    });
  } catch {
    /* Backend checkout also writes deposit_requests — RTDB is enough for live status. */
  }
}

/** Same as betesepmu firebaseClient.dbCreateWithdrawalRequest */
export async function dbCreateWithdrawalRequest(request: {
  id: string;
  customerId: string;
  customerName?: string;
  amount: number;
  status: string;
  code?: string;
  requestedAt: Date | string;
  payoutMethod?: string;
  recipientPhone?: string;
}) {
  const row = withdrawalToRtdb({
    id: request.id,
    customerId: request.customerId,
    customerName: request.customerName,
    amount: request.amount,
    status: request.status,
    code: request.code,
    requestedAt: request.requestedAt,
    payoutMethod: request.payoutMethod,
    recipientPhone: request.recipientPhone,
  });
  await rtdbWriteWithdrawal(row);
  const requestedAt =
    request.requestedAt instanceof Date
      ? request.requestedAt.toISOString()
      : String(request.requestedAt);
  await setDoc(doc(db, "withdrawal_requests", request.id), {
    id: request.id,
    user_id: request.customerId,
    user_name: request.customerName,
    amount: request.amount,
    status: request.status,
    code: request.code,
    requested_at: requestedAt,
    payout_method: request.payoutMethod || null,
    recipient_phone: request.recipientPhone || null,
    external_ref: request.id,
  });
}
