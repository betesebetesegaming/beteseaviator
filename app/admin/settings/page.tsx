"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { doc, onSnapshot } from "firebase/firestore";
import Link from "next/link";
import { db } from "@/lib/firestore";
import { adminRebuildPlatformStats, adminBackfillPlayerAccountStats, adminReleaseReferralBonuses, adminSaveSettings, errorMessage } from "@/lib/api";
import {
  DEFAULT_SETTINGS,
  PROVIDER_LABELS,
  type PaymentProvider,
  type PlatformSettings,
} from "@/lib/types";
import {
  commissionRateToPercent,
  parseCommissionRate,
  percentToCommissionRate,
} from "@/lib/commissionRate";
import { mergePlatformSettings } from "@/lib/platformSettingsMerge";
import { formatXof } from "@/lib/format";
import { Button, Card, Input } from "@/components/ui";

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildingCustomers, setRebuildingCustomers] = useState(false);
  const [releasingReferrals, setReleasingReferrals] = useState(false);

  useEffect(() => {
    return onSnapshot(doc(db, "settings", "platform"), (snap) => {
      if (snap.exists()) {
        setSettings(mergePlatformSettings(snap.data() as Partial<PlatformSettings>));
      }
    });
  }, []);

  function num(key: keyof PlatformSettings) {
    return {
      value: String(settings[key] ?? ""),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setSettings({ ...settings, [key]: Number(e.target.value) }),
    };
  }

  function percentField(key: "agentRate" | "apiProviderRate") {
    const fallback = key === "agentRate" ? DEFAULT_SETTINGS.agentRate : DEFAULT_SETTINGS.apiProviderRate;
    return {
      value: String(commissionRateToPercent(settings[key], fallback ?? 0)),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        if (raw === "" || raw === "-") {
          setSettings({ ...settings, [key]: 0 });
          return;
        }
        const pct = Number(raw);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) return;
        setSettings({ ...settings, [key]: percentToCommissionRate(pct) });
      },
    };
  }

  async function save() {
    const agentRate = parseCommissionRate(settings.agentRate);
    const apiProviderRate = parseCommissionRate(settings.apiProviderRate);
    if (agentRate === null)
      return toast.error("Agent commission must be between 0% and 100% (type 5 for 5%).");
    if (apiProviderRate === null)
      return toast.error("API provider commission must be between 0% and 100% (type 12 for 12%).");
    if ((settings.depositPlaythroughRate ?? 1) < 0 || (settings.depositPlaythroughRate ?? 1) > 1)
      return toast.error("Deposit turnover must be between 0 and 1 (e.g. 1 = 100%).");
    if ((settings.earlyWithdrawalFeeRate ?? 0.2) < 0 || (settings.earlyWithdrawalFeeRate ?? 0.2) > 1)
      return toast.error("Early withdrawal fee must be between 0 and 1 (e.g. 0.2 = 20%).");
    if ((settings.bonusWagerMultiplier ?? 3) < 1)
      return toast.error("Bonus wager multiplier must be at least 1.");
    setBusy(true);
    try {
      await adminSaveSettings({
        ...settings,
        agentRate,
        subAgentRate: agentRate,
        apiProviderRate,
      });
      toast.success("Settings saved — they apply immediately, no redeploy needed.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function releaseReferralBonusesNow() {
    setReleasingReferrals(true);
    try {
      const res = await adminReleaseReferralBonuses({});
      toast.success(
        `Released ${formatXof(res.total)} to ${res.players} player${res.players === 1 ? "" : "s"}' play balance.`
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setReleasingReferrals(false);
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

  async function rebuildCustomerAccountStats() {
    setRebuildingCustomers(true);
    try {
      const res = await adminBackfillPlayerAccountStats({});
      toast.success(
        `Account books rebuilt — ${res.usersUpdated} players and ${res.agentsUpdated ?? 0} agents. Deposits were never reduced.`
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRebuildingCustomers(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-bold">Platform Settings</h1>
      <p className="mb-6 text-sm text-slate-400">
        Commission rates, game limits and payment providers. Bonuses and minimum withdrawal are on{" "}
        <Link href="/admin/bonuses" className="text-emerald-400 hover:underline">
          Bonuses &amp; Wallet
        </Link>
        .
      </p>

      <Card className="mb-5 border-violet-500/20 bg-violet-500/5">
        <h2 className="mb-2 font-semibold">Bonuses &amp; minimum withdrawal</h2>
        <p className="mb-4 text-sm text-slate-400">
          Deposit bonuses, min withdrawal, play-through rules, and bonus game labels are managed on a dedicated
          page so you can update player wallet rules in one place.
        </p>
        <Link
          href="/admin/bonuses"
          className="inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
        >
          Open Bonuses &amp; Wallet →
        </Link>
      </Card>

      <Card className="mb-5">
        <h2 className="mb-4 font-semibold">API provider commission (share of GGR)</h2>
        <p className="mb-4 text-sm text-slate-400">
          Set the game provider name (QTech) and what percent of total GGR (bets minus wins) you owe
          them. Type 12 for 12%. The Accounts page shows week/month amounts due.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Provider name"
            value={settings.apiProviderName ?? ""}
            onChange={(e) => setSettings({ ...settings, apiProviderName: e.target.value })}
          />
          <Input
            label="GGR commission (%)"
            type="number"
            min={0}
            max={100}
            step="0.1"
            inputMode="decimal"
            {...percentField("apiProviderRate")}
          />
        </div>
      </Card>

      <Card className="mb-5">
        <h2 className="mb-4 font-semibold">Agent commission (share of GGR)</h2>
        <p className="mb-4 text-sm text-slate-400">
          Agents earn this percentage of this month&apos;s GGR profit from players on their
          marketing link. Profit is deposits minus withdrawals minus cash still in those wallets —
          not recycled bets. It changes as customers play. Today and this week show 5% of that
          period&apos;s profit (not extra stacked payments). A new month starts sales and GGR at
          zero. Type 5 for 5%. Only admins can create agent accounts.
        </p>
        <Input
          label="Agent commission (%)"
          type="number"
          min={0}
          max={100}
          step="0.1"
          inputMode="decimal"
          {...percentField("agentRate")}
        />
        <p className="mt-2 text-xs text-slate-500">Type 5 for 5%. Agents earn this share of GGR from their players.</p>
      </Card>

      <Card className="mb-5">
        <h2 className="mb-4 font-semibold">Deposit qualify (BETESE pay)</h2>
        <p className="mb-4 text-sm text-slate-400">
          A marketer qualifies for BETESE deposit pay when the deposit total on their account book
          (the same figure they see, and staff see) reaches this amount.
        </p>
        <Input
          label="Qualify at (GMD deposits)"
          type="number"
          min={0}
          step="100"
          inputMode="decimal"
          value={String(settings.firstDepositQualifyGmd ?? 40000)}
          onChange={(e) =>
            setSettings({ ...settings, firstDepositQualifyGmd: Number(e.target.value) })
          }
        />
      </Card>

      <Card className="mb-5">
        <h2 className="mb-4 font-semibold">Player friend referral (not agents)</h2>
        <p className="mb-4 text-sm text-slate-400">
          Players share /r/CODE with friends. Each qualified friend earns GMD 10 in the player&apos;s
          referral bonus account. Unclaimed balance moves to play credit every Monday, or the player
          can withdraw to phone anytime.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={settings.playerReferral?.weeklyReleaseToPlay !== false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  playerReferral: {
                    ...DEFAULT_SETTINGS.playerReferral!,
                    ...settings.playerReferral,
                    weeklyReleaseToPlay: e.target.checked,
                  },
                })
              }
            />
            Auto-release to play credit every Monday
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={settings.playerReferral?.enabled !== false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  playerReferral: {
                    ...DEFAULT_SETTINGS.playerReferral!,
                    ...settings.playerReferral,
                    enabled: e.target.checked,
                  },
                })
              }
            />
            Referral program enabled
          </label>
          <Input
            label="Referral bonus (GMD)"
            type="number"
            value={String(settings.playerReferral?.bonusAmount ?? 10)}
            onChange={(e) =>
              setSettings({
                ...settings,
                playerReferral: {
                  ...DEFAULT_SETTINGS.playerReferral!,
                  ...settings.playerReferral,
                  bonusAmount: Number(e.target.value),
                },
              })
            }
          />
          <Input
            label="Min friend deposit to qualify (GMD)"
            type="number"
            value={String(settings.playerReferral?.minQualifyingDeposit ?? 50)}
            onChange={(e) =>
              setSettings({
                ...settings,
                playerReferral: {
                  ...DEFAULT_SETTINGS.playerReferral!,
                  ...settings.playerReferral,
                  minQualifyingDeposit: Number(e.target.value),
                },
              })
            }
          />
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={settings.playerReferral?.requireFirstBet !== false}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  playerReferral: {
                    ...DEFAULT_SETTINGS.playerReferral!,
                    ...settings.playerReferral,
                    requireFirstBet: e.target.checked,
                  },
                })
              }
            />
            Require first real-money bet
          </label>
        </div>
        <Button
          variant="secondary"
          className="mt-4"
          disabled={releasingReferrals}
          onClick={() => void releaseReferralBonusesNow()}
        >
          {releasingReferrals ? "Releasing…" : "Release referral bonuses to play credit now"}
        </Button>
      </Card>

      <Card className="mb-5">
        <h2 className="mb-4 font-semibold">Customer care (WhatsApp / call)</h2>
        <p className="mb-4 text-sm text-slate-400">
          Shown on sign-up, wallet, and support screens. Use digits only with country code (e.g. 2205001234).
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Call number"
            placeholder="2205001234"
            value={settings.customerCare?.phone ?? ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                customerCare: {
                  ...DEFAULT_SETTINGS.customerCare!,
                  ...settings.customerCare,
                  phone: e.target.value,
                },
              })
            }
          />
          <Input
            label="WhatsApp number"
            placeholder="2205001234"
            value={settings.customerCare?.whatsapp ?? ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                customerCare: {
                  ...DEFAULT_SETTINGS.customerCare!,
                  ...settings.customerCare,
                  whatsapp: e.target.value,
                },
              })
            }
          />
          <Input
            label="Display label"
            className="sm:col-span-2"
            value={settings.customerCare?.label ?? ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                customerCare: {
                  ...DEFAULT_SETTINGS.customerCare!,
                  ...settings.customerCare,
                  label: e.target.value,
                },
              })
            }
          />
        </div>
      </Card>

      <Card className="mb-5 border-emerald-500/20 bg-emerald-500/5">
        <h2 className="mb-2 font-semibold">QTech Aviator &amp; Crash</h2>
        <p className="mb-4 text-sm text-slate-400">
          Wallet credentials, game launch API, and enable/disable games on the lobby are managed on
          the dedicated QTech page.
        </p>
        <Link
          href="/admin/qtech"
          className="inline-flex rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
        >
          Open QTech &amp; Games →
        </Link>
      </Card>

      <Card className="mb-5">
        <h2 className="mb-4 font-semibold">Game limits (GMD)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Min bet" type="number" {...num("minBet")} />
          <Input label="Max bet" type="number" {...num("maxBet")} />
          <Input label="Min auto-cashout" type="number" step="0.01" {...num("minAutoCashout")} />
          <Input label="Max auto-cashout" type="number" {...num("maxAutoCashout")} />
        </div>
      </Card>

      <Card className="mb-5">
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
      <Button
        variant="secondary"
        className="mt-3 w-full"
        onClick={rebuildCustomerAccountStats}
        disabled={rebuildingCustomers}
      >
        {rebuildingCustomers
          ? "Rebuilding customer books…"
          : "Rebuild customer account books (Wave + wallet deposits, never reduced)"}
      </Button>
    </div>
  );
}
