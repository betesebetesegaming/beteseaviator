"use client";

import { Suspense } from "react";
import { AccountsHub } from "@/components/accounts/AccountsHub";
import { Spinner } from "@/components/ui";

export default function AccountsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading accounts…" />}>
      <AccountsHub />
    </Suspense>
  );
}
