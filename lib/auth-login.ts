import { signInWithCustomToken, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { agentLogin } from "@/lib/api";
import type { Role } from "@/lib/types";

/** Single sign-in page for admin, super agents and sub agents */
export const STAFF_LOGIN_PATH = "/admin/login";

export function loginPathFor(role: Role | undefined | null): string {
  switch (role) {
    case "admin":
    case "super_agent":
    case "sub_agent":
      return STAFF_LOGIN_PATH;
    default:
      return "/play";
  }
}

export async function loginStaffAccount(id: string, password: string) {
  if (id.includes("@")) {
    await signInWithEmailAndPassword(auth, id.trim().toLowerCase(), password);
  } else {
    const { token } = await agentLogin({
      username: id.trim().toLowerCase(),
      password,
    });
    await signInWithCustomToken(auth, token);
  }
}

/** @deprecated Use loginStaffAccount */
export const loginAgentAccount = loginStaffAccount;
