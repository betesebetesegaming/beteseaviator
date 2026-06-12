"use client";

import { useEffect, useState } from "react";
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
import { requestWithdrawal, errorMessage } from "@/lib/api";
import { formatSigned, formatXof, formatDate } from "@/lib/format";
import {
  DEFAULT_SETTINGS,
  PROVIDER_LABELS,
  type PaymentProvider,
  type PlatformSettings,
  type WalletTransaction,
} from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  TableShell,
  Td,
  Th,
} from "@/components/ui";

export default function AgentWalletPage() {
  const { fbUser, wallet } = useAuth();
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [transactions, setTransactions] = useState<WalletTransaction[] | null>(null);

  const [provider, setProvider] = useState<PaymentProvider>("wave");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return onSnapshot(doc(db, "settings", "platform"), (snap) => {
      if (snap.exists()) setSettings({ ...DEFAULT_SETTINGS, ...(snap.data() as PlatformSettings) });
    });
  }, []);

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

  async function withdraw() {
    const amt = Number(amount);
    if (!phone.trim()) return toast.error("Enter your payout phone number.");
    if (!Number.isFinite(amt) || amt < settings.minWithdrawal)
      return toast.error(`Minimum withdrawal is ${formatXof(settings.minWithdrawal)}.`);
    if (amt > (wallet?.balance ?? 0)) return toast.error("Insufficient balance.");
    setBusy(true);
    try {
      await requestWithdrawal({ provider, phone: phone.trim(), amount: amt });
      toast.success("Withdrawal requested — BETESE will review and release the payout.", {
        duration: 6000,
      });
      setAmount("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const enabledProviders = (
    Object.keys(PROVIDER_LABELS) as PaymentProvider[]
  ).filter((p) => settings.providers?.[p] !== false);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-bold">My Commission Wallet</h1>
      <p className="mb-6 text-sm text-slate-400">
        Funded by your commissions and transfers. Withdraw any time — payouts are released by
        BETESE.
      </p>

      <div className="grid gap-5 md:grid-cols-[1fr_1.4fr]">
        <div className="space-y-5">
          <Card className="bg-gradient-to-br from-emerald-500/10 to-transparent text-center">
            <p className="text-xs uppercase tracking-widest text-slate-400">Commission Due</p>
            <p className="mt-1 text-3xl font-black text-emerald-300">
              {formatXof(wallet?.balance ?? 0)}
            </p>
          </Card>

          <Card>
            <h2 className="mb-4 font-semibold">Withdraw Commission</h2>
            <div className="space-y-4">
              <Select
                label="Provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value as PaymentProvider)}
              >
                {enabledProviders.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </option>
                ))}
              </Select>
              <Input
                label="Payout phone number"
                type="tel"
                placeholder="e.g. 7701234"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <Input
                label={`Amount (min ${formatXof(settings.minWithdrawal)})`}
                type="number"
                min={settings.minWithdrawal}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Button className="w-full" onClick={withdraw} disabled={busy}>
                {busy ? "Submitting…" : "Request Withdrawal"}
              </Button>
            </div>
          </Card>
        </div>

        <div>
          <h2 className="mb-3 font-semibold">Wallet activity</h2>
          {!transactions || transactions.length === 0 ? (
            <EmptyState message="No wallet activity yet." />
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
        </div>
      </div>
    </div>
  );
}
