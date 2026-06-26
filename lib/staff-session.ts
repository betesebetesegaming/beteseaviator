import { doc, getDoc } from "firebase/firestore";
import { auth } from "@/lib/firebase";
import { db } from "@/lib/firestore";
import { homeFor } from "@/lib/auth-context";
import { isStaffRole } from "@/lib/staff-routes";
import type { UserProfile } from "@/lib/types";

/** Poll Firestore until the signed-in user's profile is ready, then hard-navigate. */
export async function redirectAfterStaffLogin(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const snap = await getDoc(doc(db, "users", uid));
    if (auth.currentUser?.uid !== uid) return;

    if (snap.exists()) {
      const profile = { uid: snap.id, ...snap.data() } as UserProfile;
      if (profile.status !== "active") {
        window.location.href = "/suspended";
        return;
      }
      if (profile.role === "player") {
        window.location.href = "/play";
        return;
      }
      if (isStaffRole(profile.role)) {
        window.location.href = homeFor(profile.role);
        return;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error("Could not load your staff profile. Try again.");
}
