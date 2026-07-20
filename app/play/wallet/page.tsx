"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { db } from "@/lib/firestore";
import { useAuth } from "@/lib/auth-context";
import { requiresMandatoryOtpPhone } from "@/lib/env/publicConfig";
import { apiUrl } from "@/lib/apiUrl";
import { PHONE_HINT, normalizeGambiaPhone, normalizePhone } from "@/lib/gambiaPhone";
import { dbCreateWithdrawalRequest, dbDepositRequest } from "@/lib/paymentsClient";
import { subscribeDepositById } from "@/lib/payments/rtdbClient";
import { startDepositReconcilePolling } from "@/lib/payments/reconcileDeposits";
import { readPendingDepositRef, isModemPayDepositRef } from "@/lib/payments/pendingDepositSession";
import { buildDepositResult, type PaymentResultPayload } from "@/lib/paymentResultPayload";
import { MIN_DEPOSIT_GMD } from "@/lib/depositLimits";
import { formatSigned, formatDate, formatXof } from "@/lib/format";
import { subscribePlatformSettings } from "@/lib/games/subscriptions";
import { mergeBonusSettings, withdrawalRulesCopy } from "@/lib/bonuses";
import {
  bonusWageringRemaining,
  depositPlaythroughRequired,
  depositPlaythroughRemaining,
  playthroughRates,
  withdrawalPlaythroughBlockMessage,
} from "@/lib/playthrough";
import type { PlatformSettings, WalletTransaction } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { ClientErrorBoundary } from "@/components/ClientErrorBoundary";
import { PaymentResultModal } from "@/components/PaymentResultModal";
import { BonusOffersPanel, WalletBalanceCards } from "@/components/wallet/WalletBonusPanel";
import { WalletFrozenNotice } from "@/components/wallet/WalletFrozenNotice";
import { ReferralPanel } from "@/components/wallet/ReferralPanel";
import { OtpConfirmPanel, usePhoneOtp } from "@/components/PhoneOtpVerification";
import { Badge, Button, Card, EmptyState, Input, Select, TableShell, Td, Th } from "@/components/ui";

const PaymentSheet = dynamic(
  () => import("@/components/PaymentSheet").then((m) => m.PaymentSheet),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60">
        <div className="w-full max-w-lg rounded-t-3xl bg-white p-8 text-center text-slate-700">
          Loading payment methods…
        </div>
      </div>
    ),
  }
);

type Tab = "history" | "deposit" | "withdraw" | "refer";
type WithdrawStep = "form" | "otp";

