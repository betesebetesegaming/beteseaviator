import { auth } from "@/lib/firebase";
import { resolveStaffSession, errorMessage } from "@/lib/api";
import { homeFor } from "@/lib/auth-context";
import { hardRedirect, withTimeout } from "@/lib/hardRedirect";

/** Sync staff profile server-side, refresh claims, then open the staff backend. */
export async function redirectAfterStaffLogin(): Promise<void> {
  if (!auth.currentUser) throw new Error("Not signed in");

  try {
    const result = await withTimeout(
      resolveStaffSession({}),
      8000,
      "Staff profile sync timed out",
    );
    await auth.currentUser.getIdToken(true);

    if (result.status !== "active") {
      hardRedirect("/suspended");
      return;
    }
    if (result.role === "player") {
      hardRedirect("/play");
      return;
    }

    hardRedirect(homeFor(result.role));
  } catch (e) {
    const msg = errorMessage(e);
    if (msg.toLowerCase().includes("not authorized") || msg.toLowerCase().includes("not a staff")) {
      hardRedirect("/play");
      return;
    }
    throw new Error(msg || "Could not load your staff profile. Try again.");
  }
}
