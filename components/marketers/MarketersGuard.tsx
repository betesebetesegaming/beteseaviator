"use client";

import type { ReactNode } from "react";
import { RoleGuard } from "@/components/role-guard";
import { STAFF_LOGIN_PATH } from "@/lib/staff-routes";

export function MarketersGuard({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-slate-100 text-slate-900">
      <RoleGuard allow={["marketer", "admin"]} loginPath={STAFF_LOGIN_PATH}>
        {children}
      </RoleGuard>
    </div>
  );
}
