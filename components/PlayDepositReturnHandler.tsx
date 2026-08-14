"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readPendingDepositRef } from "@/lib/payments/pendingDepositSession";

/** After mobile checkout, land on wallet with deposit status even if return URL was stripped. */
export function PlayDepositReturnHandler() {
  const router = useRouter();

  useEffect(() => {
    const route = () => {
      if (typeof window === "undefined") return;
      // Wallet page consumes the pending ref itself — don't eat it here first.
      if (window.location.pathname.startsWith("/play/wallet")) return;
      const ref = readPendingDepositRef();
      if (!ref) return;
      router.replace(`/play/wallet?deposit=${encodeURIComponent(ref)}`);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") route();
    };

    route();
    window.addEventListener("focus", route);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", route);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
