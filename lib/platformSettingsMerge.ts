import { mergeBonusSettings } from "@/lib/bonuses";
import { DEFAULT_SETTINGS, type PlatformSettings } from "@/lib/types";

/** Merge Firestore `settings/platform` with app defaults (client + admin). */
export function mergePlatformSettings(data: Partial<PlatformSettings> | null | undefined): PlatformSettings {
  const d = data ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...d,
    providers: { ...DEFAULT_SETTINGS.providers, ...(d.providers ?? {}) },
    bonuses: mergeBonusSettings(d.bonuses),
    apiProviderName: d.apiProviderName ?? DEFAULT_SETTINGS.apiProviderName,
    apiProviderRate: d.apiProviderRate ?? DEFAULT_SETTINGS.apiProviderRate,
    agentRate: d.agentRate ?? d.subAgentRate ?? DEFAULT_SETTINGS.agentRate,
    depositPlaythroughRate: d.depositPlaythroughRate ?? DEFAULT_SETTINGS.depositPlaythroughRate,
    earlyWithdrawalFeeRate: d.earlyWithdrawalFeeRate ?? DEFAULT_SETTINGS.earlyWithdrawalFeeRate,
    bonusWagerMultiplier: d.bonusWagerMultiplier ?? DEFAULT_SETTINGS.bonusWagerMultiplier,
    bonusGamesLabel: d.bonusGamesLabel?.trim() || DEFAULT_SETTINGS.bonusGamesLabel,
    bonusIntroText: d.bonusIntroText?.trim() || DEFAULT_SETTINGS.bonusIntroText,
    withdrawalRulesText: d.withdrawalRulesText?.trim() || DEFAULT_SETTINGS.withdrawalRulesText,
    bonusCampaignEndsAt: d.bonusCampaignEndsAt?.trim() || DEFAULT_SETTINGS.bonusCampaignEndsAt,
    playerReferral: {
      ...DEFAULT_SETTINGS.playerReferral!,
      ...(d.playerReferral ?? {}),
    },
    smartBonus: {
      ...DEFAULT_SETTINGS.smartBonus!,
      ...(d.smartBonus ?? {}),
    },
    customerCare: {
      ...DEFAULT_SETTINGS.customerCare!,
      ...(d.customerCare ?? {}),
    },
    qtech: {
      ...DEFAULT_SETTINGS.qtech!,
      ...(d.qtech ?? {}),
    },
  };
}
