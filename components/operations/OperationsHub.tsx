"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Radio,
  Receipt,
  Users,
  UserPlus,
  UserCog,
  RefreshCw,
  Shield,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getOperationsHub, type OperationsHubResponse, errorMessage } from "@/lib/api";
import { formatDate, formatSigned, formatXof } from "@/lib/format";
import type { Role, TransactionType } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Select, TableShell, Td, Th } from "@/components/ui";

const TABS = ["overview", "live", "transactions", "network"] as const;
type Tab = (typeof TABS)[number];

const TX_TYPES: TransactionType[] = [
  "deposit",
  "withdrawal",
  "bet",
  "win",
  "commission",
  "transfer",
  "refund",
  "bonus",
];

export function OperationsHub() {
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const isSuper = profile?.role === "super_agent";

  const initialTab = (searchParams.get("tab") as Tab) || "overview";
  const [tab, setTab] = useState<Tab>(TABS.includes(initialTab) ? initialTab : "overview");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<OperationsHubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await getOperationsHub({
        type: typeFilter === "all" ? undefined : typeFilter,
        limit: 200,
      });
      setData(res);
    } catch (e) {
      console.error(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const filteredTx = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.transactions;
    return data.transactions.filter(
      (t) =>
        t.userId.toLowerCase().includes(q) ||
        (t.userName ?? "").toLowerCase().includes(q) ||
        t.reference.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  }, [data, search]);

  const filteredLive = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const online = data.live.filter((r) => r.online);
    if (!q) return online;
    return online.filter(
      (r) => r.name.toLowerCase().includes(q) || r.uid.toLowerCase().includes(q)
    );
  }, [data, search]);

  const filteredNetwork = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.network;
    return data.network.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.phone ?? "").includes(q) ||
        (m.agentSlug ?? "").includes(q)
    );
  }, [data, search]);

  const title = isAdmin ? "Platform operations" : "Agent operations";
  const subtitle = isAdmin
    ? "Live activity, full transaction ledger, and every user on BETESE — one place."
    : "Your customers, sub-agents, live activity, and network transactions — one place.";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">
            {isAdmin ? "Admin backend" : "Agent backend"}
          </p>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">{subtitle}</p>
        </div>
        <Button variant="secondary" className="gap-2" onClick={() => void load()} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-900/80 p-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-2 text-sm font-medium capitalize transition ${
              tab === t
                ? "bg-emerald-500 text-slate-950"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            {t === "network" ? "People" : t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs uppercase text-slate-500">Live now</p>
              <p className="mt-1 text-2xl font-bold text-emerald-300">{data?.liveOnline ?? "—"}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase text-slate-500">People in scope</p>
              <p className="mt-1 text-2xl font-bold">{data?.network.length ?? "—"}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase text-slate-500">Recent transactions</p>
              <p className="mt-1 text-2xl font-bold">{data?.transactions.length ?? "—"}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase text-slate-500">Your role</p>
              <p className="mt-1 text-lg font-bold capitalize">{profile?.role?.replace("_", " ")}</p>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {isAdmin ? (
              <>
                <Card className="p-4">
                  <Shield size={20} className="mb-2 text-violet-400" />
                  <h2 className="font-semibold">Create any account</h2>
                  <p className="mt-1 mb-3 text-sm text-slate-400">
                    Customers, agents, sub-agents, and admins.
                  </p>
                  <Link href="/admin/users">
                    <Button variant="secondary" className="w-full gap-2">
                      <UserPlus size={16} /> Manage users
                    </Button>
                  </Link>
                </Card>
                <Card className="p-4">
                  <Radio size={20} className="mb-2 text-emerald-400" />
                  <h2 className="font-semibold">Everyone online</h2>
                  <p className="mt-1 mb-3 text-sm text-slate-400">
                    See all players, agents, and staff using the platform.
                  </p>
                  <Button variant="secondary" className="w-full" onClick={() => setTab("live")}>
                    View live users
                  </Button>
                </Card>
                <Card className="p-4">
                  <Receipt size={20} className="mb-2 text-sky-400" />
                  <h2 className="font-semibold">Full ledger</h2>
                  <p className="mt-1 mb-3 text-sm text-slate-400">
                    Every GMD movement across the platform with audit references.
                  </p>
                  <Button variant="secondary" className="w-full" onClick={() => setTab("transactions")}>
                    View transactions
                  </Button>
                </Card>
              </>
            ) : (
              <>
                <Card className="p-4">
                  <UserPlus size={20} className="mb-2 text-emerald-400" />
                  <h2 className="font-semibold">Add customer</h2>
                  <p className="mt-1 mb-3 text-sm text-slate-400">
                    Open a player account under your network.
                  </p>
                  <Link href="/admin/customers">
                    <Button variant="secondary" className="w-full">
                      Create customer
                    </Button>
                  </Link>
                </Card>
                {isSuper && (
                  <Card className="p-4">
                    <UserCog size={20} className="mb-2 text-sky-400" />
                    <h2 className="font-semibold">Add sub-agent</h2>
                    <p className="mt-1 mb-3 text-sm text-slate-400">
                      Grow your team — sub-agents bring their own customers.
                    </p>
                    <Link href="/admin/sub-agents">
                      <Button variant="secondary" className="w-full">
                        Create sub-agent
                      </Button>
                    </Link>
                  </Card>
                )}
                <Card className="p-4">
                  <Receipt size={20} className="mb-2 text-amber-400" />
                  <h2 className="font-semibold">Network ledger</h2>
                  <p className="mt-1 mb-3 text-sm text-slate-400">
                    Your wallet, your customers, and your sub-agents&apos; activity.
                  </p>
                  <Button variant="secondary" className="w-full" onClick={() => setTab("transactions")}>
                    View transactions
                  </Button>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {tab === "live" && (
        <div className="space-y-4">
          <label className="block max-w-md text-sm">
            <span className="mb-1 text-slate-400">Search live users</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
              placeholder="Name…"
            />
          </label>
          {loading ? (
            <EmptyState message="Loading live users…" />
          ) : filteredLive.length === 0 ? (
            <EmptyState
              message={
                isAdmin
                  ? "No one is online right now."
                  : "None of your customers or sub-agents are online right now."
              }
            />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>User</Th>
                  <Th>Role</Th>
                  <Th>Page</Th>
                  <Th>Last seen</Th>
                </tr>
              </thead>
              <tbody>
                {filteredLive.map((r) => (
                  <tr key={r.uid}>
                    <Td className="font-medium text-white">
                      <span className="inline-flex items-center gap-2">
                        <Radio size={14} className="text-emerald-400" />
                        {r.name}
                      </span>
                    </Td>
                    <Td>
                      <Badge value={r.role} />
                    </Td>
                    <Td className="font-mono text-xs text-slate-400">{r.page}</Td>
                    <Td className="text-xs text-slate-400">
                      {r.lastSeen ? formatDate(new Date(r.lastSeen)) : "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>
      )}

      {tab === "transactions" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select
              label="Type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="min-w-[10rem]"
            >
              <option value="all">All types</option>
              {TX_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm">
              <span className="text-slate-400">Search</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, user ID, reference…"
                className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
          {loading ? (
            <EmptyState message="Loading transactions…" />
          ) : filteredTx.length === 0 ? (
            <EmptyState message="No transactions in your scope." />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>User</Th>
                  <Th>Type</Th>
                  <Th>Amount</Th>
                  <Th>Balance</Th>
                  <Th>Reference</Th>
                  <Th>Details</Th>
                </tr>
              </thead>
              <tbody>
                {filteredTx.map((t) => (
                  <tr key={t.id}>
                    <Td className="whitespace-nowrap text-xs text-slate-400">
                      {t.createdAt ? formatDate(new Date(t.createdAt)) : "—"}
                    </Td>
                    <Td>
                      <span className="block font-medium text-white">{t.userName ?? "—"}</span>
                      <span className="font-mono text-[10px] text-slate-500">{t.userId.slice(0, 10)}…</span>
                    </Td>
                    <Td>
                      <Badge value={t.type} />
                    </Td>
                    <Td
                      className={`font-semibold ${t.amount >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                    >
                      {formatSigned(t.amount)}
                    </Td>
                    <Td className="text-xs text-slate-400">
                      {t.balanceBefore.toLocaleString()} → {t.balanceAfter.toLocaleString()}
                    </Td>
                    <Td className="font-mono text-[10px] text-slate-500">{t.reference}</Td>
                    <Td className="max-w-xs truncate text-xs">{t.description}</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>
      )}

      {tab === "network" && (
        <div className="space-y-4">
          {isAdmin && (
            <p className="text-sm text-slate-400">
              Showing platform users. For full account management use{" "}
              <Link href="/admin/users" className="text-emerald-400 hover:underline">
                Users
              </Link>
              .
            </p>
          )}
          <label className="block max-w-md text-sm">
            <span className="mb-1 text-slate-400">Search people</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
              placeholder="Name, phone, username…"
            />
          </label>
          {loading ? (
            <EmptyState message="Loading network…" />
          ) : filteredNetwork.length === 0 ? (
            <EmptyState message="No people in your network yet." />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Role</Th>
                  <Th>Login</Th>
                  <Th>Balance</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {filteredNetwork.map((m) => (
                  <tr key={m.uid}>
                    <Td className="font-medium">{m.name}</Td>
                    <Td>
                      <Badge value={m.role as Role} />
                    </Td>
                    <Td className="text-xs text-slate-400">
                      {m.phone ?? m.email ?? m.agentSlug ?? "—"}
                    </Td>
                    <Td>{m.balance !== undefined ? formatXof(m.balance) : "—"}</Td>
                    <Td>
                      <Badge value={m.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>
      )}
    </div>
  );
}
