import { NextResponse, type NextRequest } from "next/server";
import {
  AGENT_RESERVED_PATHS,
  parseAgentSlugFromHost,
  SITE_ORIGIN,
} from "@/lib/agentLinks";
import { STAFF_LOGIN_PATH } from "@/lib/staff-routes";

const AGENT_DOMAIN =
  process.env.NEXT_PUBLIC_AGENT_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "") ||
  "beteseaviator.com";

/**
 * Agent links: beteseaviator.com/paul (path) or paul.beteseaviator.com (legacy subdomain).
 * Both open /play with ?ref=paul so sign-ups attach to that agent.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const h = host.split(":")[0].toLowerCase();
  const url = request.nextUrl.clone();

  const playerRefMatch = url.pathname.match(/^\/r\/([A-Za-z0-9]+)\/?$/);
  if (playerRefMatch) {
    url.pathname = "/play";
    url.searchParams.set("signup", "1");
    url.searchParams.set("pref", playerRefMatch[1].toUpperCase());
    return NextResponse.redirect(url);
  }

  if (h === `admin.${AGENT_DOMAIN}`) {
    if (!url.pathname.startsWith("/admin")) {
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const pathMatch = url.pathname.match(/^\/([a-z0-9][a-z0-9-]{0,23})\/?$/i);
  if (pathMatch) {
    const pathSlug = pathMatch[1].toLowerCase();
    if (!AGENT_RESERVED_PATHS.has(pathSlug)) {
      url.pathname = "/play";
      if (!url.searchParams.has("ref")) url.searchParams.set("ref", pathSlug);
      if (!url.searchParams.has("signup")) url.searchParams.set("signup", "1");
      return NextResponse.redirect(url);
    }
  }

  const slug = parseAgentSlugFromHost(host);
  if (!slug) return NextResponse.next();

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
