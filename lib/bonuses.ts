import type { BonusRuleSettings, BonusSettings, Wallet, WeekendBonusSettings } from "@/lib/types";

export const DEFAULT_BONUS_SETTINGS: BonusSettings = {
  firstDeposit: {
    enabled: true,
    percent: 0.5,
    maxAmount: 500,
    minDeposit: 100,
  },
  weeklyCrash: {
    enabled: true,
    percent: 0.1,
    maxAmount: 200,
    minDeposit: 200,
  },
  weekend: {
    enabled: true,
    percent: 0.25,
    maxAmount: 300,
    minDeposit: 100,
    fridayStartHour: 18,
    sundayEndHour: 23,
  },
};

export const BONUS_LABELS: Record<keyof BonusSettings, string> = {
  firstDeposit: "First deposit bonus",
  weeklyCrash: "Weekly crash bonus",
  weekend: "Weekend bonus",
};

export function mergeBonusSettings(partial?: Partial<BonusSettings> | null): BonusSettings {
  if (!partial) return DEFAULT_BONUS_SETTINGS;
  return {
    firstDeposit: { ...DEFAULT_BONUS_SETTINGS.firstDeposit, ...partial.firstDeposit },
    weeklyCrash: { ...DEFAULT_BONUS_SETTINGS.weeklyCrash, ...partial.weeklyCrash },
    weekend: { ...DEFAULT_BONUS_SETTINGS.weekend, ...partial.weekend },
  };
}

export function playableBalance(wallet: Pick<Wallet, "balance" | "bonusBalance"> | null | undefined): number {
  return (wallet?.balance ?? 0) + (wallet?.bonusBalance ?? 0);
}

export function formatBonusPercent(rule: BonusRuleSettings): string {
  return `${Math.round(rule.percent * 100)}%`;
}

export function bonusRuleSummary(key: keyof BonusSettings, rule: BonusRuleSettings | WeekendBonusSettings): string {
  if (!rule.enabled) return `${BONUS_LABELS[key]} — off`;
  const cap = `up to ${rule.maxAmount} GMD`;
  const min = `min deposit ${rule.minDeposit} GMD`;
  if (key === "weekend") {
    const w = rule as WeekendBonusSettings;
    return `${formatBonusPercent(rule)} ${cap} · Fri ${w.fridayStartHour}:00 – Sun ${w.sundayEndHour}:59 GMT · ${min}`;
  }
  if (key === "weeklyCrash") {
    return `${formatBonusPercent(rule)} ${cap} · once per week · ${min}`;
  }
  return `${formatBonusPercent(rule)} ${cap} · one-time · ${min}`;
}

export function isWeekendBonusWindow(at: Date, rule: BonusSettings["weekend"]): boolean {
  if (!rule.enabled) return false;
  const day = at.getUTCDay();
  const hour = at.getUTCHours();
  if (day === 5 && hour >= rule.fridayStartHour) return true;
  if (day === 6) return true;
  if (day === 0 && hour <= rule.sundayEndHour) return true;
  return false;
}
