"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Wallet,
  HandCoins,
  BarChart3,
  Settings,
  LogOut,
  Megaphone,
} from "lucide-react";
import { RoleGuard } from "@/components/role-guard";
import { useAuth } from "@/lib/auth-context";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/wallets", label: "Wallets", icon: Wallet },
  { href: "/admin/withdrawals", label: "Withdrawals", icon: HandCoins },
  { href: "/admin/promotions", label: "Promotions", icon: Megaphone },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function AdminNav() {
  const pathname = usePathname();
  const { logout } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/admin" className="flex items-center gap-2 font-bold">
          <Megaphone className="text-emerald-400" size={22} />
          <span className="hidden sm:inline">
            BETESE <span className="text-emerald-400">Admin</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {NAV.map((n) => {
            const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${
                  active
                    ? "bg-emerald-500/15 font-semibold text-emerald-300"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={15} />
                <span className="hidden lg:inline">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <button
          onClick={logout}
          className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
          title="Logout"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allow={["admin"]}>
      <AdminNav />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </RoleGuard>
  );
}
