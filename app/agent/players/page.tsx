"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { Plus, Search, Banknote } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import {
  agentCreateCustomer,
  agentDepositToCustomer,
  errorMessage,
} from "@/lib/api";
import { formatXof, normalizePhone } from "@/lib/format";
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

export default function AgentPlayersPage() {
  const { fbUser, wallet } = useAuth();
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
    // ancestors contains every agent above the player, so super agents also
    // see their sub agents' customers here.
    const q = query(
      collection(db, "users"),
      where("role", "==", "player"),
      where("ancestors", "array-contains", fbUser.uid)
    );
    return onSnapshot(q, async (snap) => {
      const rows = snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as PlayerRow);
      // fetch balances (agents may read wallets in their tree)
      await Promise.all(
        rows.map(async (r) => {
          try {
            const w = await getDoc(doc(db, "wallets", r.uid));
            r.balance = w.exists() ? (w.data().balance as number) : 0;
          } catch {
            r.balance = undefined;
          }
        })
      );
      setPlayers(rows.sort((a, b) => (a.name > b.name ? 1 : -1)));
    });
  }, [fbUser]);

  const filtered = useMemo(() => {
    if (!players) return null;
    const s = search.trim().toLowerCase();
    if (!s) return players;
    return players.filter(
      (p) =>
        p.name?.toLowerCase().includes(s) ||
        p.phone?.includes(normalizePhone(s) || s)
    );
  }, [players, search]);

  async function createCustomer() {
    const phone = normalizePhone(newPhone);
    if (!newName.trim()) return toast.error("Enter the customer's name.");
    if (!phone) return toast.error("Enter a valid Gambia (7-digit) or Senegal (9-digit) phone.");
    if (newPassword.length < 8) return toast.error("Password must be at least 8 characters.");
    setBusy(true);
    try {
      await agentCreateCustomer({ name: newName.trim(), phone, password: newPassword });
      toast.success("Customer created!");
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
          <p className="text-sm text-slate-400">Players who joined through your link.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <span className="flex items-center gap-1.5">
            <Plus size={16} /> Add Customer
          </span>
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
        <Input
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {!filtered ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState message="No customers yet. Share your referral link to start earning!" />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Phone</Th>
              <Th>Balance</Th>
              <Th>Status</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.uid}>
                <Td className="font-medium">{p.name}</Td>
                <Td className="tabular-nums">{p.phone ?? "—"}</Td>
                <Td className="tabular-nums">
                  {p.balance === undefined ? "—" : formatXof(p.balance)}
                </Td>
                <Td>
                  <Badge value={p.status} />
                </Td>
                <Td>
                  <Button
                    variant="secondary"
                    className="!px-2.5 !py-1 text-xs"
                    onClick={() => setDepositTarget(p)}
                  >
                    <span className="flex items-center gap-1">
                      <Banknote size={13} /> Deposit
                    </span>
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Customer">
        <div className="space-y-4">
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
