import { NextResponse, type NextRequest } from "next/server";
import { AGENT_RESERVED_SUBDOMAINS, SITE_ORIGIN } from "@/lib/agentLinks";
import { STAFF_LOGIN_PATH } from "@/lib/staff-routes";

const AGENT_DOMAIN =
  process.env.NEXT_PUBLIC_AGENT_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "") ||
  "beteseaviator.com";

function parseAgentSlugFromHost(host: string): string | null {
  const h = host.split(":")[0].toLowerCase();
  if (!h || h === AGENT_DOMAIN || h === `www.${AGENT_DOMAIN}`) return null;
  const suffix = `.${AGENT_DOMAIN}`;
  if (!h.endsWith(suffix)) return null;
  const slug = h.slice(0, -suffix.length);
  if (!slug || slug.includes(".") || AGENT_RESERVED_SUBDOMAINS.includes(slug)) return null;
  return slug;
}

/**
 * Agent subdomains (e.g. paul.beteseaviator.com) open /play with ?ref=paul
 * so sign-ups attach to that agent automatically.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const h = host.split(":")[0].toLowerCase();

  if (h === `admin.${AGENT_DOMAIN}`) {
    const url = request.nextUrl.clone();
    if (!url.pathname.startsWith("/admin")) {
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const slug = parseAgentSlugFromHost(host);
  if (!slug) return NextResponse.next();

  const url = request.nextUrl.clone();

  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/agent")) {
    return NextResponse.redirect(new URL(STAFF_LOGIN_PATH, SITE_ORIGIN));
  }

  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = "/play";
  }

  if (!url.pathname.startsWith("/play")) {
    url.pathname = "/play";
  }

  if (!url.searchParams.has("ref")) {
    url.searchParams.set("ref", slug);
  }
  if (!url.searchParams.has("signup")) {
    url.searchParams.set("signup", "1");
  }

  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|promotions).*)"],
};
