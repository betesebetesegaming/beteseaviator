/** Agent marketing URLs — path link (primary) + legacy subdomain. */

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
  "favicon.ico",
  "icon.png",
  "_next",
  ...AGENT_RESERVED_SUBDOMAINS,
]);

export type AgentLinks = {
  slug: string;
  /** Primary share link: beteseaviator.com/paul */
  signupUrl: string;
  /** @deprecated Legacy subdomain — still works */
  subdomain: string;
  subdomainUrl: string;
  referralUrl: string;
};

export function buildAgentLinks(slug: string): AgentLinks {
  const clean = slug.trim().toLowerCase();
  const subdomain = `${clean}.${AGENT_DOMAIN}`;
  return {
    slug: clean,
    signupUrl: `${SITE_ORIGIN}/${clean}`,
    subdomain,
    subdomainUrl: `https://${subdomain}`,
    referralUrl: `${SITE_ORIGIN}/play?signup=1&ref=${encodeURIComponent(clean)}`,
  };
}

/** Primary marketing URL agents share (path format). */
export function agentSignupUrl(slug: string): string {
  return buildAgentLinks(slug).signupUrl;
}

export function agentSubdomainUrl(slug: string): string {
  return buildAgentLinks(slug).subdomainUrl;
}

export function agentReferralUrl(slug: string): string {
  return buildAgentLinks(slug).referralUrl;
}

/** Staff sign-in for super agents and sub agents (not player signup). */
export function staffLoginUrl(): string {
  return `${SITE_ORIGIN}${STAFF_LOGIN_PATH}`;
}

/** e.g. /paul → "paul" */
export function parseAgentSlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/([a-z0-9][a-z0-9-]{0,23})\/?$/i);
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
