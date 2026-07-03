"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { hardRedirect } from "@/lib/hardRedirect";
import { Spinner } from "@/components/ui";

const LEGACY_AGENT_PATHS: Record<string, string> = {
  "/agent": "/admin",
  "/agent/login": "/admin/login",
  "/agent/operations": "/admin/operations",
  "/agent/players": "/admin/customers",
  "/agent/sub-agents": "/admin",
  "/agent/commissions": "/admin/commissions",
  "/agent/wallet": "/admin/agent-wallet",
};

export default function AgentLegacyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    hardRedirect(LEGACY_AGENT_PATHS[pathname] ?? "/admin");
  }, [pathname]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label="Redirecting to staff backend…" />
      {children}
    </div>
  );
}
