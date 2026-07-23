/** Agent marketing URLs — /agent/{fullname} (primary) + legacy /{slug} + subdomain. */

import { STAFF_LOGIN_PATH } from "./staff-routes";

export const AGENT_DOMAIN =
  process.env.NEXT_PUBLIC_AGENT_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "") ||
  "beteseaviator.com";

export const SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_URL || `https://www.${AGENT_DOMAIN}`
).replace(/\/$/, "");

/** Subdomains that must never map to an agent (www, admin, …). */
export const AGENT_RESERVED_SUBDOMAINS = [
  "www",
  "admin",
  "api",
  "mail",
  "ftp",
  "betese",
  "app",
];

/** Path segments that are app routes — not agent usernames. */
export const AGENT_RESERVED_PATHS = new Set([
  "play",
  "admin",
  "agent",
  "suspended",
  "api",
  "r",
  "promotions",
  "privacy",
  "terms",
  "delete-account",
  "favicon.ico",
  "icon.png",
  "_next",
  ...AGENT_RESERVED_SUBDOMAINS,
]);

/** First + surname → one link slug, e.g. "Fatou Jarju" → "fatoujarju". */
export function slugifyAgentName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 48);
}

export type AgentLinkMode = "first" | "full";

/** First word of the agent's display name, e.g. "Fatou Jarju" → "fatou". */
export function agentFirstName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return slugifyAgentName(first);
}

/** Pick signup-link slug from full name + admin choice. */
export function agentLinkSlug(name: string, mode: AgentLinkMode): string {
  if (mode === "first") return agentFirstName(name);
  return slugifyAgentName(name);
}

export type AgentLinks = {
  slug: string;
  /** Primary share link: beteseaviator.com/agent/fatoujarju */
  signupUrl: string;
  /** For players whose account the agent already opened — opens Sign in, not Register. */
  loginUrl: string;
  /** @deprecated Legacy short path — still works */
  legacyPathUrl: string;
  subdomain: string;
  subdomainUrl: string;
  referralUrl: string;
};

export function buildAgentLinks(slug: string): AgentLinks {
  const clean = slug.trim().toLowerCase();
  const subdomain = `${clean}.${AGENT_DOMAIN}`;
  return {
    slug: clean,
    signupUrl: `${SITE_ORIGIN}/agent/${clean}`,
    loginUrl: `${SITE_ORIGIN}/agent/${clean}?login=1`,
    legacyPathUrl: `${SITE_ORIGIN}/${clean}`,
    subdomain,
    subdomainUrl: `https://${subdomain}`,
    referralUrl: `${SITE_ORIGIN}/play?signup=1&ref=${encodeURIComponent(clean)}`,
  };
}

/** Primary marketing URL agents share. */
export function agentSignupUrl(slug: string): string {
  return buildAgentLinks(slug).signupUrl;
}

/** Agent link that opens Sign in (for customers the agent already registered). */
export function agentLoginUrl(slug: string): string {
  return buildAgentLinks(slug).loginUrl;
}

export function agentSignupPath(slug: string): string {
  return `/agent/${slug.trim().toLowerCase()}`;
}

export function agentSubdomainUrl(slug: string): string {
  return buildAgentLinks(slug).subdomainUrl;
}

export function agentReferralUrl(slug: string): string {
  return buildAgentLinks(slug).referralUrl;
}

/** Staff sign-in for agents (not customer signup). */
export function staffLoginUrl(): string {
  return `${SITE_ORIGIN}${STAFF_LOGIN_PATH}`;
}

/** e.g. /agent/fatoujarju → "fatoujarju" */
export function parseAgentSlugFromAgentPath(pathname: string): string | null {
  const match = pathname.match(/^\/agent\/([a-z0-9][a-z0-9-]{0,47})\/?$/i);
  if (!match) return null;
  return match[1].toLowerCase();
}

/** Legacy: /paul → "paul" */
export function parseAgentSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/([a-z0-9][a-z0-9-]{0,47})\/?$/i);
  if (!match) return null;
  const slug = match[1].toLowerCase();
  if (AGENT_RESERVED_PATHS.has(slug)) return null;
  return slug;
}

/** e.g. paul.beteseaviator.com → "paul" */
export function parseAgentSlugFromHost(host: string): string | null {
  const h = host.split(":")[0].toLowerCase();
  if (!h || h === AGENT_DOMAIN || h === `www.${AGENT_DOMAIN}`) return null;
  const suffix = `.${AGENT_DOMAIN}`;
  if (!h.endsWith(suffix)) return null;
  const slug = h.slice(0, -suffix.length);
  if (!slug || slug.includes(".") || AGENT_RESERVED_SUBDOMAINS.includes(slug)) return null;
  return slug;
}
