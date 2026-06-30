import type { Role } from "@/lib/types";

export function isAgentRole(role: string | undefined | null): boolean {
  return role === "agent" || role === "super_agent" || role === "sub_agent";
}

export function isStaffRole(role: string | undefined | null): boolean {
  return role === "admin" || isAgentRole(role);
}

export const STAFF_ROLES: Role[] = ["admin", "agent", "super_agent", "sub_agent"];

export function roleLabel(role: Role | string): string {
  if (isAgentRole(role)) return "Agent Marketer";
  if (role === "admin") return "Admin";
  if (role === "player") return "Player";
  return String(role);
}
