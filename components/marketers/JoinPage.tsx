"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { mk, type ApprovedLink } from "@/lib/marketersApi";
import { rememberMarketerRef, withMarketerRef } from "@/lib/marketerRef";
import { Loading, Notice } from "./ui";

interface Info {
  valid: boolean;
  firstName: string | null;
  links: ApprovedLink[];
}

const BLURB: Record<string, string> = {
  football: "Sports and football betting",
  aviator: "Aviator and casino games",
};

/** Used only if the server can't be reached, so a customer is never left without a way to the sites. */
const FALLBACK_LINKS: ApprovedLink[] = [
  { id: "aviator", label: "Betese Aviator", product: "aviator", url: "https://beteseaviator.com/" },
  { id: "football", label: "Betese Football", product: "football", url: "https://www.betesegaming.com/" },
];

/** Public page a marketer's share link opens. Text-first, no sign-in, no data collected. */
export function JoinPage({ slug }: { slug: string }) {
  const [info, setInfo] = useState<Info | null>(null);

  useEffect(() => {
    let live = true;
    mk<Info>("shareLinkInfo", { slug }).then(
      (i) => {
        if (!live) return;
        if (i.valid) rememberMarketerRef(slug);
        setInfo(i);
      },
      () => live && setInfo({ valid: false, firstName: null, links: FALLBACK_LINKS }),
    );
    return () => {
      live = false;
    };
  }, [slug]);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-md space-y-4">
        <div className="rounded-2xl bg-[#0b2a5b] p-5 text-white">
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-300">Betese</p>
          <h1 className="mt-1 text-2xl font-bold">Join Betese</h1>
          {info?.valid && info.firstName ? (
            <p className="mt-2 text-sm text-slate-200">
              Invited by <span className="font-semibold text-white">{info.firstName}</span>, Betese marketer.
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-200">Choose where you want to play.</p>
          )}
        </div>

        {!info ? (
          <Loading />
        ) : (
          <div className="space-y-3">
            {info.links.map((l) => (
              <a
                key={l.id}
                href={info.valid && l.product === "aviator" ? withMarketerRef(l.url, slug) : l.url}
                rel="noopener noreferrer"
                className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50"
              >
                <span>
                  <span className="block text-lg font-bold text-[#0b2a5b]">Open {l.label}</span>
                  <span className="block text-xs text-slate-500">{BLURB[l.product] ?? new URL(l.url).hostname}</span>
                </span>
                <ExternalLink className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
              </a>
            ))}
          </div>
        )}

        <Notice>
          Create your own account on the website. Never share your password or verification code with anyone
          {info?.valid && info.firstName ? `, including ${info.firstName}` : ""}.
        </Notice>
        <p className="text-center text-xs text-slate-500">Betting is for adults 18+. Play responsibly.</p>
      </div>
    </main>
  );
}
