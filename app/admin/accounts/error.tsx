"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function AccountsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Accounts page error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
      <h2 className="text-lg font-semibold text-red-100">Accounts could not load</h2>
      <p className="mt-2 text-sm text-slate-400">
        The ModemPay deposits view hit an error. Try reloading — if it keeps happening, check the
        browser console and contact support.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={() => reset()}>Try again</Button>
        <Button variant="secondary" onClick={() => window.location.assign("/admin/accounts")}>
          Reload accounts
        </Button>
      </div>
    </div>
  );
}
