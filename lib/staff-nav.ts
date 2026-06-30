import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Wallet,
  HandCoins,
  BarChart3,
  Settings,
  Megaphone,
  Activity,
  Percent,
  UserPlus,
  Gamepad2,
  ListOrdered,
  Gift,
} from "lucide-react";
import type { Role } from "@/lib/types";
import { isAgentRole, roleLabel as sharedRoleLabel } from "@/lib/roles";

export const STAFF_ROLES: Role[] = ["admin", "agent", "super_agent", "sub_agent"];

export type StaffNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  roles: Role[];
};

/** One backend nav — filtered by signed-in role after login. */
export const STAFF_NAV: StaffNavItem[] = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
    roles: STAFF_ROLES,
  },
  {
    href: "/admin/operations",
    label: "Operations",
    icon: Activity,
    roles: STAFF_ROLES,
  },
  {
    href: "/admin/customers",
    label: "My Customers",
    icon: UserPlus,
    roles: ["agent", "super_agent", "sub_agent"],
  },
  {
    href: "/admin/commissions",
    label: "Commissions",
    icon: Percent,
    roles: ["agent", "super_agent", "sub_agent"],
  },
  {
    href: "/admin/agent-wallet",
    label: "My Wallet",
    icon: Wallet,
    roles: ["agent", "super_agent", "sub_agent"],
  },
  {
    href: "/admin/users",
    label: "All Users",
    icon: Users,
    roles: ["admin"],
  },
  {
    href: "/admin/wallets",
    label: "All Wallets",
    icon: Wallet,
    roles: ["admin"],
  },
  {
    href: "/admin/withdrawals",
    label: "Withdrawals",
    icon: HandCoins,
    roles: ["admin"],
  },
  {
    href: "/admin/promotions",
    label: "Promotions",
    icon: Megaphone,
    roles: ["admin"],
  },
  {
    href: "/admin/games",
    label: "Lobby order",
    icon: ListOrdered,
    roles: ["admin"],
  },
  {
    href: "/admin/qtech",
    label: "QTech & Games",
    icon: Gamepad2,
    roles: ["admin"],
  },
  {
    href: "/admin/bonuses",
    label: "Bonuses & Wallet",
    icon: Gift,
    roles: ["admin"],
  },
  {
    href: "/admin/reports",
    label: "Reports",
    icon: BarChart3,
    roles: ["admin"],
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: Settings,
    roles: ["admin"],
  },
];

export const ADMIN_ONLY_PREFIXES = [
  "/admin/users",
  "/admin/wallets",
  "/admin/withdrawals",
  "/admin/promotions",
  "/admin/bonuses",
  "/admin/games",
  "/admin/qtech",
  "/admin/reports",
  "/admin/settings",
];

export function navForRole(role: Role | undefined): StaffNavItem[] {
  if (!role) return [];
  return STAFF_NAV.filter((item) => {
    if (item.roles.includes(role)) return true;
    if (isAgentRole(role) && item.roles.includes("agent")) return true;
    return false;
  });
}

export function roleLabel(role: Role): string {
  return sharedRoleLabel(role);
}
