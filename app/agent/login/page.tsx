import { redirect } from "next/navigation";
import { STAFF_LOGIN_PATH } from "@/lib/auth-login";

export default function AgentLoginRedirect() {
  redirect(STAFF_LOGIN_PATH);
}
