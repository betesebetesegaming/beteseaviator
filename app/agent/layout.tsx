"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plane, LayoutDashboard, Users, UserCog, Wallet, Percent, LogOut } from "lucide-react";
import { RoleGuard } from "@/components/role-guard";
import { useAuth } from "@/lib/auth-context";
import { formatXof } from "@/lib/format";

const NAV = [
  { href: "/agent", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/agent/players", label: "My Customers", icon: Users },
  { href: "/agent/sub-agents", label: "Sub Agents", icon: UserCog, superOnly: true },
  { href: "/agent/commissions", label: "Commissions", icon: Percent },
  { href: "/agent/wallet", label: "Wallet", icon: Wallet },
];

function AgentNav() {
  const pathname = usePathname();
  const { profile, wallet, logout } = useAuth();
  const isSuper = profile?.role === "super_agent";

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/agent" className="flex items-center gap-2 font-bold">
          <Plane className="text-emerald-400" size={22} />
          <span className="hidden sm:inline">
            BETESE <span className="text-emerald-400">Agent</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {NAV.filter((n) => !n.superOnly || isSuper).map((n) => {
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
                <span className="hidden md:inline">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-bold text-emerald-300">
            {formatXof(wallet?.balance ?? 0)}
          </span>
          <button
            onClick={logout}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allow={["super_agent", "sub_agent"]}>
      <AgentNav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </RoleGuard>
  );
}
