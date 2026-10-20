"use client";

import { useCallback, useEffect, useState } from "react";
import { Home, Users, Share2, MessageSquare, Shield, LogOut, Briefcase } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { mk, mkError, type MkState } from "@/lib/marketersApi";
import { HomeTab } from "./HomeTab";
import { CustomersTab } from "./CustomersTab";
import { InviteTab } from "./InviteTab";
import { SmsTab } from "./SmsTab";
import { OwnerTab } from "./OwnerTab";
import { BusinessTab } from "./BusinessTab";
import { Btn, ErrorLine, Loading } from "./ui";

type Tab = "home" | "customers" | "invite" | "sms" | "business" | "owner";

const TABS: { id: Tab; label: string; icon: typeof Home; ownerOnly?: boolean }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "customers", label: "Customers", icon: Users },
  { id: "invite", label: "Invite", icon: Share2 },
  { id: "sms", label: "SMS", icon: MessageSquare },
  { id: "business", label: "Business", icon: Briefcase },
  { id: "owner", label: "Owner", icon: Shield, ownerOnly: true },
];

function tabFromHash(): Tab {
  if (typeof window === "undefined") return "home";
  const h = window.location.hash.replace("#", "") as Tab;
  return TABS.some((t) => t.id === h) ? h : "home";
}

export function MarketersApp() {
  const { logout } = useAuth();
  const [state, setState] = useState<MkState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(
    () =>
      mk<MkState>("state").then(
        (s) => {
          setState(s);
          setError(null);
        },
        (e) => setError(mkError(e)),
      ),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const setTab = (t: Tab) => {
    setTabState(t);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `#${t}`);
    window.scrollTo?.(0, 0);
  };

  if (!state) {
    return (
      <div className="mx-auto max-w-md p-4">
        {error ? (
          <div className="space-y-3 pt-10 text-center">
            <ErrorLine message={error} />
            <Btn onClick={() => void load()}>Try again</Btn>
          </div>
        ) : (
          <Loading />
        )}
      </div>
    );
  }

  const owner = state.me.role === "owner";
  const tabs = TABS.filter((t) => !t.ownerOnly || owner);

  return (
    <div className="flex min-h-full flex-col pb-20 md:pb-6">
      <header className="bg-[#0b2a5b] text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-sm font-extrabold tracking-wide">BETESE MARKETERS</p>
            <p className="text-xs text-blue-100">
              {state.me.name} · {owner ? "Owner" : "Marketer"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm text-blue-100 hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </div>
        <nav className="mx-auto hidden max-w-5xl gap-1 px-4 md:flex" aria-label="Sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${tab === t.id ? "bg-slate-100 text-[#0b2a5b]" : "text-blue-100 hover:bg-white/10"}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-4">
        {tab === "home" && (
          <HomeTab
            state={state}
            onAddCustomer={() => {
              setAddOpen(true);
              setTab("customers");
            }}
          />
        )}
        {tab === "customers" && <CustomersTab state={state} addOpen={addOpen} setAddOpen={setAddOpen} />}
        {tab === "invite" && <InviteTab state={state} />}
        {tab === "sms" && <SmsTab state={state} />}
        {tab === "business" && <BusinessTab state={state} />}
        {tab === "owner" && owner && <OwnerTab state={state} reloadState={load} />}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-10 grid border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        aria-label="Sections"
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${active ? "font-semibold text-[#0b2a5b]" : "text-slate-500"}`}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
