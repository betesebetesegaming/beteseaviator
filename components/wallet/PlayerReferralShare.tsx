"use client";

import {
  PLAYER_REFERRAL_EXAMPLES,
  playerReferralUrl,
  referralShareMessage,
} from "@/lib/referrals";
import { ShareLinkPanel } from "@/components/shared/ShareLinkPanel";

type Props = {
  referralCode: string;
  bonusAmount: number;
  minQualifyingDeposit: number;
  compact?: boolean;
};

/** Player-to-player invite link with QR — earn bonus when friends qualify. */
export function PlayerReferralShare({
  referralCode,
  bonusAmount,
  minQualifyingDeposit,
  compact,
}: Props) {
  const link = playerReferralUrl(referralCode);
  const shareMessage = referralShareMessage(referralCode, bonusAmount);

  return (
    <ShareLinkPanel
      compact={compact}
      accent="violet"
      title="Invite friends — earn when they play"
      subtitle={`Share your personal link. When a friend registers, deposits at least GMD ${minQualifyingDeposit}, and places one bet, you earn GMD ${bonusAmount}.`}
      url={link}
      shareMessage={shareMessage}
      qrLabel="Friends scan to sign up with your code"
      downloadFileName={`betese-ref-${referralCode.toLowerCase()}`}
      examples={PLAYER_REFERRAL_EXAMPLES}
      code={referralCode}
      codeLabel="Friend code"
    />
  );
}
