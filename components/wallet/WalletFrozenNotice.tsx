"use client";

import { Headphones } from "lucide-react";
import { Card } from "@/components/ui";
import { CustomerCareBar } from "@/components/CustomerCareBar";

/** Shown when a player's wallet is frozen — no bet/deposit/withdraw actions. */
export function WalletFrozenNotice() {
  return (
    <Card className="border-amber-500/35 bg-amber-500/10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 text-amber-300">
        <Headphones size={22} />
      </div>
      <p className="text-base font-semibold text-amber-100">Wallet restricted</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-300">
        Deposits, withdrawals and betting are temporarily unavailable on your account.
      </p>
      <p className="mt-3 text-sm font-medium text-white">Please contact customer service for help.</p>
      <div className="mt-4">
        <CustomerCareBar />
      </div>
    </Card>
  );
}
