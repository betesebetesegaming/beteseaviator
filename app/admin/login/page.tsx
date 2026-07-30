import { redirect } from "next/navigation";
import { STAFF_LOGIN_PATH } from "@/lib/staff-routes";

/** Legacy /admin/login → short /s (faster, fewer bytes for SMS/QR). */
export default function AdminLoginRedirect() {
  redirect(STAFF_LOGIN_PATH);
}
