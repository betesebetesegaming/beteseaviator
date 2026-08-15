import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firestore";
import { normalizePhone } from "@/lib/format";
import type { UserProfile } from "@/lib/types";

function asProfile(id: string, data: Record<string, unknown>): UserProfile {
  return { uid: id, ...data } as UserProfile;
}

/**
 * Admin list pages only load the newest 500 users. Use this to find anyone by
 * Gambian phone or Player ID (BTE-00009 / 9), including older accounts.
 */
export async function lookupUsersByPhoneOrId(raw: string): Promise<UserProfile[]> {
  const cleaned = raw.trim();
  if (!cleaned) return [];

  const hits = new Map<string, UserProfile>();
  const phone = normalizePhone(cleaned);

  if (phone) {
    const snap = await getDocs(query(collection(db, "users"), where("phone", "==", phone), limit(5)));
    for (const d of snap.docs) hits.set(d.id, asProfile(d.id, d.data()));
  }

  const idMatch = cleaned.toUpperCase().replace(/\s/g, "").match(/^(?:BTE-?)?0*(\d+)$/);
  if (idMatch) {
    const num = Number(idMatch[1]);
    const looksLikePhone = Boolean(phone) && String(num).length >= 7;
    if (Number.isFinite(num) && num > 0 && !looksLikePhone) {
      const snap = await getDocs(
        query(collection(db, "users"), where("playerNumber", "==", num), limit(5)),
      );
      for (const d of snap.docs) hits.set(d.id, asProfile(d.id, d.data()));
    }
  }

  return Array.from(hits.values());
}
