"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { subscribeDeposits } from "@/lib/payments/rtdbClient";
import type { RtdbDepositRecord } from "@/lib/payments/rtdbRecords";
import { RECONCILE_INTERVAL_MS, sweepPendingDeposits } from "@/lib/payments/reconcileDeposits";

/** Background sweep: reconcile ModemPay deposits stuck Pending after 20s. */
export function PendingDepositReconciler() {
  const { fbUser } = useAuth();
  const lastTried = useRef(new Map<string, number>());
  const depositsRef = useRef<RtdbDepositRecord[]>([]);

  useEffect(() => {
    if (!fbUser) return;

    const run = () => sweepPendingDeposits(depositsRef.current, fbUser.uid, lastTried.current);

    const unsub = subscribeDeposits(fbUser.uid, (rows) => {
      depositsRef.current = rows;
      run();
    });

    run();
    const timer = window.setInterval(run, RECONCILE_INTERVAL_MS);
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, [fbUser]);

  return null;
}
