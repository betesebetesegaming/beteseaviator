"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Banknote } from "lucide-react";
import { db } from "@/lib/firestore";
import { useAuth } from "@/lib/auth-context";
import { formatXof } from "@/lib/format";
import { monthRangeIso } from "@/lib/ggrAccounting";
import { monthEndPayFromFirstOpen } from "@/lib/marketerFirstDepositPay";
import type { AgentDailyStats } from "@/lib/types";
import { Card } from "@/components/ui";

/** Marketer home: first-open cash is the sale. Customer play is not. */
export function MarketerFirstOpenCash() {
  const { profile } = useAuth();
  const month = useMemo(() => monthRangeIso(), []);
  const [monthCash, setMonthCash] = useState<number | null>(null);
  const [monthCount, setMonthCount] = useState(0);

  useEffect(() => {
    if (!profile?.uid) return;
    const q = query(
      collection(db, "agentDailyStats"),
      where("agentId", "==", profile.uid),
      where("date", ">=", month.from)
    );
    return onSnapshot(
      q,
      (snap) => {
        let cash = 0;
        let count = 0;
        for (const d of snap.docs) {
          const row = d.data() as AgentDailyStats;
          if (String(row.date || "") > month.to) continue;
          cash += Number(row.firstDeposits ?? 0);
          count += Number(row.firstDepositCount ?? 0);
        }
        setMonthCash(Math.round(cash * 100) / 100);
        setMonthCount(count);
      },
      () => {
        setMonthCash(0);
        setMonthCount(0);
      }
    );
  }, [profile?.uid, month.from, month.to]);

  const lifetime = Number(profile?.stats?.firstDeposits ?? 0);
  const lifetimeCount = Number(profile?.stats?.firstDepositCount ?? 0);
  const thisMonth = monthCash ?? 0;
  const pay = monthEndPayFromFirstOpen(thisMonth);

  return (
    <Card className="border-emerald-500/40 bg-emerald-500/10">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">
            Your sales — first-open cash
          </p>
          <p className="mt-1 text-sm text-emerald-100/80">
            When a customer opens via your link and makes their first deposit, that cash is added
            here. BETESE pays you on this number at month end — not on bets or play.
          </p>
        </div>
        <Banknote className="shrink-0 text-emerald-300" size={22} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-emerald-200/70">This month</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-white">{formatXof(thisMonth)}</p>
          <p className="mt-1 text-xs text-emerald-200/70">
            {monthCount} first deposit{monthCount === 1 ? "" : "s"} · {month.label}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-emerald-200/70">Month-end pay band</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-200">{formatXof(pay.pay)}</p>
          <p className="mt-1 text-xs text-emerald-200/70">
            {pay.nextMin != null && pay.remainingToNext != null
              ? `${formatXof(pay.remainingToNext)} more to reach ${formatXof(pay.nextPay ?? 0)}`
              : pay.pay > 0
                ? "Top band"
                : "Reach 40,000 GMD for 7,000 GMD"}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-emerald-200/70">Lifetime (never reduces)</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-white">{formatXof(lifetime)}</p>
          <p className="mt-1 text-xs text-emerald-200/70">
            {lifetimeCount} first-time customer{lifetimeCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-amber-500/30 bg-slate-950/50 px-3 py-2 text-xs text-amber-100/90">
        <span className="font-semibold text-amber-200">Not your sale: </span>
        Customer play / bets / GGR is money they wagered after depositing. It can go up or down.
        It is not first-open cash and is not used for this month-end pay.
      </div>
    </Card>
  );
}
