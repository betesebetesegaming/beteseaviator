"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";

const LEGACY_AGENT_PATHS: Record<string, string> = {
  "/agent": "/admin",
  "/agent/login": "/admin/login",
  "/agent/operations": "/admin/operations",
  "/agent/players": "/admin/customers",
  "/agent/sub-agents": "/admin/sub-agents",
  "/agent/commissions": "/admin/commissions",
  "/agent/wallet": "/admin/agent-wallet",
};

export default function AgentLegacyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    router.replace(LEGACY_AGENT_PATHS[pathname] ?? "/admin");
  }, [pathname, router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label="Redirecting to staff backend…" />
      {children}
    </div>
  );
}
