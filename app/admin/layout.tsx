"use client";

import { STAFF_ROLES } from "@/lib/staff-nav";
import { STAFF_LOGIN_PATH } from "@/lib/staff-routes";
import { RoleGuard } from "@/components/role-guard";
import { StaffNav } from "@/components/staff/StaffNav";
import { StaffRouteAccess } from "@/components/staff/StaffRouteAccess";

export default function StaffBackendLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allow={STAFF_ROLES} loginPath={STAFF_LOGIN_PATH}>
      <StaffNav />
      <StaffRouteAccess>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      </StaffRouteAccess>
    </RoleGuard>
  );
}
