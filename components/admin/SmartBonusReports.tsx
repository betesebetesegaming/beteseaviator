"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firestore";
import { formatXof } from "@/lib/format";
import { offerStatusMeta } from "@/lib/smartBonus";
import type { SmartBonusOffer, SmartBonusOfferStatus } from "@/lib/types";
import { Card, EmptyState, Select, StatCard, TableShell, Td, Th } from "@/components/ui";

type Period = "7" | "30" | "90" | "all";

const STATUSES: SmartBonusOfferStatus[] = [
  "pending",
  "approved",
  "sent",
  "activated",
  "completed",
  "rejected",
  "expired",
];

/** Smart Bonus reporting — issued, activated, conversion, revenue, marketer performance. */
export function SmartBonusReports({ offers }: { offers: SmartBonusOffer[] | null }) {
  const [period, setPeriod] = useState<Period>("30");
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});
  const [renderNow] = useState(() => Date.now());

  const scoped = useMemo(() => {
    if (!offers) return null;
    if (period === "all") return offers;
    const cutoff = renderNow - Number(period) * 86_400_000;
    return offers.filter((o) => {
      const ms = o.createdAt?.toDate?.().getTime() ?? 0;
      return ms >= cutoff;
    });
  }, [offers, period, renderNow]);

  const stats = useMemo(() => {
    const all = scoped ?? [];
    const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<SmartBonusOfferStatus, number>;
    for (const o of all) counts[o.status] = (counts[o.status] ?? 0) + 1;

    const issued = all.length;
    const activated = counts.activated + counts.completed;
    // "Made available" = everything that reached the player or beyond.
    const madeAvailable = counts.approved + counts.sent + counts.activated + counts.completed + counts.expired;
    const conversion = madeAvailable > 0 ? Math.round((activated / madeAvailable) * 100) : 0;
    const reactivation = issued > 0 ? Math.round((activated / issued) * 100) : 0;
    const bonusCredited = all.reduce((s, o) => s + (o.bonusCredited ?? 0), 0);
    const depositsDriven = all.reduce((s, o) => s + (o.matchedDeposit ?? 0), 0);
    const aiOffers = all.filter((o) => o.aiGenerated);
    const avgConfidence =
      aiOffers.length > 0
        ? Math.round((aiOffers.reduce((s, o) => s + (o.confidence ?? 0), 0) / aiOffers.length) * 100)
        : null;

    return { counts, issued, activated, conversion, reactivation, bonusCredited, depositsDriven, aiShare: aiOffers.length, avgConfidence };
  }, [scoped]);

  // Marketer performance: aggregate by owning agent.
  const marketers = useMemo(() => {
    const map = new Map<string, { issued: number; activated: number; deposits: number }>();
    for (const o of scoped ?? []) {
      const id = o.agentId;
      if (!id) continue;
      const row = map.get(id) ?? { issued: 0, activated: 0, deposits: 0 };
      row.issued += 1;
      if (o.status === "activated" || o.status === "completed") {
        row.activated += 1;
        row.deposits += o.matchedDeposit ?? 0;
      }
      map.set(id, row);
    }
    return Array.from(map.entries())
      .map(([agentId, v]) => ({ agentId, ...v }))
      .sort((a, b) => b.activated - a.activated || b.issued - a.issued)
      .slice(0, 15);
  }, [scoped]);

  useEffect(() => {
    const missing = marketers.map((m) => m.agentId).filter((id) => !(id in agentNames));
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(
      missing.map(async (id) => {
        try {
          const snap = await getDoc(doc(db, "users", id));
          return [id, snap.exists() ? String(snap.data()?.name ?? id) : id] as const;
        } catch {
          return [id, id] as const;
        }
      })
    ).then((pairs) => {
      if (cancelled) return;
      setAgentNames((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => {
      cancelled = true;
    };
  }, [marketers, agentNames]);

  if (!scoped) return <EmptyState message="Loading reports…" />;

  const maxStatus = Math.max(1, ...STATUSES.map((s) => stats.counts[s]));

  return (
    <div>
      <div className="mb-4 max-w-xs">
        <Select label="Reporting period" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </Select>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Bonuses issued" value={stats.issued} />
        <StatCard label="Activated" value={stats.activated} />
        <StatCard label="Conversion rate" value={`${stats.conversion}%`} hint="activated ÷ made available" />
        <StatCard label="Reactivation rate" value={`${stats.reactivation}%`} hint="activated ÷ issued" />
        <StatCard label="Bonus credited" value={formatXof(stats.bonusCredited)} />
        <StatCard label="Deposits driven" value={formatXof(stats.depositsDriven)} hint="revenue from activations" />
        <StatCard label="AI-sized offers" value={stats.aiShare} />
        <StatCard
          label="Avg AI confidence"
          value={stats.avgConfidence === null ? "—" : `${stats.avgConfidence}%`}
        />
      </div>

      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Offers by status</h3>
        <div className="space-y-2">
          {STATUSES.map((s) => {
            const meta = offerStatusMeta(s);
            const n = stats.counts[s];
            return (
              <div key={s} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-slate-300">{meta.label}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-slate-800">
                  <div className={`h-full ${meta.bg}`} style={{ width: `${(n / maxStatus) * 100}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right tabular-nums text-slate-400">{n}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Marketer performance</h3>
        {marketers.length === 0 ? (
          <EmptyState message="No marketer-linked offers in this period." />
        ) : (
          <TableShell>
            <thead>
              <tr>
                <Th>Marketer</Th>
                <Th>Offers</Th>
                <Th>Activated</Th>
                <Th>Conv.</Th>
                <Th>Deposits driven</Th>
              </tr>
            </thead>
            <tbody>
              {marketers.map((m) => (
                <tr key={m.agentId}>
                  <Td className="font-medium">{agentNames[m.agentId] ?? m.agentId.slice(0, 8)}</Td>
                  <Td className="tabular-nums">{m.issued}</Td>
                  <Td className="tabular-nums text-emerald-300">{m.activated}</Td>
                  <Td className="tabular-nums">{m.issued > 0 ? Math.round((m.activated / m.issued) * 100) : 0}%</Td>
                  <Td className="tabular-nums">{formatXof(m.deposits)}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </Card>

      <p className="mt-4 text-xs text-slate-500">
        Revenue figures reflect the matching deposits players made to activate their bonus. Post-activation GGR and
        long-run retention accrue through the normal wallet ledger and agent commission reports.
      </p>
    </div>
  );
}
