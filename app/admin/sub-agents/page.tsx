"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";

/** Sub-agents removed — redirect legacy URL to agent dashboard. */
export default function SubAgentsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin");
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner label="Redirecting…" />
    </div>
  );
}
