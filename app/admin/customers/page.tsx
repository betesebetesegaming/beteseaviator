"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { Plus, Search, Banknote, Copy, Receipt } from "lucide-react";
import { db } from "@/lib/firestore";
import { useAuth } from "@/lib/auth-context";
import {
  agentCreateCustomer,
  agentDepositToCustomer,
  errorMessage,
} from "@/lib/api";
import { formatDate, formatXof, normalizePhone } from "@/lib/format";
import { formatPlayerId, playerDisplayId } from "@/lib/playerId";
import { AgentMarketingLinks } from "@/components/agent/AgentMarketingLinks";
import type { UserProfile } from "@/lib/types";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  Spinner,
  TableShell,
  Td,
  Th,
} from "@/components/ui";

type PlayerRow = UserProfile & { balance?: number };

function copyText(label: string, value: string) {
  void navigator.clipboard.writeText(value).then(
    () => toast.success(`${label} copied`),
    () => toast.error("Could not copy"),
  );
}

export default function AgentPlayersPage() {
  const { fbUser, wallet, profile } = useAuth();
  const [players, setPlayers] = useState<PlayerRow[] | null>(null);
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [depositTarget, setDepositTarget] = useState<PlayerRow | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!fbUser) return;
    const q = query(
      collection(db, "users"),
      where("role", "==", "player"),
      where("ancestors", "array-contains", fbUser.uid),
    );
    return onSnapshot(q, async (snap) => {
      const rows = snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as PlayerRow);
      await Promise.all(
        rows.map(async (r) => {
          try {
            const w = await getDoc(doc(db, "wallets", r.uid));
            r.balance = w.exists() ? (w.data().balance as number) : 0;
          } catch {
            r.balance = undefined;
          }
        }),
      );
      setPlayers(
        rows.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() ?? 0;
          const bTime = b.createdAt?.toMillis?.() ?? 0;
          return bTime - aTime || a.name.localeCompare(b.name);
        }),
      );
    });
  }, [fbUser]);

  const filtered = useMemo(() => {
    if (!players) return null;
    const s = search.trim().toLowerCase();
    if (!s) return players;
    return players.filter((p) => {
      const id = p.playerNumber ? formatPlayerId(p.playerNumber).toLowerCase() : "";
      return (
        p.name?.toLowerCase().includes(s) ||
        p.phone?.includes(normalizePhone(s) || s) ||
        p.uid.toLowerCase().includes(s) ||
        id.includes(s) ||
        String(p.playerNumber ?? "").includes(s)
      );
    });
  }, [players, search]);

  async function createCustomer() {
    const phone = normalizePhone(newPhone);
    if (!newName.trim()) return toast.error("Enter the customer's name.");
    if (!phone) return toast.error("Enter a valid Gambian mobile number (7 digits).");
    if (newPassword.length < 8) return toast.error("Password must be at least 8 characters.");
    setBusy(true);
    try {
      const res = await agentCreateCustomer({ name: newName.trim(), phone, password: newPassword });
      toast.success(`Customer created — Player ID ${res.playerId}`);
      setCreateOpen(false);
      setNewName("");
      setNewPhone("");
      setNewPassword("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function deposit() {
    if (!depositTarget) return;
    const amt = Number(depositAmount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Enter a valid amount.");
    if (amt > (wallet?.balance ?? 0)) return toast.error("Insufficient agent balance.");
    setBusy(true);
    try {
      await agentDepositToCustomer({ customerId: depositTarget.uid, amount: amt });
      toast.success(`Deposited ${formatXof(amt)} to ${depositTarget.name}.`);
      setDepositTarget(null);
      setDepositAmount("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">My Customers</h1>
          <p className="text-sm text-slate-400">
            Every player gets a Player ID (e.g. BTE-00042) for the office. Monitor bets and deposits
            in{" "}
            <Link href="/admin/operations?tab=transactions" className="text-emerald-400 hover:underline">
              Operations → Transactions
            </Link>
            .
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <span className="flex items-center gap-1.5">
            <Plus size={16} /> Add Customer
          </span>
        </Button>
      </div>

      {profile?.agentSlug ? (
        <div className="mb-5">
          <AgentMarketingLinks slug={profile.agentSlug} agentName={profile.name} compact />
        </div>
      ) : null}

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
        <Input
          placeholder="Search name, phone, Player ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {!filtered ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState message="No customers yet. Share your referral link or add a customer manually." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Player ID</Th>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Balance</Th>
              <Th>Joined</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const playerId = playerDisplayId(p);
              const officeId = p.playerNumber ? formatPlayerId(p.playerNumber) : null;
              return (
                <tr key={p.uid}>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-sm font-semibold text-emerald-300">{playerId}</span>
                      {officeId ? (
                        <button
                          type="button"
                          onClick={() => copyText("Player ID", officeId)}
                          className="rounded p-1 text-slate-400 hover:bg-white/5 hover:text-white"
                          title="Copy Player ID"
                        >
                          <Copy size={14} />
                        </button>
                      ) : null}
                    </div>
                  </Td>
                  <Td className="font-medium">{p.name}</Td>
                  <Td className="tabular-nums">{p.phone ?? "—"}</Td>
                  <Td className="tabular-nums">
                    {p.balance === undefined ? "—" : formatXof(p.balance)}
                  </Td>
                  <Td className="text-xs text-slate-400">
                    {p.createdAt ? formatDate(p.createdAt.toDate()) : "—"}
                  </Td>
                  <Td>
                    <Badge value={p.status} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      <Link href={`/admin/operations?tab=transactions&search=${encodeURIComponent(officeId ?? p.name)}`}>
                        <Button variant="secondary" className="!px-2.5 !py-1 text-xs">
                          <span className="flex items-center gap-1">
                            <Receipt size={13} /> Txs
                          </span>
                        </Button>
                      </Link>
                      <Button
                        variant="secondary"
                        className="!px-2.5 !py-1 text-xs"
                        onClick={() => setDepositTarget(p)}
                      >
                        <span className="flex items-center gap-1">
                          <Banknote size={13} /> Deposit
                        </span>
                      </Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Customer">
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Opens a player wallet under your network. They receive a Player ID to use at the office.
          </p>
          <Input label="Full Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input
            label="Phone Number (used to sign in)"
            type="tel"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
          />
          <Input
            label="Password (min 8 characters)"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Button className="w-full" onClick={createCustomer} disabled={busy}>
            {busy ? "Creating…" : "Create Customer"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={!!depositTarget}
        onClose={() => setDepositTarget(null)}
        title={`Deposit to ${depositTarget?.name ?? ""}`}
      >
        <div className="space-y-4">
          {depositTarget?.playerNumber ? (
            <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              Player ID:{" "}
              <span className="font-mono font-semibold">
                {formatPlayerId(depositTarget.playerNumber)}
              </span>
            </p>
          ) : null}
          <p className="text-sm text-slate-400">
            Transfers from your balance ({formatXof(wallet?.balance ?? 0)}) into the customer&apos;s
            wallet. Both sides are logged.
          </p>
          <Input
            label="Amount (GMD)"
            type="number"
            min={1}
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
          />
          <Button className="w-full" onClick={deposit} disabled={busy}>
            {busy ? "Transferring…" : "Deposit"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