export default function WalletPage() {
  const router = useRouter();
  const { fbUser, profile, wallet } = useAuth();
  const frozen = Boolean(wallet?.frozen);
  const [tab, setTab] = useState<Tab>("history");
  const [transactions, setTransactions] = useState<WalletTransaction[] | null>(null);
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositPrefill, setDepositPrefill] = useState<number | undefined>(undefined);
  const [paymentResult, setPaymentResult] = useState<PaymentResultPayload | null>(null);

  const [withdrawMethod, setWithdrawMethod] = useState<"Wave" | "AfriMoney">("Wave");
  const [withdrawPhone, setWithdrawPhone] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [withdrawStep, setWithdrawStep] = useState<WithdrawStep>("form");
  const [withdrawOtpDismissed, setWithdrawOtpDismissed] = useState(false);

  const otpPhone = useMemo(() => {
    const raw = withdrawPhone || profile?.phone || "";
    return normalizePhone(raw, "GM") || "";
  }, [withdrawPhone, profile?.phone]);

  const requiresWithdrawalOtp = requiresMandatoryOtpPhone(otpPhone);
  const withdrawalOtp = usePhoneOtp(otpPhone);
  const withdrawPhoneComplete = otpPhone.length === 7;

  useEffect(() => {
    setWithdrawOtpDismissed(false);
  }, [otpPhone]);

  useEffect(() => {
    if (tab !== "withdraw") {
      setWithdrawStep("form");
      setWithdrawOtpDismissed(false);
    }
  }, [tab]);

  useEffect(() => {
    if (withdrawalOtp.otpVerified && withdrawStep === "otp") {
      setWithdrawStep("form");
    }
  }, [withdrawalOtp.otpVerified, withdrawStep]);

  useEffect(() => {
    if (!withdrawPhoneComplete && withdrawStep === "otp") {
      setWithdrawStep("form");
    }
  }, [withdrawPhoneComplete, withdrawStep]);

  useEffect(() => {
    if (frozen) setTab("history");
  }, [frozen]);

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
    return subscribePlatformSettings(setSettings);
  }, []);

  // Smart Bonus "Activate" deep-link: /play/wallet?deposit=<amount> pre-fills the
  // matching deposit and opens the payment sheet. Also honors ?tab=deposit|refer.
  // Ignore ModemPay return refs (BETESE-…).
  useEffect(() => {
    if (typeof window === "undefined" || frozen) return;
    const params = new URLSearchParams(window.location.search);
    const depositRaw = params.get("deposit");
    if (isModemPayDepositRef(depositRaw)) return;
    const depositParam = Number(depositRaw);
    const tabParam = params.get("tab");
    if (Number.isFinite(depositParam) && depositParam > 0) {
      setDepositPrefill(depositParam);
      setTab("deposit");
      setDepositOpen(true);
      router.replace("/play/wallet", { scroll: false });
    } else if (tabParam === "deposit" || tabParam === "withdraw" || tabParam === "refer") {
      setTab(tabParam as Tab);
      router.replace("/play/wallet", { scroll: false });
    }
  }, [frozen, router]);

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
      if (frozen) {
        toast.error("Contact customer service — your wallet is restricted.");
        return;
      }
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
        verificationMessage:
          "Waiting for ModemPay to confirm payment before your wallet is credited.",
      });
    },
    [fbUser, profile, frozen]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ref = readPendingDepositRef();
    if (!ref) return;

    setTab("deposit");

    let settled = false;
    const showResult = (status: "Approved" | "Rejected", amount: number, method: string) => {
      if (settled) return;
      settled = true;
      setPaymentResult(buildDepositResult(status, amount, method, ref));
      router.replace("/play/wallet", { scroll: false });
    };

    const stopPolling = startDepositReconcilePolling(
      ref,
      () => settled,
      (status) => {
        if (status === "Approved" || status === "Rejected") {
          /* amount/method filled in when RTDB/Firestore snapshot arrives */
        }
      },
      { immediate: true },
    );

    const unsubRtdb = subscribeDepositById(ref, (record) => {
      if (!record) return;
      if (record.status === "Approved") {
        showResult("Approved", record.amount, record.method);
      } else if (record.status === "Rejected") {
        showResult("Rejected", record.amount, record.method);
      }
    });

    const unsubFs = onSnapshot(doc(db, "deposit_requests", ref), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      const status = String(data.status || "");
      if (status === "Approved") {
        showResult("Approved", Number(data.amount || 0), String(data.method || "Wave"));
      } else if (status === "Rejected") {
        showResult("Rejected", Number(data.amount || 0), String(data.method || "Wave"));
      }
    });

    return () => {
      settled = true;
      stopPolling();
      unsubRtdb();
      unsubFs();
    };
  }, [router]);

  async function submitMobileWithdrawal() {
    if (!fbUser || !profile) return;
    if (frozen) return toast.error("Contact customer service — your wallet is restricted.");
    const normalizedPhone = normalizeGambiaPhone(withdrawPhone || profile.phone || "");
    if (!normalizedPhone) return toast.error(PHONE_HINT);
    const amt = Number(withdrawAmount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Enter a valid amount.");
    if (amt < settings.minWithdrawal) {
      return toast.error(`Minimum withdrawal is ${formatXof(settings.minWithdrawal)}.`);
    }
    if (amt > (wallet?.balance ?? 0)) return toast.error("Insufficient balance.");

    const w = wallet ?? { balance: 0, bonusBalance: 0, currency: "GMD" as const, frozen: false, updatedAt: null };
    const playthroughBlock = withdrawalPlaythroughBlockMessage(w, settings);
    if (playthroughBlock) {
      return toast.error(playthroughBlock);
    }

    if (requiresWithdrawalOtp && !withdrawalOtp.otpVerified) {
      setWithdrawStep("otp");
      return toast.error("Verify your mobile number before withdrawing.");
    }

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

  const w = wallet ?? { balance: 0, bonusBalance: 0, currency: "GMD" as const, frozen: false, updatedAt: null };
  const { depositRate, bonusMultiplier } = playthroughRates(settings);
  const playthroughBlock = withdrawalPlaythroughBlockMessage(w, settings);
  const withdrawBlocked = Boolean(playthroughBlock);
  const wagerRequired = depositPlaythroughRequired(w, depositRate);
  const wagerRemaining = depositPlaythroughRemaining(w, settings);
  const bonusWagerLeft = bonusWageringRemaining(w);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_280px]">
        <div>
          <WalletBalanceCards wallet={wallet} bonusGamesLabel={settings.bonusGamesLabel} />
          {frozen && (
            <div className="mt-4">
              <WalletFrozenNotice />
            </div>
          )}
        </div>
        {!frozen && (
          <BonusOffersPanel
            bonuses={mergeBonusSettings(settings.bonuses)}
            bonusGamesLabel={settings.bonusGamesLabel}
            bonusIntroText={settings.bonusIntroText}
            bonusCampaignEndsAt={settings.bonusCampaignEndsAt}
          />
        )}
      </div>

      <div className="mb-5 grid grid-cols-4 rounded-lg bg-slate-900 p-1 text-sm font-medium">
        {(["history", "deposit", "withdraw", "refer"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => !frozen || t === "history" || t === "refer" ? setTab(t) : undefined}
            disabled={frozen && t !== "history" && t !== "refer"}
            className={`rounded-md py-2 capitalize transition-colors ${
              tab === t ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-white"
            } ${frozen && t !== "history" ? "cursor-not-allowed opacity-40" : ""}`}
          >
            {t === "refer" ? "Refer" : t}
          </button>
        ))}
      </div>

      {tab === "history" && (
        <>
          {!transactions || transactions.length === 0 ? (
            <EmptyState message="No transactions yet." />
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

      {tab === "deposit" && !frozen && (
        <Card>
          <h2 className="mb-2 font-semibold">Deposit via ModemPay</h2>
          <p className="mb-4 text-sm text-slate-400">
            Deposits from GMD {MIN_DEPOSIT_GMD} and above. Wave, AfriMoney, APS, QMoney or card.
          </p>
          <Button className="w-full" onClick={() => setDepositOpen(true)}>
            Open payment methods
          </Button>
        </Card>
      )}

      {tab === "withdraw" && !frozen && (
        <Card>
          {withdrawStep === "otp" ? (
            <>
              <h2 className="mb-2 font-semibold">Verify withdrawal</h2>
              <p className="mb-4 text-sm text-slate-400">
                Confirm your mobile number before we send your payout.
              </p>
              <OtpConfirmPanel
                phone={otpPhone}
                otp={withdrawalOtp}
                disabled={busy}
                autoSend={false}
                onBack={() => {
                  setWithdrawOtpDismissed(true);
                  setWithdrawStep("form");
                }}
                headline="Confirm payout phone"
                subline="Tap Send SMS code, then enter the code to authorize this withdrawal."
              />
            </>
          ) : (
            <>
          <h2 className="mb-4 font-semibold">Withdraw to mobile money</h2>

          {(wagerRequired > 0 || bonusWagerLeft > 0) && (
            <div className="mb-4 space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
              {wagerRequired > 0 && (
                <p>
                  {withdrawBlocked ? (
                    <>
                      <strong>Withdrawal locked.</strong> Play <strong>{formatXof(wagerRemaining)}</strong> more (
                      {Math.round(depositRate * 100)}% of {formatXof(w.pendingDepositTotal ?? 0)} deposited) before
                      you can withdraw. Deposited money cannot be taken back without playing.
                    </>
                  ) : (
                    <>Deposit play-through complete — withdrawals unlocked.</>
                  )}
                </p>
              )}
              {bonusWagerLeft > 0 && (
                <p>
                  Bonus: wager <strong>{formatXof(bonusWagerLeft)}</strong> more ({bonusMultiplier}× rule) to
                  convert bonus to withdrawable cash.
                </p>
              )}
            </div>
          )}

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
              placeholder="e.g. 7701234"
              value={withdrawPhone}
              onChange={(e) => setWithdrawPhone(e.target.value)}
            />
            <Input
              label={`Amount (min ${formatXof(settings.minWithdrawal)})`}
              type="number"
              min={settings.minWithdrawal}
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
            />
            {withdrawBlocked && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {playthroughBlock}
              </p>
            )}
            {requiresWithdrawalOtp && withdrawalOtp.otpVerified && (
              <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300">
                Payout phone verified — you can withdraw now
              </p>
            )}
            {requiresWithdrawalOtp && withdrawPhoneComplete && !withdrawalOtp.otpVerified && (
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setWithdrawOtpDismissed(false);
                  setWithdrawStep("otp");
                }}
              >
                Verify phone to withdraw
              </Button>
            )}
            <Button
              className="w-full"
              disabled={busy || withdrawBlocked || (requiresWithdrawalOtp && !withdrawalOtp.otpVerified)}
              onClick={submitMobileWithdrawal}
            >
              {busy ? "Processing…" : "Withdraw via ModemPay"}
            </Button>
            <p className="whitespace-pre-line text-xs text-slate-500">{withdrawalRulesCopy(settings)}</p>
          </div>
            </>
          )}
        </Card>
      )}

      {tab === "refer" && <ReferralPanel />}

      <ClientErrorBoundary label="ModemPay checkout">
        {depositOpen && !frozen ? (
          <PaymentSheet
            isOpen
            onClose={() => {
              setDepositOpen(false);
              setDepositPrefill(undefined);
            }}
            user={{
              id: fbUser.uid,
              name: profile.name,
              phone: profile.phone || undefined,
              walletBalance: wallet?.balance ?? 0,
            }}
            initialAmount={depositPrefill}
            minDeposit={MIN_DEPOSIT_GMD}
            frozen={frozen}
            floatingKeypad
            onDepositRequest={handleCreateDepositRequest}
          />
        ) : null}
      </ClientErrorBoundary>
      <PaymentResultModal result={paymentResult} onClose={() => setPaymentResult(null)} />
    </div>
  );
}
