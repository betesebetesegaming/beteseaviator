"use client";

import { formatXof } from "@/lib/format";
import type { PeriodAccounting } from "@/lib/ggrAccounting";
import { Card } from "@/components/ui";

function Row({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/5 py-3 last:border-0">
      <div>
        <p className="text-sm text-slate-300">{label}</p>
        {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      </div>
      <p className={`tabular-nums ${strong ? "text-lg font-bold text-emerald-300" : "font-semibold text-white"}`}>
        {value}
      </p>
    </div>
  );
}

export function AccountingSummaryTable({
  title,
  subtitle,
  providerName,
  providerRatePct,
  data,
}: {
  title: string;
  subtitle: string;
  providerName: string;
  providerRatePct: string;
  data: PeriodAccounting;
}) {
  return (
    <Card className="p-5">
      <h2 className="font-semibold text-white">{title}</h2>
      <p className="mb-4 text-xs text-slate-500">{subtitle}</p>
      <Row label="Total bets" value={formatXof(data.bets)} hint="All player wagers" />
      <Row label="Total wins" value={formatXof(data.wins)} hint="Paid back to players" />
      <Row
        label="GGR (sales profit)"
        value={formatXof(data.ggr)}
        hint="Bets minus wins — this is revenue"
        strong
      />
      <Row
        label={`${providerName} due`}
        value={formatXof(data.providerDue)}
        hint={`${providerRatePct}% of GGR`}
      />
      <Row
        label="Agents commission"
        value={formatXof(data.agentCommission)}
        hint="Credited to agent wallets in this period"
      />
      <Row
        label="BETESE keeps"
        value={formatXof(data.beteseKeeps)}
        hint="GGR minus QTech minus agents"
        strong
      />
    </Card>
  );
}
