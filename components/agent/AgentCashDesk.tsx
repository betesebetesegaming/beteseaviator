"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Banknote, HandCoins } from "lucide-react";
import {
  agentOtcCashDeposit,
  agentOtcCashWithdraw,
  adminOtcCashDeposit,
  adminOtcCashWithdraw,
  errorMessage,
} from "@/lib/api";
import { formatPlayerId, playerDisplayId } from "@/lib/playerId";
import { formatXof } from "@/lib/format";
import { CustomerOtpGate } from "@/components/shared/CustomerOtpGate";
import type { UserProfile } from "@/lib/types";
import { Button, Input, Modal } from "@/components/ui";

type PlayerRow = UserProfile & { balance?: number };

type Props = {
  cashOpsEnabled: boolean;
  customer: PlayerRow;
  onClose: () => void;
  mode: "deposit" | "withdraw";
  /** Admin acts on any customer via the admin callables (no cash-desk gate). */
  isAdmin?: boolean;
};

export function AgentCashDeskModal({ cashOpsEnabled, customer, onClose, mode, isAdmin }: Props) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [withdrawalCode, setWithdrawalCode] = useState<string | null>(null);

  const playerId = playerDisplayId(customer);
  const officeId = customer.playerNumber ? formatPlayerId(customer.playerNumber) : null;

  async function submit() {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Enter a valid amount.");
    if (!isAdmin && !cashOpsEnabled) {
      return toast.error("Cash desk is not enabled. Ask admin to turn it on.");
    }
    if (!verified) {
      return toast.error("Get the customer's code and verify it first.");
    }

    setBusy(true);
    try {
      if (mode === "deposit") {
        const depositFn = isAdmin ? adminOtcCashDeposit : agentOtcCashDeposit;
        await depositFn({ customerId: customer.uid, amount: amt });
        toast.success(`Cash deposit ${formatXof(amt)} credited to ${customer.name}.`);
        onClose();
      } else {
        if (amt > (customer.balance ?? 0)) {
          return toast.error("Customer balance is too low.");
        }
        const withdrawFn = isAdmin ? adminOtcCashWithdraw : agentOtcCashWithdraw;
        const res = await withdrawFn({ customerId: customer.uid, amount: amt });
        setWithdrawalCode(res.withdrawalCode);
        toast.success("Cash withdrawal recorded.");
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "deposit" ? `Cash deposit — ${customer.name}` : `Cash withdraw — ${customer.name}`}
    >
      <div className="space-y-4">
        {officeId ? (
          <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
            Player ID: <span className="font-mono font-semibold">{officeId}</span>
          </p>
        ) : (
          <p className="text-sm text-slate-400">Player ID: {playerId}</p>
        )}

        {withdrawalCode ? (
          <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-200">
              Withdrawal code — give to customer
            </p>
            <p className="font-mono text-2xl font-bold tracking-wide text-white">{withdrawalCode}</p>
            <p className="text-sm text-slate-300">
              {formatXof(Number(amount))} paid in cash to {customer.name}
            </p>
            <p className="text-xs text-slate-500">
              Keep this code for your office records. It includes the customer Player ID.
            </p>
            <Button className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-400">
              {mode === "deposit" ? (
                <>
                  Customer gave you physical cash — this credits their wallet directly (does not use
                  your commission balance).
                </>
              ) : (
                <>
                  Pay the customer cash from the shop — their wallet is debited and you receive a
                  withdrawal code with their Player ID.
                </>
              )}
            </p>
            <p className="text-sm text-slate-500">
              Balance: {customer.balance === undefined ? "—" : formatXof(customer.balance)}
            </p>
            <Input
              label="Amount (GMD)"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <CustomerOtpGate
              phone={customer.phone}
              customerName={customer.name}
              verified={verified}
              onVerified={() => setVerified(true)}
            />
            <Button
              className="w-full"
              onClick={() => void submit()}
              disabled={busy || !verified}
            >
              {busy
                ? "Processing…"
                : mode === "deposit"
                  ? "Record cash deposit"
                  : "Pay cash & get code"}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}

type RowActionsProps = {
  customer: PlayerRow;
  cashOpsEnabled: boolean;
  onFloatDeposit: () => void;
  /** Admin sees cash actions for any customer, no cash-desk gate. */
  isAdmin?: boolean;
};

export function AgentCustomerCashActions({
  customer,
  cashOpsEnabled,
  onFloatDeposit,
  isAdmin,
}: RowActionsProps) {
  const [cashMode, setCashMode] = useState<"deposit" | "withdraw" | null>(null);
  const showCash = isAdmin || cashOpsEnabled;

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="secondary"
          className="!px-2.5 !py-1 text-xs"
          onClick={onFloatDeposit}
          title="Transfer from your agent commission balance"
        >
          <span className="flex items-center gap-1">
            <Banknote size={13} /> Float
          </span>
        </Button>
        {showCash ? (
          <>
            <Button
              variant="secondary"
              className="!px-2.5 !py-1 text-xs text-emerald-200"
              onClick={() => setCashMode("deposit")}
              title="Physical cash received at shop"
            >
              <span className="flex items-center gap-1">
                <Banknote size={13} /> + Cash
              </span>
            </Button>
            <Button
              variant="secondary"
              className="!px-2.5 !py-1 text-xs text-amber-200"
              onClick={() => setCashMode("withdraw")}
              title="Pay customer cash — generates withdrawal code"
            >
              <span className="flex items-center gap-1">
                <HandCoins size={13} /> − Cash
              </span>
            </Button>
          </>
        ) : null}
      </div>
      {cashMode ? (
        <AgentCashDeskModal
          cashOpsEnabled={cashOpsEnabled}
          isAdmin={isAdmin}
          customer={customer}
          mode={cashMode}
          onClose={() => setCashMode(null)}
        />
      ) : null}
    </>
  );
}
