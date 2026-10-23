/** The live Firestore + Auth context shared by the marketers functions and Aviator sign-up. */
import * as admin from "firebase-admin";
import { auth, db } from "../helpers";
import { aviatorProvider, footballProvider } from "./providers";
import type { Ctx } from "./service";
import { firestoreStore } from "./store";

export function productionCtx(): Ctx {
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
