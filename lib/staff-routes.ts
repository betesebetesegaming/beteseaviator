import type { Role } from "@/lib/types";
import { isAgentRole, isStaffRole as checkStaffRole } from "@/lib/roles";

/** Single sign-in page for admin and agents */
export const STAFF_LOGIN_PATH = "/admin/login";

export function isStaffRole(role: Role | undefined | null): boolean {
  return checkStaffRole(role);
}

export function loginPathFor(role: Role | undefined | null): string {
  if (role === "admin" || isAgentRole(role)) return STAFF_LOGIN_PATH;
  return "/play";
}
