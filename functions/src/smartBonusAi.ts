/**
 * Optional AI layer for the Smart Bonus engine.
 *
 * When enabled (settings.smartBonus.aiEnabled === true AND an ANTHROPIC_API_KEY
 * is configured in functions/.env), Claude reviews each eligible player's
 * metrics and returns a structured recommendation: a bonus amount, a confidence
 * score, a personalized "why we recommend" explanation, and ready-to-send
 * outreach copy.
 *
 * It is fault-tolerant by design: any error (missing key, network, refusal,
 * malformed output) makes generateAiRecommendation return null, and the caller
 * falls back to the deterministic rule-based recommendation. The AI never
 * decides eligibility and can never push a bonus outside the configured
 * min/max bounds — those are enforced in code, not left to the model.
 */
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "firebase-functions/v2";
import { round2 } from "./helpers";
import type { PlayerMetrics, SmartBonusConfig } from "./smartBonus";

/** Anthropic model — do not downgrade without an explicit decision. */
const MODEL = "claude-opus-4-8";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!client) {
    // Short timeout + no retries: the nightly job processes many players and
    // must not stall on a slow call — it falls back to rules instead.
    client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
  }
  return client;
}

export function smartBonusAiEnabled(cfg: SmartBonusConfig): boolean {
  return cfg.aiEnabled === true && Boolean(process.env.ANTHROPIC_API_KEY);
}

export interface AiRecommendation {
  recommendedBonus: number;
  confidence: number; // 0..1
  reason: string;
  outreachMessage: string;
  aiGenerated: true;
}

interface PlayerContext {
  name: string;
  currency: string;
}

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    recommended_bonus: {
      type: "number",
      description: "Bonus amount in the platform currency. Will be clamped to the configured min/max.",
    },
    confidence: {
      type: "number",
      description: "How likely this offer reactivates the player, 0 (low) to 1 (high).",
    },
    reason: {
      type: "string",
      description:
        "One or two sentences, plain English, explaining WHY this player was picked and why this amount — for the admin/marketer to trust the decision. Reference concrete numbers.",
    },
    outreach_message: {
      type: "string",
      description:
        "A short, friendly SMS/WhatsApp message (max ~240 chars) to the player about their bonus. First name only, no markdown.",
    },
  },
  required: ["recommended_bonus", "confidence", "reason", "outreach_message"],
} as const;

function buildPrompt(
  player: PlayerContext,
  m: PlayerMetrics,
  cfg: SmartBonusConfig,
  ruleAmount: number
): string {
  return [
    `You are the retention analyst for BETESE, a Gambian online betting platform (currency ${player.currency}).`,
    `Decide the welcome-back bonus for one lapsed player and explain it.`,
    ``,
    `PLAYER "${player.name}" metrics:`,
    `- Days since last bet: ${m.daysSinceLastBet}`,
    `- Days since last login: ${m.daysSinceLastLogin}`,
    `- Days since last deposit: ${m.daysSinceLastDeposit}`,
    `- Average deposit: ${round2(m.avgDeposit)} ${player.currency} over ${m.depositCount} deposits`,
    `- Lifetime deposits: ${round2(m.lifetimeDeposits)} ${player.currency}`,
    `- Lifetime gross gaming revenue (house profit): ${round2(m.lifetimeGgr)} ${player.currency}`,
    `- Active betting days in last 30: ${m.activeBettingDays30}`,
    `- Prior bonuses received: ${m.bonusHistoryCount}; prior bonuses converted to cash: ${m.bonusConversionCount}`,
    ``,
    `RULES:`,
    `- Bonus must be between ${cfg.minBonus} and ${cfg.maxBonus} ${player.currency} (values outside are clamped).`,
    `- Base the amount mainly on the player's average deposit and how valuable/winnable-back they are. A deterministic baseline is ${ruleAmount} ${player.currency}; adjust up for high lifetime value or a history of converting bonuses, down for thin history.`,
    `- The player must deposit a matching amount to unlock the bonus, and wager it ${cfg.wagerMultiplier}x before withdrawing.`,
    ``,
    `Return the recommendation as JSON. Keep the reason concrete (cite the numbers) and the outreach message warm and short.`,
  ].join("\n");
}

export async function generateAiRecommendation(
  player: PlayerContext,
  m: PlayerMetrics,
  cfg: SmartBonusConfig,
  ruleAmount: number
): Promise<AiRecommendation | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: RESPONSE_SCHEMA },
      },
      messages: [{ role: "user", content: buildPrompt(player, m, cfg, ruleAmount) }],
    });

    if (response.stop_reason === "refusal") {
      logger.warn("smartBonus AI refused", { player: player.name });
      return null;
    }

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    if (!textBlock?.text) return null;

    const parsed = JSON.parse(textBlock.text) as {
      recommended_bonus?: unknown;
      confidence?: unknown;
      reason?: unknown;
      outreach_message?: unknown;
    };

    const rawBonus = Number(parsed.recommended_bonus);
    if (!Number.isFinite(rawBonus)) return null;
    const recommendedBonus = round2(Math.min(cfg.maxBonus, Math.max(cfg.minBonus, rawBonus)));

    const confidence = clamp01(Number(parsed.confidence));
    const reason = String(parsed.reason ?? "").trim().slice(0, 600);
    const outreachMessage = String(parsed.outreach_message ?? "").trim().slice(0, 320);
    if (!reason) return null;

    return { recommendedBonus, confidence, reason, outreachMessage, aiGenerated: true };
  } catch (e) {
    logger.warn("smartBonus AI call failed — falling back to rules", {
      player: player.name,
      error: String(e),
    });
    return null;
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}
