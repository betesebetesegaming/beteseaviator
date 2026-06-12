"use client";

import { Suspense } from "react";
import { OperationsHub } from "@/components/operations/OperationsHub";
import { Spinner } from "@/components/ui";

export default function StaffOperationsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading operations…" />}>
      <OperationsHub />
    </Suspense>
  );
}
