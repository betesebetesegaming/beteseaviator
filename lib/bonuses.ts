import type {
  BonusRuleSettings,
  BonusSettings,
  PlatformSettings,
  Wallet,
  WeekendBonusSettings,
} from "@/lib/types";

export const DEFAULT_BONUS_SETTINGS: BonusSettings = {
  firstDeposit: {
    enabled: true,
    percent: 0.5,
    maxAmount: 10_000,
    minDeposit: 20,
  },
  weeklyCrash: {
    enabled: false,
    percent: 0.1,
    maxAmount: 200,
    minDeposit: 200,
  },
  weekend: {
    enabled: false,
    percent: 0.25,
    maxAmount: 300,
    minDeposit: 20,
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
  if (key === "firstDeposit") {
    return `${formatBonusPercent(rule)} on first deposit only · ${cap} · ${min}`;
  }
  return `${formatBonusPercent(rule)} ${cap} · ${min}`;
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

export function bonusPlayerTitle(key: keyof BonusSettings, rule: BonusRuleSettings): string {
  const custom = rule.playerTitle?.trim();
  return custom || BONUS_LABELS[key];
}

export function bonusPlayerDescription(
  key: keyof BonusSettings,
  rule: BonusRuleSettings | WeekendBonusSettings,
): string {
  const custom = rule.playerTerms?.trim();
  return custom || bonusRuleSummary(key, rule);
}

export function defaultBonusIntroText(bonusGamesLabel: string): string {
  return `Bonuses are added to your bonus balance when a deposit is confirmed. Use them on ${bonusGamesLabel} — wins go to your cash balance.`;
}

export function bonusIntroCopy(settings: Pick<PlatformSettings, "bonusIntroText" | "bonusGamesLabel">): string {
  const custom = settings.bonusIntroText?.trim();
  if (custom) return custom;
  return defaultBonusIntroText(settings.bonusGamesLabel?.trim() || "Aviator & Crash");
}

export function withdrawalRulesCopy(
  settings: Pick<
    PlatformSettings,
    "withdrawalRulesText" | "depositPlaythroughRate" | "earlyWithdrawalFeeRate" | "bonusGamesLabel"
  >,
): string {
  const custom = settings.withdrawalRulesText?.trim();
  if (custom) return custom;
  const depositRate = Math.round((settings.depositPlaythroughRate ?? 0.8) * 100);
  const feeRate = Math.round((settings.earlyWithdrawalFeeRate ?? 0.15) * 100);
  const label = settings.bonusGamesLabel?.trim() || "Aviator & Crash";
  return `Only cash balance can be withdrawn — bonus balance is for ${label} bets only. You must play ${depositRate}% of each deposit on games before any withdrawal is allowed. Deposited money cannot be withdrawn back without playing first.`;
}

/** True when deposit bonus campaign is still running (empty end date = always on). */
export function depositBonusesActive(settings: Pick<PlatformSettings, "bonusCampaignEndsAt">): boolean {
  const raw = settings.bonusCampaignEndsAt?.trim();
  if (!raw) return true;
  const endMs = Date.parse(raw);
  if (!Number.isFinite(endMs)) return true;
  return Date.now() < endMs;
}

export function formatBonusCampaignEnd(iso: string | undefined): string {
  const raw = iso?.trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-GM", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " GMT";
}

/** For admin datetime-local input (stored as UTC ISO). */
export function bonusCampaignEndInputValue(iso: string | undefined): string {
  const raw = iso?.trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function bonusCampaignEndFromInput(localValue: string): string {
  const v = localValue.trim();
  if (!v) return "";
  return `${v}:00.000Z`;
}
