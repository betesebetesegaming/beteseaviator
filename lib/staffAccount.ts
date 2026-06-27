import type { UserProfile } from "@/lib/types";

/** Username agents use at /admin/login (slug, staff id, or email). */
export function staffSignInId(
  profile: Pick<UserProfile, "email" | "agentSlug" | "staffLoginId"> | null | undefined
): string | null {
  if (!profile) return null;
  const email = profile.email?.trim().toLowerCase();
  if (email?.includes("@")) return email;
  const slug = profile.agentSlug?.trim().toLowerCase();
  if (slug) return slug;
  const staffId = profile.staffLoginId?.trim().toLowerCase();
  if (staffId) return staffId;
  return null;
}

export function staffSignInHint(
  profile: Pick<UserProfile, "role" | "email" | "agentSlug" | "staffLoginId"> | null | undefined
): string {
  if (!profile) return "Sign in at /admin/login with your username or email.";
  if (profile.role === "admin") return "Sign in with username admin or your admin email.";
  const id = staffSignInId(profile);
  if (id) return `Sign in at /admin/login with username "${id}" and your password.`;
  return "Your username is not set — contact BETESE admin.";
}
