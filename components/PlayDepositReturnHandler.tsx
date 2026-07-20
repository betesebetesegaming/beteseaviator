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
      const ref = readPendingDepositRef();
      if (!ref) return;
      if (window.location.pathname.startsWith("/play/wallet")) return;
      router.replace(`/play/wallet?deposit=${encodeURIComponent(ref)}`);
    };

    route();
    window.addEventListener("focus", route);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") route();
    });
    return () => {
      window.removeEventListener("focus", route);
    };
  }, [router]);

  return null;
}
