/** Agent marketing URLs — subdomain + referral link (Gambia primary site). */

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

export type AgentLinks = {
  slug: string;
  subdomain: string;
  subdomainUrl: string;
  referralUrl: string;
};

export function buildAgentLinks(slug: string): AgentLinks {
  const clean = slug.trim().toLowerCase();
  const subdomain = `${clean}.${AGENT_DOMAIN}`;
  return {
    slug: clean,
    subdomain,
    subdomainUrl: `https://${subdomain}`,
    referralUrl: `${SITE_ORIGIN}/play?signup=1&ref=${encodeURIComponent(clean)}`,
  };
}

export function agentSubdomainUrl(slug: string): string {
  return buildAgentLinks(slug).subdomainUrl;
}

export function agentReferralUrl(slug: string): string {
  return buildAgentLinks(slug).referralUrl;
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
