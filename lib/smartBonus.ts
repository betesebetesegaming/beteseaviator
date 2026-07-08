import type { HealthTier, SmartBonusOfferStatus } from "@/lib/types";

export const HEALTH_TIER_META: Record<
  HealthTier,
  { label: string; text: string; bg: string; border: string; dot: string }
> = {
  very_active: {
    label: "Very Active",
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  active: {
    label: "Active",
    text: "text-sky-300",
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    dot: "bg-sky-400",
  },
  at_risk: {
    label: "At Risk",
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    dot: "bg-amber-400",
  },
  inactive: {
    label: "Inactive",
    text: "text-orange-300",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    dot: "bg-orange-400",
  },
  dormant: {
    label: "Dormant",
    text: "text-rose-300",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    dot: "bg-rose-400",
  },
};

export function tierMeta(tier: HealthTier | string | undefined) {
  return HEALTH_TIER_META[(tier as HealthTier) ?? "at_risk"] ?? HEALTH_TIER_META.at_risk;
}

export const OFFER_STATUS_META: Record<SmartBonusOfferStatus, { label: string; text: string; bg: string }> = {
  pending: { label: "Pending", text: "text-slate-200", bg: "bg-slate-500/20" },
  approved: { label: "Approved", text: "text-sky-200", bg: "bg-sky-500/20" },
  sent: { label: "Sent", text: "text-violet-200", bg: "bg-violet-500/20" },
  activated: { label: "Activated", text: "text-emerald-200", bg: "bg-emerald-500/20" },
  completed: { label: "Completed", text: "text-emerald-300", bg: "bg-emerald-500/25" },
  rejected: { label: "Rejected", text: "text-rose-200", bg: "bg-rose-500/20" },
  expired: { label: "Expired", text: "text-slate-400", bg: "bg-slate-600/20" },
};

export function offerStatusMeta(status: SmartBonusOfferStatus | string | undefined) {
  return OFFER_STATUS_META[(status as SmartBonusOfferStatus) ?? "pending"] ?? OFFER_STATUS_META.pending;
}

/** A player-actionable offer: waiting for the customer to deposit & activate. */
export function isLiveOffer(status: SmartBonusOfferStatus | string | undefined): boolean {
  return status === "approved" || status === "sent";
}

/** Milliseconds until an ISO expiry; negative if already expired. */
export function msUntil(iso: string | undefined | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms - Date.now() : 0;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Suggested SMS/WhatsApp copy an admin can send about a live offer. */
export function offerMessage(name: string, bonusAmount: number, matchDeposit: number, currency = "GMD"): string {
  const first = (name || "there").split(" ")[0];
  return (
    `🎉 Hi ${first}! BETESE picked you for an exclusive Smart Bonus. ` +
    `Deposit ${currency} ${matchDeposit} and get ${currency} ${bonusAmount} bonus to play with. ` +
    `Open the app → My Rewards to claim it before it expires.`
  );
}
