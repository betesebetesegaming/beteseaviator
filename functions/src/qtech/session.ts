import * as crypto from "crypto";
import { db, FieldValue } from "../helpers";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type QTechSession = {
  uid: string;
  gameId: string;
  qtechGameId: string;
  createdAt: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
};

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
  if (!sessionId?.trim()) return null;
  const snap = await db.doc(`qtechSessions/${sessionId.trim()}`).get();
  if (!snap.exists) return null;
  const data = snap.data() as QTechSession;
  if (opts.requireActive && data.expiresAt.toMillis() < Date.now()) {
    return null;
  }
  return data;
}
