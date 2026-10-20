import type { Role } from "@/lib/types";
import { isAgentRole, isStaffRole as checkStaffRole } from "@/lib/roles";

/**
 * Short staff sign-in path (preferred for SMS / QR — fewer bytes, faster to open).
 * Canonical page lives here; /admin/login redirects here.
 */
export const STAFF_LOGIN_PATH = "/s";

/**
 * Betese Marketers staff app. Two path segments on purpose: the middleware only treats
 * single-segment paths (beteseaviator.com/<slug>) as agent referral links, so no agent link
 * can ever collide with this route and no slug has to be reserved.
 */
export const MARKETERS_HOME = "/staff/marketers";

/** Legacy path — still works via redirect to /s */
export const STAFF_LOGIN_LEGACY_PATH = "/admin/login";

/** Roles that sign in at /s — includes Betese Marketers, who land on MARKETERS_HOME (not /admin). */
export function isStaffRole(role: Role | undefined | null): boolean {
  return checkStaffRole(role) || role === "marketer";
}

export function loginPathFor(role: Role | undefined | null): string {
  if (role === "admin" || role === "marketer" || isAgentRole(role)) return STAFF_LOGIN_PATH;
  return "/play";
}
