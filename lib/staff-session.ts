import { auth } from "@/lib/firebase";
import { resolveStaffSession, errorMessage } from "@/lib/api";
import { homeFor } from "@/lib/auth-context";

/** Sync staff profile server-side, refresh claims, then open the staff backend. */
export async function redirectAfterStaffLogin(): Promise<void> {
  if (!auth.currentUser) throw new Error("Not signed in");

  try {
    const result = await resolveStaffSession({});
    await auth.currentUser.getIdToken(true);

    if (result.status !== "active") {
      window.location.href = "/suspended";
      return;
    }
    if (result.role === "player") {
      window.location.href = "/play";
      return;
    }

    window.location.href = homeFor(result.role);
  } catch (e) {
    const msg = errorMessage(e);
    if (msg.toLowerCase().includes("not authorized") || msg.toLowerCase().includes("not a staff")) {
      window.location.href = "/play";
      return;
    }
    throw new Error(msg || "Could not load your staff profile. Try again.");
  }
}
