import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { agentLogin } from "@/lib/api";

export { STAFF_LOGIN_PATH, isStaffRole, loginPathFor } from "./staff-routes";

/** Maps staff usernames to their Firebase Auth email (password verified server-side when needed). */
const STAFF_USERNAME_EMAILS: Record<string, string> = {
  admin: "admin@beteseaviator.com",
};

async function signInStaffEmail(email: string, password: string) {
  const normalized = email.toLowerCase();
  const current = auth.currentUser;
  if (current?.email?.toLowerCase() === normalized) {
    await signInWithEmailAndPassword(auth, normalized, password);
    return;
  }
  if (current) {
    await signOut(auth);
  }
  await signInWithEmailAndPassword(auth, normalized, password);
}

export async function loginStaffAccount(id: string, password: string) {
  const trimmed = id.trim();
  const lower = trimmed.toLowerCase();

  if (trimmed.includes("@")) {
    await signInStaffEmail(lower, password);
    return;
  }

  const mappedEmail = STAFF_USERNAME_EMAILS[lower];
  if (mappedEmail) {
    await signInStaffEmail(mappedEmail, password);
    return;
  }

  const { email } = await agentLogin({
    username: lower,
    password,
  });
  await signInStaffEmail(email, password);
}

/** @deprecated Use loginStaffAccount */
export const loginAgentAccount = loginStaffAccount;
