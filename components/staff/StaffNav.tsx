"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { navForRole, roleLabel } from "@/lib/staff-nav";
import { isAgentRole } from "@/lib/roles";
import { formatXof } from "@/lib/format";

export function StaffNav() {
  const pathname = usePathname();
  const { profile, wallet, logout } = useAuth();
  const items = navForRole(profile?.role);
  const isAgent = isAgentRole(profile?.role);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/admin" className="flex shrink-0 flex-col">
          <span className="flex items-center gap-2 font-bold">
            <span className="text-emerald-400">BETESE</span>
            <span className="hidden text-white sm:inline">Backend</span>
          </span>
          {profile && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {roleLabel(profile.role)}
            </span>
          )}
        </Link>

        <nav className="flex min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto px-1">
          {items.map((n) => {
            const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm sm:px-3 ${
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

        <div className="flex shrink-0 items-center gap-2">
          {isAgent && (
            <span className="hidden rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-bold text-emerald-300 sm:inline">
              {formatXof(wallet?.balance ?? 0)}
            </span>
          )}
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
