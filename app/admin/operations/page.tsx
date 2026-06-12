"use client";

import { Suspense } from "react";
import { OperationsHub } from "@/components/operations/OperationsHub";
import { Spinner } from "@/components/ui";

export default function AdminOperationsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading operations…" />}>
      <OperationsHub basePath="/admin" />
    </Suspense>
  );
}
