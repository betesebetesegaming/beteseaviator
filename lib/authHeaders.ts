import { auth } from "@/lib/firebase";

/** Attach Firebase ID token for authenticated Cloud Function HTTP calls. */
export async function authFetchHeaders(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  };
  const user = auth.currentUser;
  if (!user) return headers;
  const token = await user.getIdToken();
  headers.Authorization = `Bearer ${token}`;
  return headers;
}
