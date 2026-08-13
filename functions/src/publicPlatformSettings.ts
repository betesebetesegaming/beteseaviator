import { db } from "./helpers";

/** Strip wallet/API secrets before writing the public platform settings doc. */
export function stripPlatformSecrets(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  if (out.qtech && typeof out.qtech === "object") {
    const qt = { ...(out.qtech as Record<string, unknown>) };
    delete qt.passKey;
    delete qt.apiPassword;
    delete qt.operatorId;
    delete qt.apiBaseUrl;
    out.qtech = qt;
  }
  return out;
}

/** Mirror non-secret platform fields to settings/publicPlatform (world-readable). */
export async function syncPublicPlatformSettings(overlay?: Record<string, unknown>): Promise<void> {
  const snap = await db.doc("settings/platform").get();
  const platform = {
    ...(snap.exists ? (snap.data() as Record<string, unknown>) : {}),
    ...(overlay ?? {}),
  };
  // Full replace so stripped secrets cannot linger from an older merge.
  await db.doc("settings/publicPlatform").set(stripPlatformSecrets(platform));
}
