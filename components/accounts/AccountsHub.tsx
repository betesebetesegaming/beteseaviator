"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAgentCustomerIds } from "@/lib/hooks/useAgentCustomerIds";
import { AdminPlatformSummary } from "@/components/accounts/AdminPlatformSummary";
import { AdminMonthlyAccounts } from "@/components/accounts/AdminMonthlyAccounts";
import { AdminAccountBook } from "@/components/accounts/AdminAccountBook";
import { AgentSalesSummary } from "@/components/accounts/AgentSalesSummary";
import { ModemPayLedger } from "@/components/accounts/ModemPayLedger";
import { LedgerTransactionsPanel } from "@/components/accounts/LedgerTransactionsPanel";
import { AgentCommissionsPanel } from "@/components/accounts/AgentCommissionsPanel";
import { AgentCashDeskBook } from "@/components/accounts/AgentCashDeskBook";
import { AgentServeAnyCustomer } from "@/components/agent/AgentCashDesk";
import { ClientErrorBoundary } from "@/components/ClientErrorBoundary";

const ADMIN_TABS = [
  { id: "monthly", label: "Month by month" },
  { id: "modempay", label: "ModemPay ledger" },
  { id: "book", label: "Customer deposits book" },
  { id: "summary", label: "This week / month" },
  { id: "transactions", label: "All Transactions" },
  { id: "agents", label: "Agent Commissions" },
] as const;

const AGENT_TABS = [
  { id: "sales", label: "My Sales" },
  { id: "cashdesk", label: "Cash desk book" },
  { id: "modempay", label: "ModemPay ledger" },
  { id: "transactions", label: "My Transactions" },
  { id: "commissions", label: "My Commissions" },
] as const;

type AdminTab = (typeof ADMIN_TABS)[number]["id"];
type AgentTab = (typeof AGENT_TABS)[number]["id"];

function normalizeTab(raw: string | null, isAdmin: boolean): string {
  if (!raw) return isAdmin ? "monthly" : "sales";
  // Old deep-links still land on the unified ModemPay ledger.
  if (raw === "deposits" || raw === "withdrawals") return "modempay";
  return raw;
}

export function AccountsHub() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const searchParams = useSearchParams();
  const initial = normalizeTab(searchParams.get("tab"), isAdmin);
  const [tab, setTab] = useState<string>(initial);
  const { customerIds, customerNames } = useAgentCustomerIds(isAdmin ? undefined : profile?.uid);

  const adminTab = ADMIN_TABS.some((t) => t.id === tab) ? (tab as AdminTab) : "monthly";
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
          {isAdmin ? "Accounts — sales, vendors & profit" : "Sales · Payments · Commissions"}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          {isAdmin
            ? "Betese Aviator books: month-by-month P&L, ModemPay day/week/month cash for fee reconciliation, and agent commissions. Aviator ModemPay is separate from Betese PMU."
            : "See your sales (GGR), cash desk book, ModemPay day/week/month payments, and commission."}
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
          {adminTab === "monthly" && (
            <ClientErrorBoundary label="Month by month accounts">
              <AdminMonthlyAccounts />
            </ClientErrorBoundary>
          )}
          {adminTab === "modempay" && (
            <ClientErrorBoundary label="ModemPay ledger">
              <ModemPayLedger customerIds={null} scopeLabel={scopeLabel} />
            </ClientErrorBoundary>
          )}
          {adminTab === "book" && (
            <ClientErrorBoundary label="Full account book">
              <AdminAccountBook />
            </ClientErrorBoundary>
          )}
          {adminTab === "summary" && <AdminPlatformSummary />}
          {adminTab === "transactions" && (
            <LedgerTransactionsPanel scopeLabel="Full platform ledger" />
          )}
          {adminTab === "agents" && <AgentCommissionsPanel adminView />}
        </>
      ) : (
        <>
          <AgentServeAnyCustomer cashOpsEnabled={!!profile?.cashOpsEnabled} />
          {agentTab === "sales" && <AgentSalesSummary />}
          {agentTab === "cashdesk" && (
            <ClientErrorBoundary label="Cash desk book">
              <AgentCashDeskBook />
            </ClientErrorBoundary>
          )}
          {agentTab === "modempay" && (
            <ClientErrorBoundary label="ModemPay ledger">
              <ModemPayLedger
                customerIds={customerIds}
                customerNames={customerNames}
                scopeLabel={scopeLabel}
              />
            </ClientErrorBoundary>
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
