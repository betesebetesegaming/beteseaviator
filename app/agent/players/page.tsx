"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import { Plus, Search, UserPlus } from "lucide-react";
import { db } from "@/lib/firestore";
import { useAuth } from "@/lib/auth-context";
import {
  agentCreateCustomer,
  agentDepositToCustomer,
  errorMessage,
} from "@/lib/api";
import { AgentMarketingLinks } from "@/components/agent/AgentMarketingLinks";
import { AgentCustomerCashActions, AgentServeAnyCustomer } from "@/components/agent/AgentCashDesk";
import { CustomerOtpGate } from "@/components/shared/CustomerOtpGate";
import { CustomerCreatedSuccess } from "@/components/agent/CustomerCreatedSuccess";
import { formatXof, normalizePhone, todayIso, createdAtIso } from "@/lib/format";
import { formatPlayerId, playerDisplayId } from "@/lib/playerId";
import { monthlyOpenedViaLinkByAgent, openedViaLinkInRange } from "@/lib/agentMonthAccounts";
import {
  calendarMonthRangeIso,
  monthRangeIso,
  monthShortLabelFromKey,
  recentMonthKeys,
} from "@/lib/ggrAccounting";
import { useAgentLinkedPlayers } from "@/lib/hooks/useAgentLinkedPlayers";
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
  const linked = useAgentLinkedPlayers(fbUser?.uid);
  const [players, setPlayers] = useState<PlayerRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [listFilter, setListFilter] = useState<string>("month");
  const month = useMemo(() => monthRangeIso(), []);
  const monthKeys = useMemo(() => recentMonthKeys(6), []);
  const currentMonthKey = month.from.slice(0, 7);

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
    password: string;
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
    if (!linked) {
      setPlayers(null);
      return;
    }
    let cancelled = false;
    void Promise.all(
      linked.map(async (r) => {
        const row = { ...r } as PlayerRow;
        try {
          const w = await getDoc(doc(db, "wallets", r.uid));
          row.balance = w.exists() ? (w.data().balance as number) : 0;
        } catch {
          row.balance = undefined;
        }
        return row;
      })
    ).then((rows) => {
      if (cancelled) return;
      setPlayers(rows.sort((a, b) => createdAtIso(b.createdAt).localeCompare(createdAtIso(a.createdAt))));
    });
    return () => {
      cancelled = true;
    };
  }, [linked]);

  const agentId = fbUser?.uid;
  const monthOpened = useMemo(
    () => openedViaLinkInRange(players, agentId, month.from, month.to),
    [players, agentId, month.from, month.to]
  );
  const byMonth = useMemo(() => {
    if (!agentId) return new Map<string, number>();
    return monthlyOpenedViaLinkByAgent(players, monthKeys).get(agentId) ?? new Map();
  }, [players, agentId, monthKeys]);
  const selectedMonthKey = listFilter === "all" || listFilter === "month" ? currentMonthKey : listFilter;
  const selectedRange = useMemo(
    () =>
      selectedMonthKey === currentMonthKey
        ? month
        : calendarMonthRangeIso(selectedMonthKey),
    [selectedMonthKey, currentMonthKey, month]
  );
  const monthList = useMemo(
    () => openedViaLinkInRange(players, agentId, selectedRange.from, selectedRange.to),
    [players, agentId, selectedRange.from, selectedRange.to]
  );

  const filtered = useMemo(() => {
    const source = listFilter === "all" ? players : monthList;
    if (!source) return null;
    const s = search.trim().toLowerCase();
    if (!s) return source;
    return source.filter(
      (p) =>
        p.name?.toLowerCase().includes(s) ||
        p.phone?.includes(normalizePhone(s) || s) ||
        (p.playerNumber ? formatPlayerId(p.playerNumber).toLowerCase().includes(s) : false) ||
        String(p.playerNumber ?? "").includes(s)
    );
  }, [players, monthList, listFilter, search]);

  async function createCustomer() {
    const phone = normalizePhone(newPhone);
    if (!newName.trim()) return toast.error("Enter the customer's name.");
    if (!phone) return toast.error("Enter a valid 9-digit Gambian mobile (add 87, 83 or 86 first).");
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.ok) return toast.error(pwCheck.message);
    setBusy(true);
    try {
      const name = newName.trim();
      const password = newPassword;
      const res = await agentCreateCustomer({ name, phone, password });
      setCreateOpen(false);
      setNewName("");
      setNewPhone("");
      setNewPassword("");
      setCreatedSuccess({ name, playerId: res.playerId, phone, password });
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
            <span className="ml-2 inline-flex items-center gap-1 text-sky-300">
              <UserPlus size={14} />
              {monthOpened.length} via your link in {month.label}
            </span>
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

      <AgentServeAnyCustomer cashOpsEnabled={!!profile?.cashOpsEnabled} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {monthKeys.map((key) => {
          const count = key === currentMonthKey ? monthOpened.length : byMonth.get(key) ?? 0;
          const active = listFilter === "all" ? false : selectedMonthKey === key;
          return (
            <Button
              key={key}
              variant={active ? "primary" : "secondary"}
              className="!px-3 !py-1.5 text-xs"
              onClick={() => setListFilter(key === currentMonthKey ? "month" : key)}
            >
              {monthShortLabelFromKey(key)}
              {key === currentMonthKey ? " · this month" : ""} ({count})
            </Button>
          );
        })}
        <Button
          variant={listFilter === "all" ? "primary" : "secondary"}
          className="!px-3 !py-1.5 text-xs"
          onClick={() => setListFilter("all")}
        >
          All months ({players?.length ?? 0})
        </Button>
      </div>

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
        <EmptyState
          message={
            listFilter === "all"
              ? "No customers yet. Share your referral link to start earning!"
              : `Nobody has opened via your link in ${selectedRange.label} yet.`
          }
        />
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
                    cashOpsEnabled={!!profile?.cashOpsEnabled}
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
        title={`Credit ${depositTarget?.name ?? ""}${depositTarget?.playerNumber ? ` (${formatPlayerId(depositTarget.playerNumber)})` : ""} — from your balance`}
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
            {busy ? "Crediting…" : "Credit customer"}
          </Button>
        </div>
      </Modal>

      <CustomerCreatedSuccess
        open={!!createdSuccess}
        onClose={() => setCreatedSuccess(null)}
        customerName={createdSuccess?.name ?? ""}
        playerId={createdSuccess?.playerId ?? ""}
        phone={createdSuccess?.phone ?? ""}
        password={createdSuccess?.password ?? ""}
        agentSlug={profile?.agentSlug}
        agentName={profile?.name}
      />
    </div>
  );
}
