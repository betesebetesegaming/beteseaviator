"use client";

import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { Banknote, HandCoins, Search } from "lucide-react";
import {
  agentOtcCashDeposit,
  agentOtcCashWithdraw,
  agentLookupCustomer,
  adminOtcCashDeposit,
  adminOtcCashWithdraw,
  errorMessage,
} from "@/lib/api";
import { formatPlayerId, playerDisplayId } from "@/lib/playerId";
import { formatXof } from "@/lib/format";
import { CustomerOtpGate } from "@/components/shared/CustomerOtpGate";
import type { UserProfile } from "@/lib/types";
import { Button, Card, Input, Modal } from "@/components/ui";

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
      title={mode === "deposit" ? `Credit (cash) — ${customer.name}` : `Withdraw — ${customer.name}`}
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
                  ? "Credit wallet (cash)"
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
          title="Credit customer from your own agent balance"
        >
          <span className="flex items-center gap-1">
            <Banknote size={13} /> Credit (balance)
          </span>
        </Button>
        {showCash ? (
          <>
            <Button
              variant="secondary"
              className="!px-2.5 !py-1 text-xs text-emerald-200"
              onClick={() => setCashMode("deposit")}
              title="Customer paid physical cash — credit their wallet"
            >
              <span className="flex items-center gap-1">
                <Banknote size={13} /> Credit (cash)
              </span>
            </Button>
            <Button
              variant="secondary"
              className="!px-2.5 !py-1 text-xs text-amber-200"
              onClick={() => setCashMode("withdraw")}
              title="Pay customer cash — generates withdrawal code"
            >
              <span className="flex items-center gap-1">
                <HandCoins size={13} /> Withdraw
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

/**
 * Cash-desk agents can serve ANY customer — including people who opened their own
 * account and are not in the agent's network. Look them up by Player ID or phone,
 * then Credit (cash) / Withdraw. Only rendered when the agent's cash desk is on.
 */
export function AgentServeAnyCustomer({ cashOpsEnabled }: { cashOpsEnabled: boolean }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlayerRow | null>(null);
  const [mode, setMode] = useState<"deposit" | "withdraw" | null>(null);

  async function find(e?: FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return toast.error("Enter a Player ID or phone number.");
    setBusy(true);
    try {
      const c = await agentLookupCustomer({ query: q });
      // Only the fields AgentCashDeskModal needs; cast through unknown to satisfy PlayerRow.
      setResult({
        uid: c.uid,
        name: c.name,
        phone: c.phone,
        playerNumber: c.playerNumber ?? undefined,
        balance: c.balance,
        role: "player",
        status: "active",
      } as unknown as PlayerRow);
    } catch (err) {
      setResult(null);
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!cashOpsEnabled) {
    return (
      <Card className="mb-5 border-dashed border-white/10 p-4 opacity-90">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-300">
          <Search size={15} /> Credit / withdraw by Player ID or phone
        </div>
        <p className="text-xs text-slate-500">
          Look up any customer with <span className="font-mono text-slate-400">BTE-00001</span> or
          their phone, then Credit (cash) or Withdraw. Ask BETESE admin to turn on{" "}
          <strong className="text-slate-400">Cash desk</strong> for your account first.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mb-5 p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
        <Search size={15} /> Credit / withdraw by Player ID or phone
      </div>
      <p className="mb-3 text-xs text-slate-400">
        Enter <span className="font-mono text-slate-300">BTE-00001</span> (or{" "}
        <span className="font-mono text-slate-300">1</span>) or the customer&apos;s Gambian phone
        number, then Credit (cash) or Withdraw. Works for walk-ins, not only your network.
      </p>
      <form onSubmit={find} className="flex gap-2">
        <Input
          placeholder="BTE-00001 or phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Finding…" : "Find"}
        </Button>
      </form>

      {result ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2.5">
          <div className="text-sm">
            <span className="font-mono font-semibold text-emerald-300">
              {playerDisplayId(result)}
            </span>{" "}
            <span className="font-medium">{result.name}</span>
            <span className="text-slate-400">
              {" "}
              · {result.phone || "no phone"} · Balance{" "}
              {result.balance === undefined ? "—" : formatXof(result.balance)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="!px-2.5 !py-1 text-xs text-emerald-200"
              onClick={() => setMode("deposit")}
            >
              <span className="flex items-center gap-1">
                <Banknote size={13} /> Credit (cash)
              </span>
            </Button>
            <Button
              variant="secondary"
              className="!px-2.5 !py-1 text-xs text-amber-200"
              onClick={() => setMode("withdraw")}
            >
              <span className="flex items-center gap-1">
                <HandCoins size={13} /> Withdraw
              </span>
            </Button>
          </div>
        </div>
      ) : null}

      {mode && result ? (
        <AgentCashDeskModal
          cashOpsEnabled={cashOpsEnabled}
          customer={result}
          mode={mode}
          onClose={() => {
            setMode(null);
            void find();
          }}
        />
      ) : null}
    </Card>
  );
}
