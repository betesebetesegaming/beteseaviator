/**
 * Betese Marketers — one callable (action-dispatched) + one daily sync, so the
 * staff app adds only two Cloud Run services to the project's CPU quota.
 * SMS sending is intentionally absent: approval never sends.
 */
import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { auth, db } from "../helpers";
import { DomainError } from "./domain";
import { aviatorProvider, footballProvider } from "./providers";
import { recomputeAll } from "./earnings";
import { authorizeCaller, handle, syncAll, type Ctx } from "./service";
import { firestoreStore } from "./store";

function productionCtx(): Ctx {
  return {
    store: firestoreStore(db),
    providers: { aviator: aviatorProvider(db), football: footballProvider },
    now: () => Date.now(),
    timestamp: (ms) => admin.firestore.Timestamp.fromMillis(ms),
    auth: {
      async createUser(args) {
        return (await auth.createUser(args)).uid;
      },
      async deleteUser(uid) {
        await auth.deleteUser(uid);
      },
      async updatePassword(uid, password) {
        await auth.updateUser(uid, { password });
      },
      async setDisabled(uid, disabled) {
        await auth.updateUser(uid, { disabled });
      },
      async revokeSessions(uid) {
        await auth.revokeRefreshTokens(uid);
      },
      async setRole(uid, role) {
        await auth.setCustomUserClaims(uid, { role });
      },
    },
  };
}

export const marketers = onCall({ timeoutSeconds: 300 }, async (req) => {
  const ctx = productionCtx();
  try {
    const caller = await authorizeCaller(ctx.store, req.auth?.uid, Number(req.auth?.token.auth_time) || undefined);
    return await handle(ctx, caller, req.data?.action, req.data?.data);
  } catch (e) {
    if (e instanceof DomainError) throw new HttpsError(e.code, e.message);
    if (e instanceof HttpsError) throw e;
    logger.error("marketers action failed", { action: req.data?.action, error: String(e) });
    throw new HttpsError("internal", "Something went wrong. Try again.");
  }
});

/** Daily read-only Aviator verification + deposit ingest (03:00 Banjul). */
export const marketersDailySync = onSchedule(
  { schedule: "0 3 * * *", timeZone: "Africa/Banjul", timeoutSeconds: 540, memory: "512MiB" },
  async () => {
    const ctx = productionCtx();
    const status = await syncAll(ctx, 420_000);
    const marketers = await recomputeAll(ctx);
    logger.info("marketers sync", { ...status, earningsRecomputed: marketers });
    if (status.errors) logger.error("marketers sync had errors", status);
  },
);
