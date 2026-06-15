"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Copy, MessageCircle, Users } from "lucide-react";
import { getPlayerReferralDashboard, errorMessage } from "@/lib/api";
import {
  getReferralDeviceId,
  playerReferralUrl,
  referralShareMessage,
  whatsAppShareUrl,
} from "@/lib/referrals";
import { formatXof } from "@/lib/format";
import { Button, Card, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";

type Dashboard = Awaited<ReturnType<typeof getPlayerReferralDashboard>>;

export function ReferralPanel() {
  const { profile } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [busy, setBusy] = useState(true);

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
    return <p className="text-sm text-slate-400">Loading referral stats…</p>;
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

  return (
    <div className="space-y-5">
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Users className="text-emerald-400" size={20} />
          <h2 className="font-semibold">Invite friends — earn {formatXof(data.bonusAmount)}</h2>
        </div>
        <p className="mb-4 text-sm text-slate-400">
          Your friend must register with your link, deposit at least{" "}
          {formatXof(data.minQualifyingDeposit)}, and place one real-money bet. You receive{" "}
          {formatXof(data.bonusAmount)} bonus (anti-fraud checks apply).
        </p>

        <Input label="Your referral link" readOnly value={link} />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button variant="secondary" className="w-full" onClick={copyLink}>
            <Copy size={16} className="mr-2 inline" /> Copy link
          </Button>
          <Button className="w-full" onClick={shareWhatsApp}>
            <MessageCircle size={16} className="mr-2 inline" /> Share on WhatsApp
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Code: <strong className="text-slate-300">{data.referralCode}</strong>
        </p>
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
          <p className="text-xs text-slate-400">Pending bonuses</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold text-violet-300">{formatXof(data.totalBonusEarned)}</p>
          <p className="text-xs text-slate-400">Total bonuses earned</p>
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
