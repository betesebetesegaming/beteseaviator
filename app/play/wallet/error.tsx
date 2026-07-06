"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";

export default function WalletError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Wallet page error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
      <h2 className="text-lg font-semibold text-red-100">Wallet could not load</h2>
      <p className="mt-2 text-sm text-slate-400">
        {error.message || "Something went wrong opening your wallet or ModemPay deposit."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={() => reset()}>Try again</Button>
        <Link href="/play">
          <Button variant="secondary">Back to games</Button>
        </Link>
      </div>
    </div>
  );
}
