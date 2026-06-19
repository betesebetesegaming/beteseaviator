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
  UserCog,
  Percent,
  UserPlus,
  Gamepad2,
} from "lucide-react";
import type { Role } from "@/lib/types";

export const STAFF_ROLES: Role[] = ["admin", "super_agent", "sub_agent"];

export type StaffNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  roles: Role[];
  superOnly?: boolean;
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
    roles: ["super_agent", "sub_agent"],
  },
  {
    href: "/admin/sub-agents",
    label: "Sub Agents",
    icon: UserCog,
    roles: ["super_agent"],
    superOnly: true,
  },
  {
    href: "/admin/commissions",
    label: "Commissions",
    icon: Percent,
    roles: ["super_agent", "sub_agent"],
  },
  {
    href: "/admin/agent-wallet",
    label: "My Wallet",
    icon: Wallet,
    roles: ["super_agent", "sub_agent"],
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
    href: "/admin/qtech",
    label: "QTech & Games",
    icon: Gamepad2,
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
  "/admin/qtech",
  "/admin/reports",
  "/admin/settings",
];

export function navForRole(role: Role | undefined): StaffNavItem[] {
  if (!role) return [];
  return STAFF_NAV.filter((item) => {
    if (!item.roles.includes(role)) return false;
    if (item.superOnly && role !== "super_agent") return false;
    return true;
  });
}

export function roleLabel(role: Role): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "super_agent":
      return "Super Agent";
    case "sub_agent":
      return "Sub Agent";
    default:
      return role;
  }
}
