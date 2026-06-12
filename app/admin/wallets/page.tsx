"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { Search, Snowflake, SlidersHorizontal } from "lucide-react";
import { db } from "@/lib/firestore";
import { adminAdjustWallet, adminFreezeWallet, errorMessage } from "@/lib/api";
import { formatXof, normalizePhone } from "@/lib/format";
import type { UserProfile, Wallet } from "@/lib/types";
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

export default function AdminWalletsPage() {
  const [users, setUsers] = useState<UserProfile[] | null>(null);
  const [wallets, setWallets] = useState<Record<string, Wallet>>({});
  const [search, setSearch] = useState("");

  const [adjustTarget, setAdjustTarget] = useState<Row | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

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

  const rows: Row[] | null = useMemo(() => {
    if (!users) return null;
    let list = users
      .filter((u) => u.role !== "admin")
      .map((u) => ({ ...u, wallet: wallets[u.uid] }));
    const s = search.trim().toLowerCase();
    if (s) {
      list = list.filter(
        (u) =>
          u.name?.toLowerCase().includes(s) ||
          u.email?.toLowerCase().includes(s) ||
          u.agentSlug?.toLowerCase().includes(s) ||
          u.phone?.includes(normalizePhone(s) || s)
      );
    }
    return list;
  }, [users, wallets, search]);

  async function adjust() {
    if (!adjustTarget) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt === 0)
      return toast.error("Enter a non-zero amount (negative to debit).");
    if (!reason.trim()) return toast.error("A reason is mandatory — it goes in the audit log.");
    setBusy(true);
    try {
      const res = await adminAdjustWallet({
        uid: adjustTarget.uid,
        amount: amt,
        reason: reason.trim(),
      });
      toast.success(`Adjusted. New balance: ${formatXof(res.newBalance)}.`);
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

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold">Wallets</h1>
        <p className="text-sm text-slate-400">
          Adjust any balance (with a mandatory, logged reason) or freeze a wallet. Frozen wallets
          cannot bet or withdraw.
        </p>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
        <Input
          placeholder="Search name, phone, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {!rows ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState message="No users match." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Balance</Th>
              <Th>Wallet</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.uid}>
                <Td className="font-medium">{r.name}</Td>
                <Td>
                  <Badge value={r.role} />
                </Td>
                <Td className="font-semibold tabular-nums">
                  {r.wallet ? formatXof(r.wallet.balance) : "—"}
                </Td>
                <Td>
                  <Badge value={r.wallet?.frozen ? "suspended" : "active"} />
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="!px-2.5 !py-1 text-xs"
                      onClick={() => setAdjustTarget(r)}
                    >
                      <span className="flex items-center gap-1">
                        <SlidersHorizontal size={13} /> Adjust
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
            ))}
          </tbody>
        </TableShell>
      )}

      <Modal
        open={!!adjustTarget}
        onClose={() => setAdjustTarget(null)}
        title={`Adjust ${adjustTarget?.name ?? ""}'s wallet`}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Current balance:{" "}
            <strong>{adjustTarget?.wallet ? formatXof(adjustTarget.wallet.balance) : "—"}</strong>.
            Use a negative amount to debit.
          </p>
          <Input
            label="Amount (GMD, negative = debit)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Input
            label="Reason (required, audited)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button className="w-full" onClick={adjust} disabled={busy}>
            {busy ? "Adjusting…" : "Apply Adjustment"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
