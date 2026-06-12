import type { Role } from "@/lib/types";

/** Single sign-in page for admin, super agents and sub agents */
export const STAFF_LOGIN_PATH = "/admin/login";

export function isStaffRole(role: Role | undefined | null): boolean {
  return role === "admin" || role === "super_agent" || role === "sub_agent";
}

export function loginPathFor(role: Role | undefined | null): string {
  switch (role) {
    case "admin":
    case "super_agent":
    case "sub_agent":
      return STAFF_LOGIN_PATH;
    default:
      return "/play";
  }
}
