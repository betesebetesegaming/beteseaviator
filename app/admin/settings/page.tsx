"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firestore";
import { adminRebuildPlatformStats, adminSaveSettings, errorMessage } from "@/lib/api";
import {
  DEFAULT_SETTINGS,
  PROVIDER_LABELS,
  type BonusSettings,
  type PaymentProvider,
  type PlatformSettings,
} from "@/lib/types";
import { mergeBonusSettings } from "@/lib/bonuses";
import { BonusRuleEditor } from "@/components/admin/BonusSettingsEditor";
import { Button, Card, Input } from "@/components/ui";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);

  useEffect(() => {
    return onSnapshot(doc(db, "settings", "platform"), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as PlatformSettings;
        setSettings({
          ...DEFAULT_SETTINGS,
          ...data,
          providers: { ...DEFAULT_SETTINGS.providers, ...(data.providers ?? {}) },
          bonuses: mergeBonusSettings(data.bonuses),
          apiProviderName: data.apiProviderName ?? DEFAULT_SETTINGS.apiProviderName,
          apiProviderRate: data.apiProviderRate ?? DEFAULT_SETTINGS.apiProviderRate,
          depositPlaythroughRate: data.depositPlaythroughRate ?? DEFAULT_SETTINGS.depositPlaythroughRate,
          earlyWithdrawalFeeRate: data.earlyWithdrawalFeeRate ?? DEFAULT_SETTINGS.earlyWithdrawalFeeRate,
          bonusWagerMultiplier: data.bonusWagerMultiplier ?? DEFAULT_SETTINGS.bonusWagerMultiplier,
        });
      }
    });
  }, []);

  function updateBonus(key: keyof BonusSettings, patch: Partial<BonusSettings[keyof BonusSettings]>) {
    setSettings((prev) => ({
      ...prev,
      bonuses: {
        ...mergeBonusSettings(prev.bonuses),
        [key]: { ...mergeBonusSettings(prev.bonuses)[key], ...patch },
      },
    }));
  }

  function num(key: keyof PlatformSettings) {
    return {
      value: String(settings[key] ?? ""),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setSettings({ ...settings, [key]: Number(e.target.value) }),
    };
  }

  async function save() {
    if (settings.subAgentRate < 0 || settings.subAgentRate > 1)
      return toast.error("Sub agent rate must be between 0 and 1 (e.g. 0.05 = 5%).");
    if (settings.superAgentRate < 0 || settings.superAgentRate > 1)
      return toast.error("Super agent rate must be between 0 and 1 (e.g. 0.03 = 3%).");
    if (settings.apiProviderRate < 0 || settings.apiProviderRate > 1)
      return toast.error("API provider rate must be between 0 and 1 (e.g. 0.15 = 15%).");
    if ((settings.depositPlaythroughRate ?? 0.8) < 0 || (settings.depositPlaythroughRate ?? 0.8) > 1)
      return toast.error("Deposit play-through must be between 0 and 1 (e.g. 0.8 = 80%).");
    if ((settings.earlyWithdrawalFeeRate ?? 0.15) < 0 || (settings.earlyWithdrawalFeeRate ?? 0.15) > 1)
      return toast.error("Early withdrawal fee must be between 0 and 1 (e.g. 0.15 = 15%).");
    if ((settings.bonusWagerMultiplier ?? 3) < 1)
      return toast.error("Bonus wager multiplier must be at least 1.");
    setBusy(true);
    try {
      await adminSaveSettings({ ...settings });
      toast.success("Settings saved — they apply immediately, no redeploy needed.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function rebuildStats() {
    setRebuilding(true);
    try {
      const res = await adminRebuildPlatformStats({});
      toast.success(
        `Stats rebuilt — GGR ${res.ggr} GMD, deposits ${res.totalDeposits}, withdrawals ${res.totalWithdrawals}.`
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRebuilding(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-bold">Platform Settings</h1>
      <p className="mb-6 text-sm text-slate-400">
        Commission rates, game limits and payment providers.
      </p>

      <Card className="mb-5">
        <h2 className="mb-4 font-semibold">API provider commission (share of GGR)</h2>
        <p className="mb-4 text-sm text-slate-400">
          Set the game/API provider name and what percent of total GGR (bets minus wins) you owe
          them. The admin dashboard shows the calculated amount due.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Provider name"
            value={settings.apiProviderName ?? ""}
            onChange={(e) => setSettings({ ...settings, apiProviderName: e.target.value })}
          />
          <Input
            label="GGR commission rate (0.15 = 15%)"
            type="number"
            step="0.01"
            value={String(settings.apiProviderRate ?? 0)}
            onChange={(e) => setSettings({ ...settings, apiProviderRate: Number(e.target.value) })}
          />
        </div>
      </Card>

      <Card className="mb-5">
        <h2 className="mb-4 font-semibold">Commission rates (share of GGR)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Sub agent rate (0.05 = 5%)" type="number" step="0.01" {...num("subAgentRate")} />
          <Input
            label="Super agent rate (0.03 = 3%)"
            type="number"
            step="0.01"
            {...num("superAgentRate")}
          />
        </div>
      </Card>

      <Card className="mb-5">
        <h2 className="mb-4 font-semibold">Withdrawal &amp; bonus wagering</h2>
        <p className="mb-4 text-sm text-slate-400">
          Players must wager a fraction of deposits before free withdrawal. Early withdrawal charges a fee and
          forfeits bonus. Bonus must be wagered multiple times before it becomes cash.
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
      </Card>

      <Card className="mb-5">
        <h2 className="mb-4 font-semibold">Game & money limits (GMD)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Min bet" type="number" {...num("minBet")} />
          <Input label="Max bet" type="number" {...num("maxBet")} />
          <Input label="Min deposit" type="number" {...num("minDeposit")} />
          <Input label="Min withdrawal" type="number" {...num("minWithdrawal")} />
          <Input label="Min auto-cashout" type="number" step="0.01" {...num("minAutoCashout")} />
          <Input label="Max auto-cashout" type="number" {...num("maxAutoCashout")} />
        </div>
      </Card>

      <Card className="mb-5">
        <h2 className="mb-1 font-semibold">Deposit bonuses</h2>
        <p className="mb-4 text-sm text-slate-400">
          Bonuses credit the player&apos;s bonus balance (for Aviator bets). First deposit, weekly
          crash, and weekend (Friday night) bonuses can stack on one deposit.
        </p>
        <div className="space-y-4">
          <BonusRuleEditor
            title="First deposit bonus"
            rule={mergeBonusSettings(settings.bonuses).firstDeposit}
            onChange={(patch) => updateBonus("firstDeposit", patch)}
          />
          <BonusRuleEditor
            title="Weekly crash bonus (once per week)"
            rule={mergeBonusSettings(settings.bonuses).weeklyCrash}
            onChange={(patch) => updateBonus("weeklyCrash", patch)}
          />
          <BonusRuleEditor
            title="Weekend bonus (Friday night deposits)"
            rule={mergeBonusSettings(settings.bonuses).weekend}
            onChange={(patch) => updateBonus("weekend", patch)}
            showWeekendHours
          />
        </div>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold">Payment providers</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(PROVIDER_LABELS) as PaymentProvider[]).map((p) => (
            <label
              key={p}
              className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-slate-950/60 px-4 py-3"
            >
              <span className="text-sm font-medium">{PROVIDER_LABELS[p]}</span>
              <input
                type="checkbox"
                checked={settings.providers?.[p] !== false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    providers: { ...settings.providers, [p]: e.target.checked },
                  })
                }
                className="h-4 w-4 accent-emerald-500"
              />
            </label>
          ))}
        </div>
      </Card>

      <Button className="w-full" onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save Settings"}
      </Button>
      <Button
        variant="secondary"
        className="mt-3 w-full"
        onClick={rebuildStats}
        disabled={rebuilding}
      >
        {rebuilding ? "Rebuilding…" : "Rebuild dashboard totals from ledger"}
      </Button>
    </div>
  );
}
