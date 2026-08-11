"use client";

/**
 * Customer / agent account book: lifetime deposits, played, win/loss, wallet, ledger.
 * Admin can reset password; agents can open owned customers only (enforced by callable).
 */
import { useEffect, useState } from "react";
import { adminGetPlayerAccountSummary, errorMessage, type PlayerAccountSummary } from "@/lib/api";
import { formatDate, formatXof } from "@/lib/format";
import { formatPlayerId, playerDisplayId } from "@/lib/playerId";
import type { UserProfile } from "@/lib/types";
import { Button, EmptyState, Modal, Spinner, TableShell, Td, Th } from "@/components/ui";

type Props = {
  user: UserProfile | null;
  onClose: () => void;
  /** When set, shows Reset password (admin support). */
  onResetPassword?: () => void;
};

function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "bad" | "cash" | "bonus";
}) {
  const tones = {
    neutral: "border-white/10 bg-slate-950/50 text-white",
    good: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
    bad: "border-rose-500/25 bg-rose-500/10 text-rose-300",
    cash: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
    bonus: "border-violet-500/25 bg-violet-500/10 text-violet-300",
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

export function AdminCustomerSupportModal({ user, onClose, onResetPassword }: Props) {
  const [summary, setSummary] = useState<PlayerAccountSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setSummary(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSummary(null);
    void adminGetPlayerAccountSummary({ uid: user.uid, ledgerLimit: 100 })
      .then((res) => {
        if (!cancelled) setSummary(res);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;

  const totals = summary?.totals;
  const wallet = summary?.wallet;
  const cash = wallet?.balance ?? 0;
  const bonus = wallet?.bonusBalance ?? 0;
  const winLoss = totals?.winLoss ?? 0;
  const isPlayer = user.role === "player";

  return (
    <Modal open onClose={onClose} title={`Account — ${user.name}`} wide>
      <div className="space-y-4">
        {onResetPassword ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Admin only. Passwords cannot be read from the system (encrypted). Use{" "}
            <strong>Reset password</strong> to set a temporary password, sign in as the customer, and
            verify deposits / wallet. Share the new password securely, then ask them to change it.
          </div>
        ) : null}

        <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
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
            <dt className="text-xs text-slate-500">Role / Status</dt>
            <dd className="capitalize">
              {user.role} · {user.status}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Wallet</dt>
            <dd>{wallet?.frozen ? "Frozen" : "Active"}</dd>
          </div>
        </dl>

        {loading ? (
          <Spinner />
        ) : error ? (
          <p className="text-sm text-rose-300">{error}</p>
        ) : (
          <>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-white">Balances</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryCard label="Cash" value={formatXof(cash)} tone="cash" />
                <SummaryCard label="Bonus" value={formatXof(bonus)} tone="bonus" />
                <SummaryCard label="Playable total" value={formatXof(cash + bonus)} />
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-white">Lifetime account book</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <SummaryCard
                  label="Deposits"
                  value={formatXof(totals?.totalDeposits ?? 0)}
                  tone="good"
                />
                <SummaryCard
                  label="Withdrawals"
                  value={formatXof(totals?.totalWithdrawals ?? 0)}
                />
                <SummaryCard label="Played (bets)" value={formatXof(totals?.totalBets ?? 0)} />
                <SummaryCard
                  label="Wins"
                  value={formatXof(totals?.totalWins ?? 0)}
                  tone="good"
                />
                <SummaryCard
                  label="Win / Loss"
                  value={formatXof(winLoss)}
                  tone={winLoss > 0 ? "good" : winLoss < 0 ? "bad" : "neutral"}
                />
                <SummaryCard
                  label="Net cash in"
                  value={formatXof(
                    (totals?.totalDeposits ?? 0) - (totals?.totalWithdrawals ?? 0),
                  )}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Win/Loss = wins − bets. Positive means the customer is ahead; negative means they
                are down.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {onResetPassword ? (
                <Button onClick={onResetPassword}>Reset password (login &amp; fix)</Button>
              ) : null}
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-white">Recent wallet ledger</h3>
              {!summary?.transactions?.length ? (
                <EmptyState message="No transactions yet." />
              ) : (
                <TableShell>
                  <thead>
                    <tr>
                      <Th>When</Th>
                      <Th>Type</Th>
                      <Th className="text-right">Amount</Th>
                      <Th className="text-right">Balance after</Th>
                      <Th>Details</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.transactions.map((t) => (
                      <tr key={t.id}>
                        <Td className="whitespace-nowrap text-xs text-slate-400">
                          {t.createdAt ? formatDate(new Date(t.createdAt)) : "—"}
                        </Td>
                        <Td className="capitalize">{t.type}</Td>
                        <Td
                          className={`text-right tabular-nums font-semibold ${
                            t.amount >= 0 ? "text-emerald-300" : "text-rose-300"
                          }`}
                        >
                          {formatXof(t.amount)}
                        </Td>
                        <Td className="text-right tabular-nums text-slate-300">
                          {formatXof(t.balanceAfter)}
                        </Td>
                        <Td className="max-w-[14rem] truncate text-xs text-slate-400">
                          {t.description}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
