import * as crypto from "crypto";
import { db, FieldValue } from "../helpers";

/** Wallet sessions stay valid long enough for QTech certification re-runs and long play. */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type QTechSession = {
  uid: string;
  gameId: string;
  qtechGameId: string;
  createdAt: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp | Date;
};

/** QTech may echo walletSessionId with or without UUID dashes — normalize before lookup. */
export function normalizeWalletSessionId(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null;
  return raw.trim().replace(/-/g, "").toLowerCase();
}

/** QTech launch truncates playerId to 34 chars — accept either form on wallet callbacks. */
export function qtechPlayerIdsMatch(storedUid: string, requestPlayerId: string): boolean {
  const stored = storedUid.trim();
  const request = requestPlayerId.trim();
  if (!stored || !request) return false;
  if (stored === request) return true;
  return stored.slice(0, 34) === request.slice(0, 34);
}

function sessionExpiresAtMs(data: QTechSession): number {
  const exp = data.expiresAt;
  if (exp && typeof (exp as FirebaseFirestore.Timestamp).toMillis === "function") {
    return (exp as FirebaseFirestore.Timestamp).toMillis();
  }
  return new Date(exp as Date).getTime();
}

export async function createWalletSession(
  uid: string,
  gameId: string,
  qtechGameId: string
): Promise<string> {
  const sessionId = crypto.randomUUID().replace(/-/g, "");
  const now = Date.now();
  await db.doc(`qtechSessions/${sessionId}`).set({
    uid,
    gameId,
    qtechGameId,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: new Date(now + SESSION_TTL_MS),
  });
  return sessionId;
}

export async function resolveWalletSession(
  sessionId: string | undefined,
  opts: { requireActive?: boolean } = {}
): Promise<QTechSession | null> {
  const normalized = normalizeWalletSessionId(sessionId);
  if (!normalized) return null;
  const snap = await db.doc(`qtechSessions/${normalized}`).get();
  if (!snap.exists) return null;
  const data = snap.data() as QTechSession;
  if (opts.requireActive && sessionExpiresAtMs(data) < Date.now()) {
    return null;
  }
  return data;
}

/** Extend active sessions when QTech verifies — keeps long game sessions alive. */
export async function touchWalletSession(sessionId: string): Promise<void> {
  const normalized = normalizeWalletSessionId(sessionId);
  if (!normalized) return;
  await db.doc(`qtechSessions/${normalized}`).update({
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
}
