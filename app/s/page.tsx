import type { Metadata } from "next";
import { StaffLoginPage } from "@/components/auth/StaffLoginPage";

export const metadata: Metadata = {
  title: "Staff sign in | BETESE",
  description: "Admin and agent staff login",
  robots: { index: false, follow: false },
};

/** Short low-byte staff login: beteseaviator.com/s */
export default function ShortStaffLoginPage() {
  return <StaffLoginPage />;
}
