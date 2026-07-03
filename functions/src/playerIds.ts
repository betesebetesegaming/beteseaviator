import { db } from "./helpers";

/** Office-friendly player reference, e.g. BTE-00123 */
export function formatPlayerId(playerNumber: number): string {
  return `BTE-${String(playerNumber).padStart(5, "0")}`;
}

/** Allocate the next sequential player number inside a Firestore transaction. */
export async function allocatePlayerNumber(
  tx: FirebaseFirestore.Transaction,
): Promise<number> {
  const ref = db.doc("stats/platform");
  const snap = await tx.get(ref);
  const last = Number(snap.data()?.lastPlayerNumber ?? 0);
  const next = last + 1;
  tx.set(ref, { lastPlayerNumber: next }, { merge: true });
  return next;
}

/** Assign player numbers to existing players that do not have one yet. */
export async function backfillMissingPlayerIds(limit = 500): Promise<{ updated: string[] }> {
  const snap = await db.collection("users").where("role", "==", "player").limit(limit).get();
  const updated: string[] = [];

  for (const doc of snap.docs) {
    if (doc.data().playerNumber) continue;
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      if (fresh.data()?.playerNumber) return;
      const playerNumber = await allocatePlayerNumber(tx);
      tx.set(doc.ref, { playerNumber }, { merge: true });
      updated.push(doc.id);
    });
  }

  return { updated };
}
