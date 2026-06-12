"use client";

import { Suspense } from "react";
import { OperationsHub } from "@/components/operations/OperationsHub";
import { Spinner } from "@/components/ui";

export default function AgentOperationsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading operations…" />}>
      <OperationsHub basePath="/agent" />
    </Suspense>
  );
}
