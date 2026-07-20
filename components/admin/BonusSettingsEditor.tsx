"use client";

function BonusRuleEditor({
  title,
  rule,
  onChange,
  showWeekendHours,
}: {
  title: string;
  rule: {
    enabled: boolean;
    percent: number;
    maxAmount: number;
    minDeposit: number;
    fridayStartHour?: number;
    sundayEndHour?: number;
    playerTitle?: string;
    playerTerms?: string;
  };
  onChange: (patch: Partial<typeof rule>) => void;
  showWeekendHours?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/60 p-4">
      <label className="mb-3 flex cursor-pointer items-center justify-between gap-3">
        <span className="text-sm font-semibold">{title}</span>
        <input
          type="checkbox"
          checked={rule.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="h-4 w-4 accent-violet-500"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs text-slate-400">
          Bonus % (50 = 50%)
          <input
            type="number"
            min={0}
            max={200}
            step={1}
            value={Math.round(rule.percent * 100)}
            onChange={(e) => onChange({ percent: Number(e.target.value) / 100 })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-slate-400">
          Max bonus (GMD)
          <input
            type="number"
            min={0}
            value={rule.maxAmount}
            onChange={(e) => onChange({ maxAmount: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-slate-400">
          Min deposit (GMD)
          <input
            type="number"
            min={0}
            value={rule.minDeposit}
            onChange={(e) => onChange({ minDeposit: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
          />
        </label>
      </div>
      {showWeekendHours && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-slate-400">
            Friday start hour (GMT, 18 = 6pm)
            <input
              type="number"
              min={0}
              max={23}
              value={rule.fridayStartHour ?? 18}
              onChange={(e) => onChange({ fridayStartHour: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Sunday end hour (GMT)
            <input
              type="number"
              min={0}
              max={23}
              value={rule.sundayEndHour ?? 23}
              onChange={(e) => onChange({ sundayEndHour: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
      )}
      <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
        <label className="block text-xs text-slate-400">
          Player title (optional)
          <input
            type="text"
            value={rule.playerTitle ?? ""}
            onChange={(e) => onChange({ playerTitle: e.target.value })}
            placeholder={title}
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block text-xs text-slate-400">
          Player rules (write anything — shown on wallet)
          <textarea
            value={rule.playerTerms ?? ""}
            onChange={(e) => onChange({ playerTerms: e.target.value })}
            rows={3}
            placeholder="e.g. Get 50% extra on every deposit. Bonus is for play only — must wager before withdrawing."
            className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm leading-relaxed text-white"
          />
        </label>
        <p className="text-[11px] text-slate-500">
          Leave blank to auto-generate from the numbers above. Write your own terms for turnover, fees, or
          anything else players should know.
        </p>
      </div>
    </div>
  );
}

export { BonusRuleEditor };
