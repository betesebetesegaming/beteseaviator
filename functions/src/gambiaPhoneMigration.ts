import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import {
  auth,
  db,
  FieldValue,
  normalizePhone,
  phoneToEmail,
  requireRole,
  writePhoneIndex,
  type ProfileData,
} from "./helpers";
import { GAMBIA_COUNTRY_CODE, GAMBIA_LEGACY_LOCAL_LENGTH } from "./phone";
import { FieldPath } from "firebase-admin/firestore";

const PAGE = 200;
const STATE_DOC = "settings/gambiaPhoneMigration";

function migrateCareDigits(value: string): string {
  const canonical = normalizePhone(value);
  if (canonical) return `${GAMBIA_COUNTRY_CODE}${canonical}`;
  return value;
}

export async function migrateGambiaNineDigitBatch(limit = PAGE): Promise<{
  scanned: number;
  updated: number;
  aliases: number;
  authEmails: number;
  done: boolean;
  lastId: string | null;
}> {
  const stateSnap = await db.doc(STATE_DOC).get();
  const lastId = String(stateSnap.data()?.lastId ?? "") || null;

  let query = db.collection("users").orderBy(FieldPath.documentId()).limit(limit);
  if (lastId) query = query.startAfter(lastId);
  const snap = await query.get();

  let scanned = 0;
  let updated = 0;
  let aliases = 0;
  let authEmails = 0;

  for (const doc of snap.docs) {
    scanned += 1;
    const data = doc.data() as ProfileData & { phone?: string };
    const raw = String(data.phone ?? "").trim();
    if (!raw) continue;
    const canonical = normalizePhone(raw);
    if (!canonical) continue;

    const digits = raw.replace(/\D/g, "");
    const local =
      digits.startsWith(GAMBIA_COUNTRY_CODE) && digits.length > GAMBIA_COUNTRY_CODE.length
        ? digits.slice(GAMBIA_COUNTRY_CODE.length)
        : digits;
    const needsProfile = local.length === GAMBIA_LEGACY_LOCAL_LENGTH || data.phone !== canonical;

    if (needsProfile) {
      await doc.ref.set({ phone: canonical, phoneMigratedAt: FieldValue.serverTimestamp() }, { merge: true });
      updated += 1;
    }

    const batch = db.batch();
    writePhoneIndex(batch, doc.id, canonical);
    await batch.commit();
    aliases += 1;

    if (data.role === "player") {
      const nextEmail = phoneToEmail(canonical);
      try {
        const user = await auth.getUser(doc.id);
        if (user.email !== nextEmail) {
          await auth.updateUser(doc.id, { email: nextEmail });
          authEmails += 1;
        }
      } catch (err) {
        logger.warn("phone migrate auth email skipped", { uid: doc.id, err: String(err) });
      }
    }
  }

  const done = snap.size < limit;
  const nextLast = done ? null : snap.docs[snap.docs.length - 1]?.id ?? null;
  await db.doc(STATE_DOC).set(
    {
      lastId: nextLast,
      done,
      updatedAt: FieldValue.serverTimestamp(),
      lastBatch: { scanned, updated, aliases, authEmails },
    },
    { merge: true },
  );

  try {
    const settingsRef = db.doc("settings/platform");
    const settingsSnap = await settingsRef.get();
    const cc = settingsSnap.data()?.customerCare as { phone?: string; whatsapp?: string } | undefined;
    if (cc) {
      const phone = migrateCareDigits(String(cc.phone ?? ""));
      const whatsapp = migrateCareDigits(String(cc.whatsapp ?? ""));
      if (phone !== cc.phone || whatsapp !== cc.whatsapp) {
        await settingsRef.set({ customerCare: { ...cc, phone, whatsapp } }, { merge: true });
      }
    }
  } catch (err) {
    logger.warn("phone migrate customer care skipped", err);
  }

  return { scanned, updated, aliases, authEmails, done, lastId: nextLast };
}

export const adminMigrateGambiaNineDigitPhones = onCall(
  { timeoutSeconds: 540, memory: "512MiB" },
  async (req) => {
    await requireRole(req, ["admin"]);
    const reset = Boolean(req.data?.reset);
    if (reset) {
      await db.doc(STATE_DOC).set({ lastId: null, done: false }, { merge: true });
    }
    const limit = Math.min(500, Math.max(1, Number(req.data?.limit ?? PAGE) || PAGE));
    return { ok: true as const, ...(await migrateGambiaNineDigitBatch(limit)) };
  },
);

/** Convert remaining 7-digit registered numbers automatically. */
export const migrateGambiaNineDigitPhonesHourly = onSchedule(
  { schedule: "every 15 minutes", timeoutSeconds: 540, memory: "512MiB" },
  async () => {
    const result = await migrateGambiaNineDigitBatch(400);
    logger.info("gambia 9-digit phone migrate", result);
  },
);
