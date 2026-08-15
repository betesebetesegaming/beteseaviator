import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firestore";
import { adminLookupUser } from "@/lib/api";
import { normalizePhone } from "@/lib/format";
import type { UserProfile } from "@/lib/types";

function asProfile(id: string, data: Record<string, unknown>): UserProfile {
  return { uid: id, ...data } as UserProfile;
}

async function loadProfiles(uids: string[]): Promise<UserProfile[]> {
  const hits = new Map<string, UserProfile>();
  await Promise.all(
    uids.map(async (uid) => {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) hits.set(snap.id, asProfile(snap.id, snap.data()));
    }),
  );
  return Array.from(hits.values());
}

/**
 * Admin list pages only load the newest 500 users. Use this to find anyone by
 * Gambian phone or Player ID (BTE-00009 / 9), including older accounts.
 */
export async function lookupUsersByPhoneOrId(raw: string): Promise<UserProfile[]> {
  const cleaned = raw.trim();
  if (!cleaned) return [];

  try {
    const res = await adminLookupUser({ query: cleaned });
    if (res.uids.length) return await loadProfiles(res.uids);
  } catch {
    // Fall through to a direct Firestore query if the callable is not live yet.
  }

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
