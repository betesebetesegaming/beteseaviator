import type { Settings } from "./helpers";

/** Canonical roles — legacy super_agent/sub_agent still accepted in Firestore. */
export type Role = "admin" | "agent" | "player";

export function isAgentRole(role: string | undefined | null): boolean {
  return role === "agent" || role === "super_agent" || role === "sub_agent";
}

export function isStaffRole(role: string | undefined | null): boolean {
  return role === "admin" || isAgentRole(role);
}

export function roleAllowed(profileRole: string, allowed: Role[]): boolean {
  if (allowed.includes(profileRole as Role)) return true;
  if (allowed.includes("agent") && isAgentRole(profileRole)) return true;
  return false;
}

export function agentCommissionRate(settings: Settings): number {
  const ext = settings as Settings & { agentRate?: number };
  const rate = Number(ext.agentRate ?? ext.subAgentRate ?? 0.05);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}
