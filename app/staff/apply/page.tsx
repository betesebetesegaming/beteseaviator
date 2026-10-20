import type { Metadata } from "next";
import { ApplyPage } from "@/components/marketers/ApplyPage";

export const metadata: Metadata = {
  title: "Become a Betese Marketer",
  description: "Apply to become a Betese marketer: propose your target and requested commission for owner review.",
  robots: { index: false, follow: false },
};

/** Public application page (no sign-in). Two path segments, so agent referral links can never collide with it. */
export default function BecomeAMarketerPage() {
  return <ApplyPage />;
}
