import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { agentLogin } from "@/lib/api";
import type { Role } from "@/lib/types";

/** Single sign-in page for admin, super agents and sub agents */
export const STAFF_LOGIN_PATH = "/admin/login";

export function isStaffRole(role: Role | undefined | null): boolean {
  return role === "admin" || role === "super_agent" || role === "sub_agent";
}

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

/** Maps staff usernames to their Firebase Auth email (password verified server-side when needed). */
const STAFF_USERNAME_EMAILS: Record<string, string> = {
  admin: "admin@beteseaviator.com",
};

export async function loginStaffAccount(id: string, password: string) {
  const trimmed = id.trim();
  const lower = trimmed.toLowerCase();

  if (trimmed.includes("@")) {
    await signInWithEmailAndPassword(auth, lower, password);
    return;
  }

  const mappedEmail = STAFF_USERNAME_EMAILS[lower];
  if (mappedEmail) {
    await signInWithEmailAndPassword(auth, mappedEmail, password);
    return;
  }

  const { email } = await agentLogin({
    username: lower,
    password,
  });
  await signInWithEmailAndPassword(auth, email, password);
}

/** @deprecated Use loginStaffAccount */
export const loginAgentAccount = loginStaffAccount;
