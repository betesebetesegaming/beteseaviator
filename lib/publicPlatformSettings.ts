import type { PlatformSettings } from "@/lib/types";

/** Strip wallet/API secrets before exposing platform settings to players. */
export function stripPlatformSecrets(
  data: Partial<PlatformSettings> | Record<string, unknown> | null | undefined,
): Partial<PlatformSettings> {
  const d = { ...(data ?? {}) } as Partial<PlatformSettings>;
  if (d.qtech && typeof d.qtech === "object") {
    const { passKey: _pk, apiPassword: _ap, operatorId: _oi, apiBaseUrl: _ab, ...safeQt } = d.qtech;
    d.qtech = safeQt;
  }
  return d;
}
