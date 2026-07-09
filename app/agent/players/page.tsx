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
import { Plus, Search, Banknote, UserPlus } from "lucide-react";
import { db } from "@/lib/firestore";
import { useAuth } from "@/lib/auth-context";
import {
  agentCreateCustomer,
  agentDepositToCustomer,
  errorMessage,
} from "@/lib/api";
import { AgentMarketingLinks } from "@/components/agent/AgentMarketingLinks";
import { AgentCustomerCashActions } from "@/components/agent/AgentCashDesk";
import { CustomerOtpGate } from "@/components/shared/CustomerOtpGate";
import { CustomerCreatedSuccess } from "@/components/agent/CustomerCreatedSuccess";
import { formatXof, normalizePhone, todayIso } from "@/lib/format";
import { formatPlayerId, playerDisplayId } from "@/lib/playerId";
import {
  PASSWORD_FIELD_LABEL,
  PASSWORD_MAX,
  validatePassword,
} from "@/lib/passwordPolicy";
import { PasswordStrengthHint } from "@/components/PasswordStrengthHint";
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
  const { fbUser, wallet, profile } = useAuth();
  const [players, setPlayers] = useState<PlayerRow[] | null>(null);
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [depositTarget, setDepositTarget] = useState<PlayerRow | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositVerified, setDepositVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createdSuccess, setCreatedSuccess] = useState<{
    name: string;
    playerId: string;
    phone: string;
  } | null>(null);
  const [openedToday, setOpenedToday] = useState<number | null>(null);

  useEffect(() => {
    if (!fbUser) return;
    const today = todayIso();
    const ref = doc(db, "agentDailyStats", `${fbUser.uid}_${today}`);
    return onSnapshot(ref, (snap) => {
      setOpenedToday(snap.exists() ? Number(snap.data()?.customersOpened ?? 0) : 0);
    });
  }, [fbUser]);

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
        p.phone?.includes(normalizePhone(s) || s) ||
        (p.playerNumber ? formatPlayerId(p.playerNumber).toLowerCase().includes(s) : false) ||
        String(p.playerNumber ?? "").includes(s)
    );
  }, [players, search]);

  async function createCustomer() {
    const phone = normalizePhone(newPhone);
    if (!newName.trim()) return toast.error("Enter the customer's name.");
    if (!phone) return toast.error("Enter a valid Gambian mobile number (7 digits).");
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.ok) return toast.error(pwCheck.message);
    setBusy(true);
    try {
      const name = newName.trim();
      const res = await agentCreateCustomer({ name, phone, password: newPassword });
      setCreateOpen(false);
      setNewName("");
      setNewPhone("");
      setNewPassword("");
      setCreatedSuccess({ name, playerId: res.playerId, phone });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function openDeposit(target: PlayerRow) {
    setDepositVerified(false);
    setDepositAmount("");
    setDepositTarget(target);
  }

  function closeDeposit() {
    setDepositTarget(null);
    setDepositVerified(false);
    setDepositAmount("");
  }

  async function deposit() {
    if (!depositTarget) return;
    const amt = Number(depositAmount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Enter a valid amount.");
    if (amt > (wallet?.balance ?? 0)) return toast.error("Insufficient agent balance.");
    if (!depositVerified) return toast.error("Get the customer's code and verify it first.");
    setBusy(true);
    try {
      await agentDepositToCustomer({ customerId: depositTarget.uid, amount: amt });
      toast.success(`Deposited ${formatXof(amt)} to ${depositTarget.name}.`);
      closeDeposit();
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
            Players who joined through your link or that you registered.
            {openedToday !== null ? (
              <span className="ml-2 inline-flex items-center gap-1 text-emerald-300">
                <UserPlus size={14} />
                {openedToday} opened today
              </span>
            ) : null}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <span className="flex items-center gap-1.5">
            <Plus size={16} /> Add Customer
          </span>
        </Button>
      </div>

      {profile?.cashOpsEnabled ? (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <strong>Cash desk enabled</strong> — + Cash when customer pays you; − Cash when you pay
          them (withdrawal code with Player ID).
        </p>
      ) : null}

      {profile?.agentSlug ? (
        <div className="mb-5">
          <AgentMarketingLinks slug={profile.agentSlug} agentName={profile.name} compact />
        </div>
      ) : null}

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
        <Input
          placeholder="Search by name, phone, or Player ID…"
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
              <Th>Player ID</Th>
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
                <Td className="font-mono text-sm font-semibold text-emerald-300">
                  {playerDisplayId(p)}
                </Td>
                <Td className="font-medium">{p.name}</Td>
                <Td className="tabular-nums">{p.phone ?? "—"}</Td>
                <Td className="tabular-nums">
                  {p.balance === undefined ? "—" : formatXof(p.balance)}
                </Td>
                <Td>
                  <Badge value={p.status} />
                </Td>
                <Td>
                  <AgentCustomerCashActions
                    customer={p}
                    cashOpsEnabled={Boolean(profile?.cashOpsEnabled)}
                    isAdmin={profile?.role === "admin"}
                    onFloatDeposit={() => openDeposit(p)}
                  />
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
            label={PASSWORD_FIELD_LABEL}
            type="password"
            value={newPassword}
            maxLength={PASSWORD_MAX}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <PasswordStrengthHint length={newPassword.length} />
          <Button className="w-full" onClick={createCustomer} disabled={busy}>
            {busy ? "Creating…" : "Create Customer"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={!!depositTarget}
        onClose={closeDeposit}
        title={`Deposit to ${depositTarget?.name ?? ""}${depositTarget?.playerNumber ? ` (${formatPlayerId(depositTarget.playerNumber)})` : ""}`}
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
          <CustomerOtpGate
            phone={depositTarget?.phone}
            customerName={depositTarget?.name ?? ""}
            verified={depositVerified}
            onVerified={() => setDepositVerified(true)}
          />
          <Button className="w-full" onClick={deposit} disabled={busy || !depositVerified}>
            {busy ? "Transferring…" : "Deposit"}
          </Button>
        </div>
      </Modal>

      <CustomerCreatedSuccess
        open={!!createdSuccess}
        onClose={() => setCreatedSuccess(null)}
        customerName={createdSuccess?.name ?? ""}
        playerId={createdSuccess?.playerId ?? ""}
        phone={createdSuccess?.phone ?? ""}
        agentSlug={profile?.agentSlug}
        agentName={profile?.name}
      />
    </div>
  );
}
