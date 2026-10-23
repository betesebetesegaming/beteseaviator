/**
 * Remembers which marketer's share link (/join/<slug>, or ?mk=<slug>) brought this device here, so sign-up
 * can pass it on. It is only a hint: the server checks the slug and decides whether anyone is credited.
 */
const KEY = "betese_mk_ref";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SLUG = /^[a-z]{1,16}-[a-z0-9]{4}$/;

export function rememberMarketerRef(slug: string | null | undefined): void {
  const s = String(slug ?? "").trim().toLowerCase();
  if (!SLUG.test(s)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ slug: s, atMs: Date.now() }));
  } catch {
    /* storage blocked — sign-up just won't carry the link */
  }
}

export function captureMarketerRefFromUrl(): void {
  if (typeof window === "undefined") return;
  rememberMarketerRef(new URLSearchParams(window.location.search).get("mk"));
}

export function readMarketerRef(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { slug, atMs } = JSON.parse(raw) as { slug?: string; atMs?: number };
    if (!slug || !SLUG.test(slug) || !(Date.now() - Number(atMs) < MAX_AGE_MS)) return null;
    return slug;
  } catch {
    return null;
  }
}

/** Adds ?mk=<slug> to an Aviator link so the marketer is remembered even on another domain. */
export function withMarketerRef(url: string, slug: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("mk", slug);
    return u.toString();
  } catch {
    return url;
  }
}
