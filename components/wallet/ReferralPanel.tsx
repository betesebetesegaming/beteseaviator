"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Calendar, Copy, MessageCircle, Users, Wallet } from "lucide-react";
import { claimReferralEarnings, getPlayerReferralDashboard, errorMessage } from "@/lib/api";
import {
  formatReferralReleaseDate,
  getReferralDeviceId,
  playerReferralUrl,
  referralShareMessage,
  whatsAppShareUrl,
} from "@/lib/referrals";
import { formatXof } from "@/lib/format";
import { Button, Card, Input, Select } from "@/components/ui";
import { ReferralQrCode } from "@/components/shared/ReferralQrCode";
import { useAuth } from "@/lib/auth-context";
import type { PaymentProvider } from "@/lib/types";

type Dashboard = Awaited<ReturnType<typeof getPlayerReferralDashboard>>;

export function ReferralPanel() {
  const { profile } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawPhone, setWithdrawPhone] = useState("");
  const [withdrawProvider, setWithdrawProvider] = useState<PaymentProvider>("wave");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const dash = await getPlayerReferralDashboard({});
      setData(dash);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (profile?.role === "player") void load();
  }, [profile, load]);

  if (!profile || profile.role !== "player") return null;

  if (busy && !data) {
    return <p className="text-sm text-slate-400">Loading referral account…</p>;
  }

  if (!data?.enabled) {
    return (
      <Card>
        <p className="text-sm text-slate-400">Referral rewards are not active right now.</p>
      </Card>
    );
  }

  const link = playerReferralUrl(data.referralCode);
  const shareText = referralShareMessage(data.referralCode, data.bonusAmount);
  const hasBalance = data.referralBalance > 0;
  const releaseLabel = data.nextReleaseAt
    ? formatReferralReleaseDate(data.nextReleaseAt)
    : "Monday morning";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Referral link copied!");
    } catch {
      toast.error("Could not copy link.");
    }
  }

  function shareWhatsApp() {
    window.open(whatsAppShareUrl(shareText), "_blank", "noopener,noreferrer");
  }

  async function withdrawReferralBonus() {
    if (!withdrawPhone.trim()) return toast.error("Enter your payout phone number.");
    setWithdrawing(true);
    try {
      await claimReferralEarnings({
        mode: "withdraw",
        phone: withdrawPhone.trim(),
        provider: withdrawProvider,
      });
      toast.success("Withdrawal submitted — BETESE will send to your phone.");
      setWithdrawPhone("");
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Users className="text-emerald-400" size={20} />
          <h2 className="font-semibold">Invite friends — earn {formatXof(data.bonusAmount)} each</h2>
        </div>
        <p className="mb-4 text-sm text-slate-400">
          Share your personal link (not an agent link). When a friend registers, deposits at least{" "}
          {formatXof(data.minQualifyingDeposit)}, and places one bet, you earn{" "}
          {formatXof(data.bonusAmount)} in your referral bonus account.
        </p>

        <Input label="Your friend referral link" readOnly value={link} />
        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between">
          <ReferralQrCode value={link} label="Friends scan to register with your code" />
          <div className="grid w-full flex-1 gap-2 sm:max-w-xs">
            <Button variant="secondary" className="w-full" onClick={copyLink}>
              <Copy size={16} className="mr-2 inline" /> Copy link
            </Button>
            <Button className="w-full" onClick={shareWhatsApp}>
              <MessageCircle size={16} className="mr-2 inline" /> Share on WhatsApp
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Code: <strong className="text-slate-300">{data.referralCode}</strong>
        </p>
      </Card>

      <Card className="border-violet-500/25 bg-violet-500/5">
        <div className="mb-3 flex items-center gap-2">
          <Wallet className="text-violet-300" size={20} />
          <h2 className="font-semibold">Referral bonus account</h2>
        </div>
        <p className="mb-1 text-3xl font-bold text-violet-200">{formatXof(data.referralBalance)}</p>
        <p className="mb-4 text-sm text-slate-400">Available to withdraw or waiting for Monday release.</p>

        {data.weeklyReleaseToPlay && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-300">
            <Calendar className="mt-0.5 shrink-0 text-sky-400" size={18} />
            <p>
              <strong className="text-white">Every Monday</strong> unclaimed bonuses move to your play
              balance automatically ({releaseLabel}).
            </p>
          </div>
        )}

        {hasBalance ? (
          <div className="space-y-2 rounded-lg border border-white/10 bg-slate-950/40 p-3">
            <p className="text-xs text-slate-400">
              Or withdraw now to mobile money (min {formatXof(data.bonusAmount)} per request)
            </p>
            <Input
              label="Payout phone"
              type="tel"
              value={withdrawPhone}
              onChange={(e) => setWithdrawPhone(e.target.value)}
            />
            <Select
              label="Provider"
              value={withdrawProvider}
              onChange={(e) => setWithdrawProvider(e.target.value as PaymentProvider)}
            >
              <option value="wave">Wave</option>
              <option value="afrimoney">AfriMoney</option>
            </Select>
            <Button
              variant="secondary"
              className="w-full"
              disabled={withdrawing}
              onClick={() => void withdrawReferralBonus()}
            >
              {withdrawing ? "Submitting…" : `Withdraw ${formatXof(data.referralBalance)} to phone`}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No bonus balance yet — invite friends and earn {formatXof(data.bonusAmount)} when they qualify.
          </p>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="text-center">
          <p className="text-2xl font-bold text-white">{data.friendsInvited}</p>
          <p className="text-xs text-slate-400">Friends invited</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold text-emerald-400">{data.qualifiedFriends}</p>
          <p className="text-xs text-slate-400">Qualified friends</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold text-amber-300">{data.pendingBonuses}</p>
          <p className="text-xs text-slate-400">Awaiting qualification</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold text-violet-300">{formatXof(data.totalBonusEarned)}</p>
          <p className="text-xs text-slate-400">Total earned (lifetime)</p>
        </Card>
      </div>
    </div>
  );
}

/** Pass device id on registration for anti-fraud. */
export function useReferralDeviceId(): string {
  const [id, setId] = useState("");
  useEffect(() => setId(getReferralDeviceId()), []);
  return id;
}
