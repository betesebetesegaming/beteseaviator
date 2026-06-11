"use client";

import { RoleGuard } from "@/components/role-guard";

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard allow={["player"]}>{children}</RoleGuard>;
}
