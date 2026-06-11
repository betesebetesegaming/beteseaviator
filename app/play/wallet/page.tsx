"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { apiUrl } from "@/lib/apiUrl";
import { normalizeGambiaPhone } from "@/lib/gambiaPhone";
import { dbCreateWithdrawalRequest, dbDepositRequest } from "@/lib/paymentsClient";
import { subscribeDepositById } from "@/lib/payments/rtdbClient";
import { buildDepositResult, type PaymentResultPayload } from "@/lib/paymentResultPayload";
import { formatSigned, formatXof, formatDate } from "@/lib/format";
import type { WalletTransaction } from "@/lib/types";
import { PaymentSheet } from "@/components/PaymentSheet";
import { PaymentResultModal } from "@/components/PaymentResultModal";
import { Badge, Button, Card, EmptyState, Input, Select, TableShell, Td, Th } from "@/components/ui";

type Tab = "history" | "deposit" | "withdraw";

export default function WalletPage() {
  const { fbUser, profile, wallet } = useAuth();
  const [tab, setTab] = useState<Tab>("history");
  const [transactions, setTransactions] = useState<WalletTransaction[] | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const [paymentResult, setPaymentResult] = useState<PaymentResultPayload | null>(null);

  const [withdrawMethod, setWithdrawMethod] = useState<"Wave" | "AfriMoney">("Wave");
  const [withdrawPhone, setWithdrawPhone] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!fbUser) return;
    const q = query(
      collection(db, "transactions"),
      where("userId", "==", fbUser.uid),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    return onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WalletTransaction));
    });
  }, [fbUser]);

  useEffect(() => {
    if (profile?.phone && !withdrawPhone) setWithdrawPhone(profile.phone);
  }, [profile, withdrawPhone]);

  const handleCreateDepositRequest = useCallback(
    async (
      amount: number,
      method: "Wave" | "AfriMoney" | "APS" | "QMoney" | "Card",
      phone: string,
      externalRef: string
    ) => {
      if (!fbUser || !profile) return;
      const normalizedPhone = normalizeGambiaPhone(phone || "");
      if (!normalizedPhone) {
        toast.error("Enter a valid phone number for mobile money.");
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
        verificationMessage:
          "Waiting for ModemPay to confirm payment before your wallet is credited.",
      });
    },
    [fbUser, profile]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ref = new URLSearchParams(window.location.search).get("deposit");
    if (!ref || !ref.startsWith("BETESE-")) return;
    return subscribeDepositById(ref, (record) => {
      if (!record) return;
      if (record.status === "Approved") {
        setPaymentResult(buildDepositResult("Approved", record.amount, record.method, ref));
        window.history.replaceState({}, "", "/play/wallet");
      } else if (record.status === "Rejected") {
        setPaymentResult(buildDepositResult("Rejected", record.amount, record.method, ref));
        window.history.replaceState({}, "", "/play/wallet");
      }
    });
  }, []);

  async function submitMobileWithdrawal() {
    if (!fbUser || !profile) return;
    const normalizedPhone = normalizeGambiaPhone(withdrawPhone || profile.phone || "");
    if (!normalizedPhone) return toast.error("Enter a valid mobile money phone number.");
    const amt = Number(withdrawAmount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Enter a valid amount.");
    if (amt > (wallet?.balance ?? 0)) return toast.error("Insufficient balance.");

    const requestId = `BETESE-WD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const cleanPhone = normalizedPhone.replace(/^\+220/, "").replace(/\D/g, "");
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    setBusy(true);
    try {
      await dbCreateWithdrawalRequest({
        id: requestId,
        customerId: fbUser.uid,
        customerName: profile.name,
        amount: Number(amt.toFixed(2)),
        status: "Pending",
        code,
        requestedAt: new Date().toISOString(),
        payoutMethod: withdrawMethod,
        recipientPhone: cleanPhone,
      });

      const res = await fetch(apiUrl("/modempay-payout"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          recipientPhone: cleanPhone,
          recipientName: profile.name,
          method: withdrawMethod.toLowerCase(),
          withdrawalRequestId: requestId,
          withdrawalCode: code,
          customerId: fbUser.uid,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Withdrawal payout failed");
      }
      toast.success("Withdrawal sent to your mobile money account.");
      setWithdrawAmount("");
      setTab("history");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Withdrawal failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!fbUser || !profile) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <Card className="mb-5 bg-gradient-to-r from-emerald-500/10 to-transparent text-center">
        <p className="text-xs uppercase tracking-widest text-slate-400">My Balance</p>
        <p className="mt-1 text-4xl font-black text-emerald-300">
          {formatXof(wallet?.balance ?? 0)}
        </p>
        {wallet?.frozen && (
          <p className="mt-2 text-xs font-semibold text-red-400">
            Wallet frozen — betting and withdrawals are disabled.
          </p>
        )}
      </Card>

      <div className="mb-5 grid grid-cols-3 rounded-lg bg-slate-900 p-1 text-sm font-medium">
        {(["history", "deposit", "withdraw"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md py-2 capitalize transition-colors ${
              tab === t ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "history" && (
        <>
          {!transactions || transactions.length === 0 ? (
            <EmptyState message="No transactions yet. Top up with Wave, AfriMoney, APS or QMoney via ModemPay." />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Type</Th>
                  <Th>Description</Th>
                  <Th>Amount</Th>
                  <Th>Date</Th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <Td>
                      <Badge value={t.type} />
                    </Td>
                    <Td className="text-slate-400">{t.description}</Td>
                    <Td
                      className={`font-semibold tabular-nums ${
                        t.amount >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {formatSigned(t.amount)}
                    </Td>
                    <Td className="text-slate-500">{formatDate(t.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </>
      )}

      {tab === "deposit" && (
        <Card>
          <h2 className="mb-2 font-semibold">Deposit via ModemPay</h2>
          <p className="mb-4 text-sm text-slate-400">
            Same checkout as Betese PMU — Wave, AfriMoney, APS, QMoney or card. Your wallet
            is credited automatically when ModemPay confirms payment.
          </p>
          <Button className="w-full" onClick={() => setDepositOpen(true)}>
            Open payment methods
          </Button>
        </Card>
      )}

      {tab === "withdraw" && (
        <Card>
          <h2 className="mb-4 font-semibold">Withdraw to mobile money</h2>
          <div className="space-y-4">
            <Select
              label="Provider"
              value={withdrawMethod}
              onChange={(e) => setWithdrawMethod(e.target.value as "Wave" | "AfriMoney")}
            >
              <option value="Wave">Wave</option>
              <option value="AfriMoney">AfriMoney</option>
            </Select>
            <Input
              label="Payout phone number"
              type="tel"
              placeholder="7701234 or +2207701234"
              value={withdrawPhone}
              onChange={(e) => setWithdrawPhone(e.target.value)}
            />
            <Input
              label="Amount (GMD)"
              type="number"
              min={1}
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
            />
            <Button className="w-full" disabled={busy} onClick={submitMobileWithdrawal}>
              {busy ? "Processing…" : "Withdraw via ModemPay"}
            </Button>
            <p className="text-xs text-slate-500">
              Funds are held immediately and sent via ModemPay transfer. Failed payouts are
              refunded automatically.
            </p>
          </div>
        </Card>
      )}

      <PaymentSheet
        isOpen={depositOpen}
        onClose={() => setDepositOpen(false)}
        user={{
          id: fbUser.uid,
          name: profile.name,
          phone: profile.phone || undefined,
          walletBalance: wallet?.balance ?? 0,
        }}
        onDepositRequest={handleCreateDepositRequest}
      />
      <PaymentResultModal result={paymentResult} onClose={() => setPaymentResult(null)} />
    </div>
  );
}
