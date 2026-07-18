"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { doc, onSnapshot } from "firebase/firestore";
import Link from "next/link";
import { db } from "@/lib/firestore";
import { adminSaveSettings, errorMessage } from "@/lib/api";
import { mergePlatformSettings } from "@/lib/platformSettingsMerge";
import { DEFAULT_SETTINGS, type PlatformSettings } from "@/lib/types";
import { BonusesWalletSettingsFields } from "@/components/admin/BonusesWalletSettingsFields";
import { Button, Card } from "@/components/ui";

export default function AdminBonusesPage() {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return onSnapshot(doc(db, "settings", "platform"), (snap) => {
      if (snap.exists()) {
        setSettings(mergePlatformSettings(snap.data() as Partial<PlatformSettings>));
      }
      setSettingsLoaded(true);
    });
  }, []);

  async function save() {
    if (!settingsLoaded) {
      return toast.error("Still loading settings — wait a moment and try again.");
    }
    if ((settings.depositPlaythroughRate ?? 0.8) < 0 || (settings.depositPlaythroughRate ?? 0.8) > 1) {
      return toast.error("Deposit play-through must be between 0 and 1 (e.g. 0.8 = 80%).");
    }
    if ((settings.earlyWithdrawalFeeRate ?? 0.15) < 0 || (settings.earlyWithdrawalFeeRate ?? 0.15) > 1) {
      return toast.error("Early withdrawal fee must be between 0 and 1 (e.g. 0.15 = 15%).");
    }
    if ((settings.bonusWagerMultiplier ?? 3) < 1) {
      return toast.error("Bonus wager multiplier must be at least 1.");
    }
    if (settings.minWithdrawal < 0 || settings.minDeposit < 0) {
      return toast.error("Minimum amounts cannot be negative.");
    }
    if (settings.minDeposit < 25) {
      return toast.error("Minimum deposit is GMD 25.");
    }
    setBusy(true);
    try {
      await adminSaveSettings({
        minDeposit: settings.minDeposit,
        minWithdrawal: settings.minWithdrawal,
        depositPlaythroughRate: settings.depositPlaythroughRate,
        earlyWithdrawalFeeRate: settings.earlyWithdrawalFeeRate,
        bonusWagerMultiplier: settings.bonusWagerMultiplier,
        bonusGamesLabel: settings.bonusGamesLabel,
        bonusIntroText: settings.bonusIntroText,
        withdrawalRulesText: settings.withdrawalRulesText,
        bonusCampaignEndsAt: settings.bonusCampaignEndsAt ?? "",
        bonuses: settings.bonuses,
      });
      toast.success("Bonuses & wallet rules saved — players see changes immediately.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-bold">Bonuses &amp; Wallet</h1>
      <p className="mb-6 text-sm text-slate-400">
        Set minimum withdrawal, deposit bonuses, custom player rules, and withdrawal text. Changes apply live
        on the player wallet — no redeploy needed.
      </p>

      <Card className="mb-5 border-violet-500/20 bg-violet-500/5">
        <p className="text-sm text-slate-300">
          Current minimum withdrawal:{" "}
          <span className="font-bold text-violet-200">{settings.minWithdrawal} GMD</span>
        </p>
        <p className="mt-1 text-sm text-slate-300">
          Current minimum deposit:{" "}
          <span className="font-bold text-violet-200">{settings.minDeposit} GMD</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Commission rates and bet limits are on{" "}
          <Link href="/admin/settings" className="text-emerald-400 hover:underline">
            Platform Settings
          </Link>
          .
        </p>
      </Card>

      <Card className="mb-6">
        {!settingsLoaded ? (
          <p className="text-sm text-slate-400">Loading bonus settings…</p>
        ) : (
          <BonusesWalletSettingsFields settings={settings} onChange={setSettings} />
        )}
      </Card>

      <Button className="w-full" onClick={save} disabled={busy || !settingsLoaded}>
        {busy ? "Saving…" : "Save bonuses & wallet rules"}
      </Button>
    </div>
  );
}
