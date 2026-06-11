import { DEFAULT_SETTINGS, type PlatformSettings } from "@/lib/types";

export const DEFAULT_BET_STEP = 10;
export const DEFAULT_BET_PRESETS = [100, 500, 1000, 5000];

export function clampBetAmount(
  value: number,
  settings: Pick<PlatformSettings, "minBet" | "maxBet"> = DEFAULT_SETTINGS,
  balance?: number
): number {
  let v = value;
  if (!Number.isFinite(v)) v = settings.minBet;
  v = Math.max(settings.minBet, v);
  v = Math.min(settings.maxBet, v);
  if (balance !== undefined && Number.isFinite(balance)) {
    v = Math.min(v, Math.max(0, balance));
  }
  return Math.round(v * 100) / 100;
}

export function stepBetAmount(
  current: number,
  direction: 1 | -1,
  step = DEFAULT_BET_STEP,
  settings: Pick<PlatformSettings, "minBet" | "maxBet"> = DEFAULT_SETTINGS,
  balance?: number
): number {
  return clampBetAmount(current + direction * step, settings, balance);
}

export function parseBetInput(raw: string, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
