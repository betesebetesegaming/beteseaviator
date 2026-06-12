"use client";

import { usePathname } from "next/navigation";
import { STAFF_ROLES } from "@/lib/staff-nav";
import { RoleGuard } from "@/components/role-guard";
import { StaffNav } from "@/components/staff/StaffNav";
import { StaffRouteAccess } from "@/components/staff/StaffRouteAccess";

export default function StaffBackendLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/admin/login";

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <RoleGuard allow={STAFF_ROLES} loginPath="/admin/login">
      <StaffNav />
      <StaffRouteAccess>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      </StaffRouteAccess>
    </RoleGuard>
  );
}
