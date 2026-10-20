import type { Metadata } from "next";
import { MarketersGuard } from "@/components/marketers/MarketersGuard";

export const metadata: Metadata = {
  title: "Betese Marketers",
  description: "Betese staff app for marketers: customer records and owner-approved SMS.",
  robots: { index: false, follow: false },
};

/** Separate staff app on the shared Aviator backend. Marketers and the owner (admin) only. */
export default function MarketersLayout({ children }: { children: React.ReactNode }) {
  return <MarketersGuard>{children}</MarketersGuard>;
}
