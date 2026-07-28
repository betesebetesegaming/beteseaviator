"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAgentCustomerIds } from "@/lib/hooks/useAgentCustomerIds";
import { AdminPlatformSummary } from "@/components/accounts/AdminPlatformSummary";
import { AdminMonthlyAccounts } from "@/components/accounts/AdminMonthlyAccounts";
import { AdminAccountBook } from "@/components/accounts/AdminAccountBook";
import { AdminAgentsCashBook } from "@/components/accounts/AdminAgentsCashBook";
import { AgentAccountBook } from "@/components/accounts/AgentAccountBook";
import { AgentSalesSummary } from "@/components/accounts/AgentSalesSummary";
import { ModemPayLedger } from "@/components/accounts/ModemPayLedger";
import { LedgerTransactionsPanel } from "@/components/accounts/LedgerTransactionsPanel";
import { AgentCommissionsPanel } from "@/components/accounts/AgentCommissionsPanel";
import { AgentCashDeskBook } from "@/components/accounts/AgentCashDeskBook";
import { AgentServeAnyCustomer } from "@/components/agent/AgentCashDesk";
import { ClientErrorBoundary } from "@/components/ClientErrorBoundary";

const ADMIN_TABS = [
  { id: "monthly", label: "Month by month" },
  { id: "agentcash", label: "Agent cash desk" },
  { id: "book", label: "Money book" },
  { id: "modempay", label: "Wave ledger" },
  { id: "summary", label: "This week / month" },
  { id: "transactions", label: "Full ledger" },
  { id: "agents", label: "Commissions" },
] as const;

const AGENT_TABS = [
  { id: "book", label: "Account book" },
  { id: "cashdesk", label: "Cash daybook" },
  { id: "modempay", label: "Wave ledger" },
  { id: "commissions", label: "Commissions" },
  { id: "sales", label: "Sales detail" },
  { id: "transactions", label: "Full ledger" },
] as const;

type AdminTab = (typeof ADMIN_TABS)[number]["id"];
type AgentTab = (typeof AGENT_TABS)[number]["id"];

function normalizeTab(raw: string | null, isAdmin: boolean): string {
  if (!raw) return isAdmin ? "monthly" : "book";
  // Old deep-links
  if (raw === "deposits" || raw === "withdrawals") return "modempay";
  if (!isAdmin && raw === "sales") return raw; // still valid as Sales detail
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
  const agentTab = AGENT_TABS.some((t) => t.id === tab) ? (tab as AgentTab) : "book";

  const scopeLabel = useMemo(
    () => (isAdmin ? "All platform customers" : "Your customers only"),
    [isAdmin],
  );

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-violet-400">
          {isAdmin ? "Admin accounts" : "Agent accounts"}
        </p>
        <h1 className="text-xl font-bold">
          {isAdmin ? "Books — cash desk · Wave · P&L" : "My books — cash · Wave · commission"}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          {isAdmin
            ? "Platform books: agent shop cash for remittance, Wave/ModemPay, month P&L, and commissions. Cash desk and Wave stay separate."
            : "One clear account book for your shop. Cash desk (physical) is separate from Wave (mobile money) and from your commission wallet."}
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
          {adminTab === "agentcash" && (
            <ClientErrorBoundary label="Agent cash desk">
              <AdminAgentsCashBook />
            </ClientErrorBoundary>
          )}
          {adminTab === "modempay" && (
            <ClientErrorBoundary label="Wave ledger">
              <ModemPayLedger customerIds={null} scopeLabel={scopeLabel} />
            </ClientErrorBoundary>
          )}
          {adminTab === "book" && (
            <ClientErrorBoundary label="Money book">
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
          {agentTab === "book" && (
            <ClientErrorBoundary label="Agent account book">
              <AgentAccountBook />
            </ClientErrorBoundary>
          )}
          {agentTab === "cashdesk" && (
            <ClientErrorBoundary label="Cash daybook">
              <AgentCashDeskBook />
            </ClientErrorBoundary>
          )}
          {agentTab === "modempay" && (
            <ClientErrorBoundary label="Wave ledger">
              <ModemPayLedger
                customerIds={customerIds}
                customerNames={customerNames}
                scopeLabel={scopeLabel}
              />
            </ClientErrorBoundary>
          )}
          {agentTab === "sales" && <AgentSalesSummary />}
          {agentTab === "transactions" && (
            <LedgerTransactionsPanel scopeLabel="Your wallet, your customers, and your cash desk moves" />
          )}
          {agentTab === "commissions" && <AgentCommissionsPanel adminView={false} />}
        </>
      )}
    </div>
  );
}
