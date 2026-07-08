"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, query } from "firebase/firestore";
import { PhoneCall, Sparkles, TrendingDown, Crown, RefreshCw } from "lucide-react";
import { db } from "@/lib/firestore";
import { formatXof } from "@/lib/format";
import { formatPlayerId } from "@/lib/playerId";
import { isActiveOfferStatus } from "@/lib/smartBonus";
import { tierMeta } from "@/lib/smartBonus";
import type { PlayerHealth, SmartBonusOffer } from "@/lib/types";
import { Card, EmptyState, Spinner } from "@/components/ui";

/** The AI's morning briefing for admins: who to act on today. */
export function SmartBonusBriefing({ offers }: { offers: SmartBonusOffer[] | null }) {
  const [health, setHealth] = useState<PlayerHealth[] | null>(null);
  const [renderNow] = useState(() => Date.now());

  useEffect(() => {
    const q = query(collection(db, "playerHealth"), limit(2000));
    return onSnapshot(
      q,
      (snap) => setHealth(snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as PlayerHealth)),
      () => setHealth([])
    );
  }, []);

  const activeUserIds = useMemo(() => {
    const s = new Set<string>();
    for (const o of offers ?? []) if (isActiveOfferStatus(o.status)) s.add(o.userId);
    return s;
  }, [offers]);

  const buckets = useMemo(() => {
    const h = health ?? [];
    const lapsedTiers = new Set(["at_risk", "inactive", "dormant"]);

    const eligible = h
      .filter((p) => p.eligible && !activeUserIds.has(p.uid))
      .sort((a, b) => b.recommendedBonus - a.recommendedBonus)
      .slice(0, 20);

    const toContact = h
      .filter((p) => lapsedTiers.has(p.tier) && !activeUserIds.has(p.uid))
      .sort((a, b) => a.healthScore - b.healthScore)
      .slice(0, 20);

    const highValue = h
      .filter((p) => lapsedTiers.has(p.tier) && p.lifetimeDeposits > 0)
      .sort((a, b) => b.lifetimeDeposits - a.lifetimeDeposits)
      .slice(0, 12);

    const declining = h
      .filter((p) => p.daysSinceLastBet >= 7 && p.daysSinceLastBet < 30 && p.activeBettingDays30 <= 3)
      .sort((a, b) => b.daysSinceLastBet - a.daysSinceLastBet)
      .slice(0, 15);

    const cutoff = renderNow - 7 * 86_400_000;
    const reactivated = (offers ?? [])
      .filter((o) => {
        if (o.status !== "activated" && o.status !== "completed") return false;
        const ms = o.activatedAt?.toDate?.().getTime() ?? 0;
        return ms >= cutoff;
      })
      .sort((a, b) => (b.activatedAt?.toDate?.().getTime() ?? 0) - (a.activatedAt?.toDate?.().getTime() ?? 0))
      .slice(0, 15);

    return { eligible, toContact, highValue, declining, reactivated };
  }, [health, activeUserIds, offers, renderNow]);

  if (health === null) return <Spinner label="Preparing the AI briefing…" />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BriefingCard
        icon={<Sparkles size={16} className="text-violet-300" />}
        title="Eligible for a Smart Bonus"
        hint="Approve these to send a welcome-back offer"
        rows={buckets.eligible.map((p) => ({
          key: p.uid,
          name: p.name,
          id: p.playerNumber,
          right: formatXof(p.recommendedBonus),
          sub: `${p.daysSinceLastBet}d inactive`,
        }))}
      />
      <BriefingCard
        icon={<Crown size={16} className="text-amber-300" />}
        title="High-value players at risk"
        hint="Your best customers slipping away"
        rows={buckets.highValue.map((p) => ({
          key: p.uid,
          name: p.name,
          id: p.playerNumber,
          right: formatXof(p.lifetimeDeposits),
          sub: `${tierMeta(p.tier).label} · ${p.daysSinceLastBet}d`,
        }))}
      />
      <BriefingCard
        icon={<PhoneCall size={16} className="text-sky-300" />}
        title="Customers to contact"
        hint="Lowest health scores — reach out"
        rows={buckets.toContact.map((p) => ({
          key: p.uid,
          name: p.name,
          id: p.playerNumber,
          right: String(p.healthScore),
          sub: tierMeta(p.tier).label,
        }))}
      />
      <BriefingCard
        icon={<TrendingDown size={16} className="text-orange-300" />}
        title="Declining activity"
        hint="Trending down — intervene before they lapse"
        rows={buckets.declining.map((p) => ({
          key: p.uid,
          name: p.name,
          id: p.playerNumber,
          right: `${p.daysSinceLastBet}d`,
          sub: `${p.activeBettingDays30} active days/30`,
        }))}
      />
      <div className="lg:col-span-2">
        <BriefingCard
          icon={<RefreshCw size={16} className="text-emerald-300" />}
          title="Recently reactivated (last 7 days)"
          hint="Smart Bonus wins — players who came back and deposited"
          rows={buckets.reactivated.map((o) => ({
            key: o.id,
            name: o.userName,
            id: o.playerNumber,
            right: formatXof(o.bonusCredited ?? o.bonusAmount),
            sub: `deposited ${formatXof(o.matchedDeposit ?? o.matchDeposit)}`,
          }))}
        />
      </div>
    </div>
  );
}

function BriefingCard({
  icon,
  title,
  hint,
  rows,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  rows: { key: string; name: string; id: number | null; right: string; sub: string }[];
}) {
  return (
    <Card className="h-full">
      <div className="mb-1 flex items-center gap-2 font-semibold">
        {icon} {title}
        <span className="ml-auto rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{rows.length}</span>
      </div>
      <p className="mb-3 text-xs text-slate-500">{hint}</p>
      {rows.length === 0 ? (
        <EmptyState message="Nothing here today." />
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {rows.map((r) => (
            <li
              key={r.key}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-slate-950/40 px-2.5 py-1.5 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{r.name}</div>
                <div className="font-mono text-[11px] text-slate-500">
                  {r.id ? formatPlayerId(r.id) : "—"} · {r.sub}
                </div>
              </div>
              <span className="shrink-0 font-semibold tabular-nums text-slate-200">{r.right}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
