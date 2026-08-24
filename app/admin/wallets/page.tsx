"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { Search, Snowflake, Banknote, HandCoins, BookOpen } from "lucide-react";
import { db } from "@/lib/firestore";
import { adminAdjustWallet, adminFreezeWallet, errorMessage } from "@/lib/api";
import { lookupUsersByPhoneOrId } from "@/lib/adminUserLookup";
import { formatXof, normalizePhone } from "@/lib/format";
import { formatPlayerId } from "@/lib/playerId";
import { accountTotalsFromStats } from "@/lib/playerAccount";
import { isAgentRole } from "@/lib/roles";
import type { UserProfile, Wallet } from "@/lib/types";
import { AdminCustomerSupportModal } from "@/components/admin/AdminCustomerSupportModal";
import { AdminResetPasswordModal } from "@/components/admin/AdminResetPasswordModal";
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

type Row = UserProfile & { wallet?: Wallet };
type RoleFilter = "all" | "players" | "agents";

function depositsForRow(r: Row): number {
  if (isAgentRole(r.role)) {
    return Number(r.stats?.customerDeposits ?? r.stats?.totalDeposits ?? 0);
  }
  return Number(r.stats?.totalDeposits ?? 0);
}

export default function AdminWalletsPage() {
  const [users, setUsers] = useState<UserProfile[] | null>(null);
  const [lookupHits, setLookupHits] = useState<UserProfile[]>([]);
  const [lookingUp, setLookingUp] = useState(false);
  const [wallets, setWallets] = useState<Record<string, Wallet>>({});
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const [adjustTarget, setAdjustTarget] = useState<Row | null>(null);
  const [adjustMode, setAdjustMode] = useState<"credit" | "withdraw">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const [accountUser, setAccountUser] = useState<UserProfile | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(500));
    const unsubUsers = onSnapshot(q, (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile));
    });
    const unsubWallets = onSnapshot(collection(db, "wallets"), (snap) => {
      const map: Record<string, Wallet> = {};
      snap.docs.forEach((d) => (map[d.id] = d.data() as Wallet));
      setWallets(map);
    });
    return () => {
      unsubUsers();
      unsubWallets();
    };
  }, []);

  useEffect(() => {
    const s = search.trim();
    if (!s) {
      setLookupHits([]);
      setLookingUp(false);
      return;
    }
    let cancelled = false;
    setLookingUp(true);
    const t = window.setTimeout(() => {
      void lookupUsersByPhoneOrId(s)
        .then((hits) => {
          if (!cancelled) setLookupHits(hits);
        })
        .catch(() => {
          if (!cancelled) setLookupHits([]);
        })
        .finally(() => {
          if (!cancelled) setLookingUp(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [search]);

  const mergedUsers = useMemo(() => {
    if (!users) return null;
    const map = new Map<string, UserProfile>();
    for (const u of users) map.set(u.uid, u);
    for (const u of lookupHits) map.set(u.uid, u);
    return Array.from(map.values());
  }, [users, lookupHits]);

  const rows: Row[] | null = useMemo(() => {
    if (!mergedUsers) return null;
    let list = mergedUsers
      .filter((u) => u.role !== "admin")
      .map((u) => ({ ...u, wallet: wallets[u.uid] }));
    if (roleFilter === "players") {
      list = list.filter((u) => u.role === "player");
    } else if (roleFilter === "agents") {
      list = list.filter((u) => isAgentRole(u.role));
    }
    const s = search.trim().toLowerCase();
    if (s) {
      list = list.filter(
        (u) =>
          u.name?.toLowerCase().includes(s) ||
          u.email?.toLowerCase().includes(s) ||
          u.agentSlug?.toLowerCase().includes(s) ||
          u.phone?.includes(normalizePhone(s) || s) ||
          (u.playerNumber ? formatPlayerId(u.playerNumber).toLowerCase().includes(s) : false) ||
          String(u.playerNumber ?? "").includes(s)
      );
    }
    return list;
  }, [mergedUsers, wallets, search, roleFilter]);

  function openAdjust(row: Row, mode: "credit" | "withdraw") {
    setAdjustMode(mode);
    setAmount("");
    setReason("");
    setAdjustTarget(row);
  }

  async function adjust() {
    if (!adjustTarget) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0)
      return toast.error("Enter an amount greater than zero.");
    if (adjustMode === "withdraw" && amt > (adjustTarget.wallet?.balance ?? 0))
      return toast.error("Amount is more than the wallet balance.");
    if (!reason.trim()) return toast.error("A reason is mandatory — it goes in the audit log.");
    setBusy(true);
    try {
      const signed = adjustMode === "withdraw" ? -amt : amt;
      const res = await adminAdjustWallet({
        uid: adjustTarget.uid,
        amount: signed,
        reason: reason.trim(),
      });
      toast.success(
        `${adjustMode === "withdraw" ? "Withdrew" : "Credited"} ${formatXof(amt)}. New balance: ${formatXof(res.newBalance)}.`,
      );
      setAdjustTarget(null);
      setAmount("");
      setReason("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleFreeze(row: Row) {
    setBusy(true);
    try {
      await adminFreezeWallet({ uid: row.uid, frozen: !row.wallet?.frozen });
      toast.success(`${row.name}'s wallet ${row.wallet?.frozen ? "unfrozen" : "frozen"}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const filters: { id: RoleFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "players", label: "Players" },
    { id: "agents", label: "Agents" },
  ];

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold">Wallets &amp; account book</h1>
        <p className="text-sm text-slate-400">
          Deposits, played, and win/loss per customer. <strong>Credit</strong> /{" "}
          <strong>Withdraw</strong> need a logged reason. Open <strong>Account</strong> for the full
          ledger.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
          <Input
            placeholder="Phone, Player ID, name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-900/80 p-1">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setRoleFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                roleFilter === f.id
                  ? "bg-emerald-500 text-slate-950"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        The table lists the newest 500 accounts. Type a phone or Player ID to find anyone.
      </p>

      {!rows || (lookingUp && rows.length === 0) ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState message="No users match. Try the 7-digit phone or Player ID." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th className="text-right">Deposits</Th>
              <Th className="text-right">Played</Th>
              <Th className="text-right">Win/Loss</Th>
              <Th className="text-right">Balance</Th>
              <Th>Wallet</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const stats = accountTotalsFromStats(
                isAgentRole(r.role)
                  ? {
                      totalDeposits: depositsForRow(r),
                      totalWithdrawals: Number(r.stats?.totalWithdrawals ?? 0),
                      totalBets: Number(r.stats?.totalBets ?? 0),
                      totalWins: Number(r.stats?.totalWins ?? 0),
                    }
                  : r.stats,
              );
              const winLoss = stats.winLoss;
              return (
                <tr key={r.uid}>
                  <Td className="font-medium">{r.name}</Td>
                  <Td>
                    <Badge value={r.role} />
                  </Td>
                  <Td className="text-right tabular-nums font-bold text-white">
                    {formatXof(stats.totalDeposits)}
                  </Td>
                  <Td className="text-right tabular-nums text-slate-300">
                    {formatXof(stats.totalBets)}
                  </Td>
                  <Td
                    className={`text-right tabular-nums font-semibold ${
                      winLoss > 0
                        ? "text-emerald-300"
                        : winLoss < 0
                          ? "text-rose-300"
                          : "text-slate-400"
                    }`}
                  >
                    {formatXof(winLoss)}
                  </Td>
                  <Td className="text-right font-semibold tabular-nums">
                    {r.wallet ? formatXof(r.wallet.balance) : "—"}
                  </Td>
                  <Td>
                    <Badge value={r.wallet?.frozen ? "suspended" : "active"} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        className="!px-2.5 !py-1 text-xs text-sky-200"
                        onClick={() => setAccountUser(r)}
                        title="Full account book"
                      >
                        <span className="flex items-center gap-1">
                          <BookOpen size={13} /> Account
                        </span>
                      </Button>
                      <Button
                        variant="secondary"
                        className="!px-2.5 !py-1 text-xs text-emerald-200"
                        onClick={() => openAdjust(r, "credit")}
                        title="Add money to this wallet"
                      >
                        <span className="flex items-center gap-1">
                          <Banknote size={13} /> Credit
                        </span>
                      </Button>
                      <Button
                        variant="secondary"
                        className="!px-2.5 !py-1 text-xs text-amber-200"
                        onClick={() => openAdjust(r, "withdraw")}
                        title="Take money from this wallet"
                      >
                        <span className="flex items-center gap-1">
                          <HandCoins size={13} /> Withdraw
                        </span>
                      </Button>
                      <Button
                        variant={r.wallet?.frozen ? "secondary" : "danger"}
                        className="!px-2.5 !py-1 text-xs"
                        disabled={busy}
                        onClick={() => toggleFreeze(r)}
                      >
                        <span className="flex items-center gap-1">
                          <Snowflake size={13} /> {r.wallet?.frozen ? "Unfreeze" : "Freeze"}
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

      <Modal
        open={!!adjustTarget}
        onClose={() => setAdjustTarget(null)}
        title={`${adjustMode === "credit" ? "Credit" : "Withdraw from"} ${adjustTarget?.name ?? ""}'s wallet`}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Current balance:{" "}
            <strong>{adjustTarget?.wallet ? formatXof(adjustTarget.wallet.balance) : "—"}</strong>.{" "}
            {adjustMode === "credit"
              ? "This amount will be added to the wallet."
              : "This amount will be taken from the wallet."}
          </p>
          <Input
            label="Amount (GMD)"
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Input
            label="Reason (required, audited)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button className="w-full" onClick={adjust} disabled={busy}>
            {busy
              ? "Working…"
              : adjustMode === "credit"
                ? "Credit wallet"
                : "Withdraw from wallet"}
          </Button>
        </div>
      </Modal>

      <AdminCustomerSupportModal
        user={accountUser}
        onClose={() => setAccountUser(null)}
        onResetPassword={
          accountUser?.role === "player"
            ? () => {
                if (accountUser) {
                  setResetPasswordUser(accountUser);
                  setAccountUser(null);
                }
              }
            : undefined
        }
      />
      <AdminResetPasswordModal
        user={resetPasswordUser}
        onClose={() => setResetPasswordUser(null)}
      />
    </div>
  );
}
