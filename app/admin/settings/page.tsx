"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { adminSaveSettings, errorMessage } from "@/lib/api";
import {
  DEFAULT_SETTINGS,
  PROVIDER_LABELS,
  type PaymentProvider,
  type PlatformSettings,
} from "@/lib/types";
import { Button, Card, Input } from "@/components/ui";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return onSnapshot(doc(db, "settings", "platform"), (snap) => {
      if (snap.exists()) setSettings({ ...DEFAULT_SETTINGS, ...(snap.data() as PlatformSettings) });
    });
  }, []);

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

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-bold">Platform Settings</h1>
      <p className="mb-6 text-sm text-slate-400">
        Commission rates, game limits and payment providers.
      </p>

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
    </div>
  );
}
