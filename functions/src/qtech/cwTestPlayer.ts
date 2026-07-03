import { createPlayerAccount } from "../agent";
import { db, round2 } from "../helpers";

/** Internal-only player for QTech CW certification — never use real customers. */
export const CW_TEST_PHONE = "9900099";
export const CW_TEST_NAME = "QTech CW Test";

export async function ensureCwTestPlayer(): Promise<{ uid: string; balance: number }> {
  const phoneSnap = await db.doc(`phones/${CW_TEST_PHONE}`).get();
  if (phoneSnap.exists) {
    const uid = String(phoneSnap.data()?.uid ?? "");
    if (!uid) throw new Error("CW test phone record is missing uid.");
    const wallet = await db.doc(`wallets/${uid}`).get();
    const balance = round2(
      Number(wallet.data()?.balance ?? 0) + Number(wallet.data()?.bonusBalance ?? 0)
    );
    return { uid, balance };
  }

  const created = await createPlayerAccount({
    name: CW_TEST_NAME,
    phone: CW_TEST_PHONE,
    password: "CwTest9900099!",
    parentId: null,
    ancestors: [],
    countForAgents: false,
  });
  return { uid: created.uid, balance: 0 };
}
