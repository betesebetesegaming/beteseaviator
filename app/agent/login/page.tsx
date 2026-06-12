import { redirect } from "next/navigation";
import { STAFF_LOGIN_PATH } from "@/lib/staff-routes";

export default function AgentLoginRedirect() {
  redirect(STAFF_LOGIN_PATH);
}
