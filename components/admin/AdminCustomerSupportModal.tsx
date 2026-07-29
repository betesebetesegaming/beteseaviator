"use client";

/**
 * Admin-only support: inspect any customer wallet / recent money moves, and reset password.
 * Existing passwords cannot be viewed (Firebase Auth hashes) — admin sets a temporary one to log in and fix.
 */
import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firestore";
import { formatDate, formatXof } from "@/lib/format";
import { formatPlayerId, playerDisplayId } from "@/lib/playerId";
import type { UserProfile, Wallet, WalletTransaction } from "@/lib/types";
import { Button, EmptyState, Modal, Spinner, TableShell, Td, Th } from "@/components/ui";

type Props = {
  user: UserProfile | null;
  onClose: () => void;
  onResetPassword: () => void;
};

export function AdminCustomerSupportModal({ user, onClose, onResetPassword }: Props) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txs, setTxs] = useState<WalletTransaction[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || user.role !== "player") {
      setWallet(null);
      setTxs(null);
      return;
    }
    setLoading(true);
    let cancelled = false;
    void getDoc(doc(db, "wallets", user.uid)).then((snap) => {
      if (cancelled) return;
      setWallet(snap.exists() ? (snap.data() as Wallet) : null);
    });
    const q = query(
      collection(db, "transactions"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(40),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (cancelled) return;
        setTxs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WalletTransaction));
        setLoading(false);
      },
      () => {
        if (!cancelled) {
          setTxs([]);
          setLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [user]);

  if (!user) return null;

  const isPlayer = user.role === "player";
  const cash = wallet?.balance ?? 0;
  const bonus = wallet?.bonusBalance ?? 0;
  const playable = cash + bonus;

  return (
    <Modal open onClose={onClose} title={`Support — ${user.name}`} wide>
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Admin only. Passwords cannot be read from the system (encrypted). Use{" "}
          <strong>Reset password</strong> to set a temporary password, sign in as the customer, and
          verify deposits / wallet. Share the new password securely, then ask them to change it.
        </div>

        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Player ID</dt>
            <dd className="font-mono text-emerald-300">
              {isPlayer ? playerDisplayId(user) : formatPlayerId(user.playerNumber ?? 0)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Phone</dt>
            <dd className="tabular-nums">{user.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Status</dt>
            <dd>{user.status}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">UID</dt>
            <dd className="truncate font-mono text-[10px] text-slate-500">{user.uid}</dd>
          </div>
        </dl>

        {isPlayer ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-3">
                <p className="text-[10px] uppercase text-slate-400">Cash (deposit credit)</p>
                <p className="text-lg font-bold tabular-nums text-emerald-300">{formatXof(cash)}</p>
              </div>
              <div className="rounded-lg border border-violet-500/25 bg-violet-500/10 p-3">
                <p className="text-[10px] uppercase text-slate-400">Bonus (extra play)</p>
                <p className="text-lg font-bold tabular-nums text-violet-300">{formatXof(bonus)}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-slate-950/50 p-3">
                <p className="text-[10px] uppercase text-slate-400">Playable total</p>
                <p className="text-lg font-bold tabular-nums text-white">{formatXof(playable)}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Deposit of GMD 50 always credits <strong className="text-emerald-300">50 cash</strong>.
              First-deposit bonus may add <strong className="text-violet-300">+25 bonus</strong>{" "}
              (play only, not withdrawable until wagered). If a customer says “I got 25”, check
              whether they are looking at the bonus line only.
            </p>
          </>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={onResetPassword}>Reset password (login &amp; fix)</Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

        {isPlayer ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-white">Recent wallet ledger</h3>
            {loading ? (
              <Spinner />
            ) : !txs || txs.length === 0 ? (
              <EmptyState message="No transactions yet." />
            ) : (
              <TableShell>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Type</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Details</Th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <tr key={t.id}>
                      <Td className="whitespace-nowrap text-xs text-slate-400">
                        {t.createdAt ? formatDate(t.createdAt) : "—"}
                      </Td>
                      <Td className="capitalize">{t.type}</Td>
                      <Td
                        className={`text-right tabular-nums font-semibold ${
                          t.amount >= 0 ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        {formatXof(t.amount)}
                      </Td>
                      <Td className="max-w-[14rem] truncate text-xs text-slate-400">{t.description}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
