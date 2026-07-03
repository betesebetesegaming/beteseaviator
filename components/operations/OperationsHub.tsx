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
import { formatPlayerId } from "@/lib/playerId";
import type { Role, TransactionType } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Select, TableShell, Td, Th } from "@/components/ui";

const TABS = ["overview", "agents", "live", "transactions", "network"] as const;
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

  const initialTab = (searchParams.get("tab") as Tab) || "overview";
  const initialSearch = searchParams.get("search") ?? "";
  const [tab, setTab] = useState<Tab>(TABS.includes(initialTab) ? initialTab : "overview");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState(initialSearch);
  const [data, setData] = useState<OperationsHubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setLoadError(null);
    try {
      const res = await getOperationsHub({
        type: typeFilter === "all" ? undefined : typeFilter,
        limit: 200,
      });
      setData(res);
    } catch (e) {
      const msg = errorMessage(e);
      setLoadError(msg);
      console.error(msg);
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
    let list = data.transactions;
    if (agentFilter) {
      list = list.filter((t) => t.agentId === agentFilter);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (t) =>
        t.id.toLowerCase().includes(q) ||
        t.userId.toLowerCase().includes(q) ||
        (t.userName ?? "").toLowerCase().includes(q) ||
        (t.playerId ?? "").toLowerCase().includes(q) ||
        (t.agentName ?? "").toLowerCase().includes(q) ||
        t.reference.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  }, [data, search, agentFilter]);

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
    let list = data.network;
    if (agentFilter) {
      list = list.filter((m) => m.role === "player" && m.parentId === agentFilter);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.phone ?? "").includes(q) ||
        (m.agentSlug ?? "").includes(q) ||
        (m.playerId ?? "").toLowerCase().includes(q) ||
        (m.parentName ?? "").toLowerCase().includes(q)
    );
  }, [data, search, agentFilter]);

  const filteredAgents = useMemo(() => {
    if (!data?.agents) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.agents;
    return data.agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.agentSlug ?? "").toLowerCase().includes(q) ||
        (a.phone ?? "").includes(q)
    );
  }, [data, search]);

  function viewAgentCustomers(agentId: string) {
    setAgentFilter(agentId);
    setSearch("");
    setTab("network");
  }

  const title = isAdmin ? "Platform operations" : "Agent operations";
  const subtitle = isAdmin
    ? "Live activity, full transaction ledger, and every user on BETESE — one place."
    : "Your customers, live activity, and network transactions — one place.";

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
        {TABS.filter((t) => (t === "agents" ? isAdmin : true)).map((t) => (
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
            {t === "network" ? "Customers" : t === "agents" ? "Agents / vendors" : t}
          </button>
        ))}
      </div>

      {loadError ? (
        <Card className="border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
          Could not load operations data: {loadError}
        </Card>
      ) : null}

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
                  <h2 className="font-semibold">Open accounts</h2>
                  <p className="mt-1 mb-3 text-sm text-slate-400">
                    Create agents and customers in a few clicks.
                  </p>
                  <div className="flex flex-col gap-2">
                    <Link href="/admin/agents?create=1">
                      <Button variant="secondary" className="w-full gap-2">
                        <UserCog size={16} /> Create agent
                      </Button>
                    </Link>
                    <Link href="/admin/users">
                      <Button variant="secondary" className="w-full gap-2">
                        <UserPlus size={16} /> Create customer
                      </Button>
                    </Link>
                  </div>
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
                <Card className="p-4">
                  <Receipt size={20} className="mb-2 text-amber-400" />
                  <h2 className="font-semibold">Network ledger</h2>
                  <p className="mt-1 mb-3 text-sm text-slate-400">
                    Your wallet and your customers&apos; activity.
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

      {tab === "agents" && isAdmin && (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Every agent / marketer — sales (GGR), deposits, customers opened today. Customers linked to
            an agent earn that agent commission on play. Click a row to see their customers.
          </p>
          <label className="block max-w-md text-sm">
            <span className="mb-1 text-slate-400">Search agents</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
              placeholder="Name, username, phone…"
            />
          </label>
          {loading ? (
            <EmptyState message="Loading agents…" />
          ) : filteredAgents.length === 0 ? (
            <EmptyState message="No agents found." />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Agent / vendor</Th>
                  <Th>Username</Th>
                  <Th className="text-right">Opened today</Th>
                  <Th className="text-right">Customers</Th>
                  <Th className="text-right">Sales (GGR)</Th>
                  <Th className="text-right">Deposits</Th>
                  <Th className="text-right">Commission</Th>
                  <Th>Status</Th>
                  <Th>Action</Th>
                </tr>
              </thead>
              <tbody>
                {filteredAgents.map((a) => (
                  <tr key={a.uid}>
                    <Td className="font-medium text-white">{a.name}</Td>
                    <Td className="text-xs text-slate-400">{a.agentSlug ?? a.phone ?? "—"}</Td>
                    <Td className="text-right tabular-nums">
                      <span className={a.customersOpenedToday > 0 ? "font-semibold text-emerald-300" : ""}>
                        {a.customersOpenedToday}
                      </span>
                    </Td>
                    <Td className="text-right tabular-nums">{a.customerCount}</Td>
                    <Td className="text-right tabular-nums">{formatXof(a.ggr)}</Td>
                    <Td className="text-right tabular-nums">{formatXof(a.customerDeposits)}</Td>
                    <Td className="text-right tabular-nums text-emerald-300">
                      {formatXof(a.commissionEarned)}
                    </Td>
                    <Td>
                      <Badge value={a.status} />
                    </Td>
                    <Td>
                      <Button
                        variant="secondary"
                        className="!px-2.5 !py-1 text-xs"
                        onClick={() => viewAgentCustomers(a.uid)}
                      >
                        View customers
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
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
                  : "None of your customers are online right now."
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
          <p className="text-sm text-slate-400">
            Every deposit, bet, win, and withdrawal — with transaction ID, customer, Player ID, and
            agent name.
          </p>
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
            {isAdmin && data?.agents && data.agents.length > 0 ? (
              <Select
                label="Agent"
                value={agentFilter ?? ""}
                onChange={(e) => setAgentFilter(e.target.value || null)}
                className="min-w-[12rem]"
              >
                <option value="">All agents</option>
                {data.agents.map((a) => (
                  <option key={a.uid} value={a.uid}>
                    {a.name}
                    {a.agentSlug ? ` (${a.agentSlug})` : ""}
                  </option>
                ))}
              </Select>
            ) : null}
            <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm">
              <span className="text-slate-400">Search</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tx ID, name, Player ID, agent, reference…"
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
                  <Th>Tx ID</Th>
                  <Th>When</Th>
                  <Th>Customer</Th>
                  <Th>Player ID</Th>
                  {isAdmin ? <Th>Agent</Th> : null}
                  <Th>Type</Th>
                  <Th>Amount</Th>
                  <Th>Reference</Th>
                </tr>
              </thead>
              <tbody>
                {filteredTx.map((t) => (
                  <tr key={t.id}>
                    <Td className="max-w-[7rem] font-mono text-[10px] text-sky-300">
                      <span title={t.id}>{t.id.length > 12 ? `${t.id.slice(0, 10)}…` : t.id}</span>
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-slate-400">
                      {t.createdAt ? formatDate(new Date(t.createdAt)) : "—"}
                    </Td>
                    <Td className="font-medium text-white">{t.userName ?? "—"}</Td>
                    <Td className="font-mono text-xs text-emerald-300">{t.playerId ?? "—"}</Td>
                    {isAdmin ? (
                      <Td className="text-sm font-medium text-violet-200">{t.agentName ?? "Direct"}</Td>
                    ) : null}
                    <Td>
                      <Badge value={t.type} />
                    </Td>
                    <Td
                      className={`font-semibold ${t.amount >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                    >
                      {formatSigned(t.amount)}
                    </Td>
                    <Td className="max-w-[8rem] truncate font-mono text-[10px] text-slate-500">
                      <span title={t.reference}>{t.reference}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>
      )}

      {tab === "network" && (
        <div className="space-y-4">
          {isAdmin && agentFilter && data?.agents ? (
            <Card className="flex flex-wrap items-center justify-between gap-3 border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
              <span>
                Showing customers for{" "}
                <strong>{data.agents.find((a) => a.uid === agentFilter)?.name ?? "agent"}</strong>
              </span>
              <Button variant="secondary" className="!py-1 text-xs" onClick={() => setAgentFilter(null)}>
                Show all customers
              </Button>
            </Card>
          ) : null}
          {isAdmin && !agentFilter && (
            <p className="text-sm text-slate-400">
              All customers with Player ID and owning agent. Open the{" "}
              <button type="button" className="text-emerald-400 hover:underline" onClick={() => setTab("agents")}>
                Agents / vendors
              </button>{" "}
              tab for sales and daily opens.
            </p>
          )}
          <label className="block max-w-md text-sm">
            <span className="mb-1 text-slate-400">Search people</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
              placeholder="Name, phone, Player ID, agent…"
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
                  <Th>Player ID</Th>
                  <Th>Name</Th>
                  <Th>Role</Th>
                  {isAdmin ? <Th>Agent / vendor</Th> : null}
                  <Th>Login</Th>
                  <Th>Joined</Th>
                  <Th>Balance</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {filteredNetwork.map((m) => (
                  <tr key={m.uid}>
                    <Td className="font-mono text-sm text-emerald-300">
                      {m.playerId ?? (m.playerNumber ? formatPlayerId(m.playerNumber) : "—")}
                    </Td>
                    <Td className="font-medium">{m.name}</Td>
                    <Td>
                      <Badge value={m.role as Role} />
                    </Td>
                    {isAdmin ? (
                      <Td className="text-sm text-slate-300">{m.parentName ?? "—"}</Td>
                    ) : null}
                    <Td className="text-xs text-slate-400">
                      {m.phone ?? m.email ?? m.agentSlug ?? "—"}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-slate-400">
                      {m.createdAt ? formatDate(new Date(m.createdAt)) : "—"}
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
