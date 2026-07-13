"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAgentCustomerIds } from "@/lib/hooks/useAgentCustomerIds";
import { AdminPlatformSummary } from "@/components/accounts/AdminPlatformSummary";
import { AdminAccountBook } from "@/components/accounts/AdminAccountBook";
import { AgentSalesSummary } from "@/components/accounts/AgentSalesSummary";
import { ModemPayDepositsPanel } from "@/components/accounts/ModemPayDepositsPanel";
import { ModemPayWithdrawalsPanel } from "@/components/accounts/ModemPayWithdrawalsPanel";
import { LedgerTransactionsPanel } from "@/components/accounts/LedgerTransactionsPanel";
import { AgentCommissionsPanel } from "@/components/accounts/AgentCommissionsPanel";
import { AgentCashDeskBook } from "@/components/accounts/AgentCashDeskBook";
import { AgentServeAnyCustomer } from "@/components/agent/AgentCashDesk";
import { ClientErrorBoundary } from "@/components/ClientErrorBoundary";

const ADMIN_TABS = [
  { id: "book", label: "Full account book" },
  { id: "summary", label: "Summary" },
  { id: "deposits", label: "ModemPay Deposits" },
  { id: "withdrawals", label: "ModemPay Withdrawals" },
  { id: "transactions", label: "All Transactions" },
  { id: "agents", label: "Agent Commissions" },
] as const;

const AGENT_TABS = [
  { id: "sales", label: "My Sales" },
  { id: "cashdesk", label: "Cash desk book" },
  { id: "deposits", label: "ModemPay Deposits" },
  { id: "withdrawals", label: "ModemPay Withdrawals" },
  { id: "transactions", label: "My Transactions" },
  { id: "commissions", label: "My Commissions" },
] as const;

type AdminTab = (typeof ADMIN_TABS)[number]["id"];
type AgentTab = (typeof AGENT_TABS)[number]["id"];

export function AccountsHub() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const searchParams = useSearchParams();
  const initial = searchParams.get("tab") || (isAdmin ? "book" : "sales");
  const [tab, setTab] = useState<string>(initial);
  const { customerIds, customerNames } = useAgentCustomerIds(isAdmin ? undefined : profile?.uid);

  const adminTab = ADMIN_TABS.some((t) => t.id === tab) ? (tab as AdminTab) : "book";
  const agentTab = AGENT_TABS.some((t) => t.id === tab) ? (tab as AgentTab) : "sales";

  const scopeLabel = useMemo(
    () => (isAdmin ? "All platform customers" : "Your customers only"),
    [isAdmin]
  );

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-violet-400">
          {isAdmin ? "Admin accounts" : "Agent accounts"}
        </p>
        <h1 className="text-xl font-bold">
          {isAdmin ? "GGR · QTech · ModemPay · Agents" : "Sales · Payments · Commissions"}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          {isAdmin
            ? "Full account book (time, Player ID, deposit/withdraw, agent), GGR, ModemPay, and commissions."
            : "See your sales (GGR), cash desk book, ModemPay payments, and commission."}
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-1 rounded-xl bg-slate-900/80 p-1">
        {(isAdmin ? ADMIN_TABS : AGENT_TABS).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              (isAdmin ? adminTab : agentTab) === t.id
                ? "bg-emerald-500 text-slate-950"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isAdmin ? (
        <>
          {adminTab === "book" && (
            <ClientErrorBoundary label="Full account book">
              <AdminAccountBook />
            </ClientErrorBoundary>
          )}
          {adminTab === "summary" && <AdminPlatformSummary />}
          {adminTab === "deposits" && (
            <ClientErrorBoundary label="ModemPay deposits">
              <ModemPayDepositsPanel customerIds={null} scopeLabel={scopeLabel} />
            </ClientErrorBoundary>
          )}
          {adminTab === "withdrawals" && (
            <ModemPayWithdrawalsPanel customerIds={null} scopeLabel={scopeLabel} />
          )}
          {adminTab === "transactions" && (
            <LedgerTransactionsPanel scopeLabel="Full platform ledger" />
          )}
          {adminTab === "agents" && <AgentCommissionsPanel adminView />}
        </>
      ) : (
        <>
          <AgentServeAnyCustomer />
          {agentTab === "sales" && <AgentSalesSummary />}
          {agentTab === "cashdesk" && (
            <ClientErrorBoundary label="Cash desk book">
              <AgentCashDeskBook />
            </ClientErrorBoundary>
          )}
          {agentTab === "deposits" && (
            <ClientErrorBoundary label="ModemPay deposits">
              <ModemPayDepositsPanel
                customerIds={customerIds}
                customerNames={customerNames}
                scopeLabel={scopeLabel}
              />
            </ClientErrorBoundary>
          )}
          {agentTab === "withdrawals" && (
            <ModemPayWithdrawalsPanel
              customerIds={customerIds}
              customerNames={customerNames}
              scopeLabel={scopeLabel}
            />
          )}
          {agentTab === "transactions" && (
            <LedgerTransactionsPanel scopeLabel="Your wallet, your customers, and your cash desk moves" />
          )}
          {agentTab === "commissions" && <AgentCommissionsPanel adminView={false} />}
        </>
      )}
    </div>
  );
}
