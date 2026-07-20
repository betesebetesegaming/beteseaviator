"use client";

import { mergeBonusSettings, bonusCampaignEndFromInput, bonusCampaignEndInputValue } from "@/lib/bonuses";
import type { BonusSettings, PlatformSettings } from "@/lib/types";
import { BonusRuleEditor } from "@/components/admin/BonusSettingsEditor";
import { Input } from "@/components/ui";

type Props = {
  settings: PlatformSettings;
  onChange: (next: PlatformSettings) => void;
};

function AdminTextArea({
  label,
  hint,
  placeholder,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm leading-relaxed text-white"
      />
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export function BonusesWalletSettingsFields({ settings, onChange }: Props) {
  function num(key: keyof PlatformSettings) {
    return {
      value: String(settings[key] ?? ""),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        onChange({ ...settings, [key]: Number(e.target.value) }),
    };
  }

  function updateBonus(key: keyof BonusSettings, patch: Partial<BonusSettings[keyof BonusSettings]>) {
    const bonuses = mergeBonusSettings(settings.bonuses);
    onChange({
      ...settings,
      bonuses: {
        ...bonuses,
        [key]: { ...bonuses[key], ...patch },
      },
    });
  }

  const bonusRules = mergeBonusSettings(settings.bonuses);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Minimum withdrawal (GMD)" type="number" min={0} {...num("minWithdrawal")} />
        <Input label="Minimum deposit (GMD)" type="number" min={20} {...num("minDeposit")} />
      </div>

      <div className="mt-5 rounded-lg border border-violet-500/25 bg-violet-500/5 p-4">
        <label className="block text-xs font-semibold text-violet-200">
          Bonus campaign end date (GMT)
        </label>
        <p className="mb-2 mt-1 text-[11px] text-slate-400">
          After this date and time, <strong className="text-white">no new deposit bonuses</strong> are
          given. Leave blank to run bonuses with no end. Existing bonus balances still work until
          wagered or forfeited.
        </p>
        <input
          type="datetime-local"
          value={bonusCampaignEndInputValue(settings.bonusCampaignEndsAt)}
          onChange={(e) =>
            onChange({
              ...settings,
              bonusCampaignEndsAt: bonusCampaignEndFromInput(e.target.value),
            })
          }
          className="w-full max-w-xs rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
        />
        {settings.bonusCampaignEndsAt ? (
          <p className="mt-2 text-[11px] text-amber-200">
            Bonuses stop automatically after{" "}
            {settings.bonusCampaignEndsAt.replace("T", " ").replace(".000Z", " GMT")}
          </p>
        ) : null}
      </div>

      <div className="mt-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-200">Withdrawal &amp; bonus wagering</h3>
        <p className="mb-3 text-xs text-slate-400">
          Shown on the player wallet withdraw tab. Early withdrawal before play-through charges a fee and
          forfeits bonus.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Deposit play-through (0.8 = 80%)"
            type="number"
            step="0.01"
            {...num("depositPlaythroughRate")}
          />
          <Input
            label="Early withdrawal fee (0.15 = 15%)"
            type="number"
            step="0.01"
            {...num("earlyWithdrawalFeeRate")}
          />
          <Input
            label="Bonus wager multiplier (3 = 3×)"
            type="number"
            step="1"
            {...num("bonusWagerMultiplier")}
          />
        </div>
        <div className="mt-4">
          <AdminTextArea
            label="Withdrawal rules text (shown to players)"
            hint="Write your own message. Leave blank to auto-build from the percentages above."
            placeholder="If you deposit you must make total play turnover before withdrawing. If you collect your money early, 15% will be deducted."
            value={settings.withdrawalRulesText ?? ""}
            onChange={(withdrawalRulesText) => onChange({ ...settings, withdrawalRulesText })}
            rows={4}
          />
        </div>
      </div>

      <div className="mt-5">
        <Input
          label="Bonus games label (player wallet)"
          placeholder="Aviator & Crash"
          value={settings.bonusGamesLabel ?? ""}
          onChange={(e) => onChange({ ...settings, bonusGamesLabel: e.target.value })}
        />
        <p className="mt-1 text-xs text-slate-500">
          Shown where players see which games bonus balance applies to.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200">Deposit bonuses</h3>
        <AdminTextArea
          label="Deposit bonuses intro (shown on player wallet)"
          hint="Leave blank for the default intro. Write anything you want players to read first."
          placeholder="Bonuses credit the player's bonus balance. First deposit is one-time; weekly/weekend only if enabled."
          value={settings.bonusIntroText ?? ""}
          onChange={(bonusIntroText) => onChange({ ...settings, bonusIntroText })}
          rows={3}
        />
        <BonusRuleEditor
          title="First deposit bonus (one-time only)"
          rule={bonusRules.firstDeposit}
          onChange={(patch) => updateBonus("firstDeposit", patch)}
        />
        <BonusRuleEditor
          title="Weekly crash bonus (once per week)"
          rule={bonusRules.weeklyCrash}
          onChange={(patch) => updateBonus("weeklyCrash", patch)}
        />
        <BonusRuleEditor
          title="Weekend bonus (Friday night deposits)"
          rule={bonusRules.weekend}
          onChange={(patch) => updateBonus("weekend", patch)}
          showWeekendHours
        />
      </div>
    </>
  );
}
