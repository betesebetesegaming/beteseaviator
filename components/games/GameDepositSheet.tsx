"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { subscribePlatformSettings } from "@/lib/games/subscriptions";
import { PaymentSheet } from "@/components/PaymentSheet";
import { dbDepositRequest } from "@/lib/paymentsClient";
import { normalizeGambiaPhone, PHONE_HINT } from "@/lib/gambiaPhone";
import toast from "react-hot-toast";

type Props = {
  open: boolean;
  onClose: () => void;
};

/** Quick deposit while playing — keeps the game visible underneath. */
export function GameDepositSheet({ open, onClose }: Props) {
  const { fbUser, profile, wallet } = useAuth();
  const [minDeposit, setMinDeposit] = useState(DEFAULT_SETTINGS.minDeposit);

  useEffect(() => subscribePlatformSettings((s) => setMinDeposit(s.minDeposit)), []);

  const handleDepositRequest = useCallback(
    async (
      amount: number,
      method: "Wave" | "AfriMoney" | "APS" | "QMoney" | "Card",
      phone: string,
      externalRef: string
    ) => {
      if (!fbUser || !profile) return;
      const normalizedPhone = normalizeGambiaPhone(phone || "");
      if (!normalizedPhone) {
        toast.error(PHONE_HINT);
        return;
      }
      await dbDepositRequest({
        id: externalRef,
        customerId: fbUser.uid,
        customerName: profile.name,
        amount: Number(amount.toFixed(2)),
        method,
        transactionId: normalizedPhone.replace(/^\+220/, "").replace(/\D/g, ""),
        status: "Pending",
        timestamp: new Date().toISOString(),
        providerReference: externalRef,
        verificationStatus: "PendingProviderConfirmation",
        verificationSource: "webhook",
        verificationMessage: "Waiting for ModemPay to confirm payment before your wallet is credited.",
      });
    },
    [fbUser, profile]
  );

  if (!fbUser || !profile) return null;

  return (
    <PaymentSheet
      isOpen={open}
      onClose={onClose}
      user={{
        id: fbUser.uid,
        name: profile.name,
        phone: profile.phone ?? undefined,
        walletBalance: wallet?.balance,
      }}
      minDeposit={minDeposit}
      frozen={Boolean(wallet?.frozen)}
      onDepositRequest={handleDepositRequest}
      floatingKeypad
    />
  );
}
