import { mergeBonusSettings } from "@/lib/bonuses";
import { normalizeCommissionRate } from "@/lib/commissionRate";
import { MIN_DEPOSIT_GMD } from "@/lib/depositLimits";
import { stripPlatformSecrets } from "@/lib/publicPlatformSettings";
import { DEFAULT_SETTINGS, type PlatformSettings } from "@/lib/types";

/** Merge Firestore `settings/platform` with app defaults (client + admin). */
export function mergePlatformSettings(data: Partial<PlatformSettings> | null | undefined): PlatformSettings {
  const d = stripPlatformSecrets(data ?? {});
  const { minDeposit: _storedMin, ...rest } = d;
  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    minDeposit: MIN_DEPOSIT_GMD,
    providers: { ...DEFAULT_SETTINGS.providers, ...(d.providers ?? {}) },
    bonuses: mergeBonusSettings(d.bonuses),
    apiProviderName: d.apiProviderName ?? DEFAULT_SETTINGS.apiProviderName,
    apiProviderRate: normalizeCommissionRate(
      d.apiProviderRate,
      DEFAULT_SETTINGS.apiProviderRate
    ),
    agentRate: normalizeCommissionRate(
      d.agentRate ?? d.subAgentRate,
      DEFAULT_SETTINGS.agentRate
    ),
    firstDepositQualifyGmd:
      Number.isFinite(Number(d.firstDepositQualifyGmd)) && Number(d.firstDepositQualifyGmd) >= 0
        ? Number(d.firstDepositQualifyGmd)
        : DEFAULT_SETTINGS.firstDepositQualifyGmd,
    subAgentRate: normalizeCommissionRate(
      d.subAgentRate ?? d.agentRate,
      DEFAULT_SETTINGS.subAgentRate
    ),
    superAgentRate: normalizeCommissionRate(
      d.superAgentRate,
      DEFAULT_SETTINGS.superAgentRate
    ),
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
