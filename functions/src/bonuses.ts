import {
  db,
  FieldValue,
  round2,
  type Settings,
  walletWrite,
} from "./helpers";
import { recordBonusWageringRequirement, playthroughRates, type PlaythroughWallet } from "./wagering";

export type BonusKind = "firstDeposit" | "weeklyCrash" | "weekend";

const BONUS_DESCRIPTIONS: Record<BonusKind, string> = {
  firstDeposit: "First deposit bonus",
  weeklyCrash: "Weekly crash bonus",
  weekend: "Weekend bonus (Friday night deposit)",
};

export function isoWeekKey(d: Date): string {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function isWeekendBonusWindow(
  at: Date,
  rule: Settings["bonuses"]["weekend"]
): boolean {
  if (!rule.enabled) return false;
  const day = at.getUTCDay();
  const hour = at.getUTCHours();
  if (day === 5 && hour >= rule.fridayStartHour) return true;
  if (day === 6) return true;
  if (day === 0 && hour <= rule.sundayEndHour) return true;
  return false;
}

function calcBonusAmount(
  depositAmount: number,
  rule: { enabled: boolean; percent: number; maxAmount: number; minDeposit: number }
): number {
  if (!rule.enabled || depositAmount < rule.minDeposit) return 0;
  return round2(Math.min(depositAmount * rule.percent, rule.maxAmount));
}

export interface AppliedBonus {
  kind: BonusKind;
  amount: number;
}

/**
 * Credits deposit bonuses into bonusBalance. Must run inside the same Firestore
 * transaction as the deposit credit, after walletRead().
 */
export function applyDepositBonuses(
  tx: FirebaseFirestore.Transaction,
  args: {
    uid: string;
    wallet: PlaythroughWallet;
    depositAmount: number;
    depositRef: string;
    depositAt: Date;
    userData: FirebaseFirestore.DocumentData | undefined;
    settings: Settings;
    userRef: FirebaseFirestore.DocumentReference;
  }
): AppliedBonus[] {
  const bonuses = args.settings.bonuses;
  const applied: AppliedBonus[] = [];
  const userUpdates: Record<string, unknown> = {};
  const user = args.userData ?? {};

  const firstAmount = calcBonusAmount(args.depositAmount, bonuses.firstDeposit);
  if (firstAmount > 0 && !user.firstDepositBonusClaimed) {
    applied.push({ kind: "firstDeposit", amount: firstAmount });
    userUpdates.firstDepositBonusClaimed = true;
  }

  const weekKey = isoWeekKey(args.depositAt);
  const weeklyAmount = calcBonusAmount(args.depositAmount, bonuses.weeklyCrash);
  if (weeklyAmount > 0 && user.lastWeeklyBonusWeek !== weekKey) {
    applied.push({ kind: "weeklyCrash", amount: weeklyAmount });
    userUpdates.lastWeeklyBonusWeek = weekKey;
  }

  const weekendAmount = calcBonusAmount(args.depositAmount, bonuses.weekend);
  if (weekendAmount > 0 && isWeekendBonusWindow(args.depositAt, bonuses.weekend)) {
    applied.push({ kind: "weekend", amount: weekendAmount });
  }

  for (const bonus of applied) {
    walletWrite(tx, args.wallet, {
      uid: args.uid,
      amount: bonus.amount,
      type: "bonus",
      creditAsBonus: true,
      description: BONUS_DESCRIPTIONS[bonus.kind],
      meta: {
        bonusKind: bonus.kind,
        depositRef: args.depositRef,
        depositAmount: args.depositAmount,
      },
    });
    const { bonusMultiplier } = playthroughRates(args.settings);
    recordBonusWageringRequirement(tx, args.uid, args.wallet, bonus.amount, bonusMultiplier);
  }

  if (Object.keys(userUpdates).length > 0) {
    tx.set(args.userRef, userUpdates, { merge: true });
  }

  if (applied.length > 0) {
    tx.set(db.collection("bonusGrants").doc(), {
      userId: args.uid,
      depositRef: args.depositRef,
      depositAmount: args.depositAmount,
      bonuses: applied,
      totalBonus: round2(applied.reduce((sum, b) => sum + b.amount, 0)),
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  return applied;
}
