import type { Metadata } from "next";
import { JoinPage } from "@/components/marketers/JoinPage";

export const metadata: Metadata = {
  title: "Join Betese",
  description: "Sign up for Betese Football or Betese Aviator.",
  robots: { index: false, follow: false },
};

/** A marketer's share link. Two path segments, so agent referral links (/<slug>) can never collide with it. */
export default async function JoinBetesePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <JoinPage slug={slug} />;
}
