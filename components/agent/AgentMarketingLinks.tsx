"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Copy, ExternalLink, Link2 } from "lucide-react";
import { buildAgentLinks } from "@/lib/agentLinks";
import { Card } from "@/components/ui";

type Props = {
  slug: string;
  agentName?: string;
  compact?: boolean;
};

export function AgentMarketingLinks({ slug, agentName, compact }: Props) {
  const links = buildAgentLinks(slug);
  const [copied, setCopied] = useState<"sub" | "ref" | null>(null);

  async function copy(text: string, which: "sub" | "ref") {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    toast.success("Copied!");
    setTimeout(() => setCopied(null), 2000);
  }

  if (compact) {
    return (
      <div className="space-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={links.subdomainUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-emerald-300 hover:underline"
          >
            {links.subdomain}
          </a>
          <button
            type="button"
            onClick={() => copy(links.subdomainUrl, "sub")}
            className="text-slate-500 hover:text-white"
            title="Copy subdomain link"
          >
            <Copy size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <Card className="border-emerald-500/30 bg-emerald-500/5">
      <div className="mb-3 flex items-center gap-2">
        <Link2 size={18} className="text-emerald-300" />
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">
            {agentName ? `${agentName}'s marketing links` : "Your marketing links"}
          </p>
          <p className="text-[11px] text-slate-500">
            Share either link — new players sign up under you automatically.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Agent subdomain (recommended)
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 overflow-x-auto rounded-lg bg-slate-950/70 px-3 py-2 text-sm text-emerald-200">
              {links.subdomainUrl}
            </code>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => copy(links.subdomainUrl, "sub")}
                className="flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
              >
                <Copy size={14} /> {copied === "sub" ? "Copied" : "Copy"}
              </button>
              <a
                href={links.subdomainUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
              >
                <ExternalLink size={14} /> Open
              </a>
            </div>
          </div>
          <p className="mt-1 text-[10px] text-slate-600">
            Example: <strong>{slug}.beteseaviator.com</strong> — customers land on Aviator and
            register under you.
          </p>
        </div>

        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Referral link (main site)
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 overflow-x-auto rounded-lg bg-slate-950/70 px-3 py-2 text-xs text-slate-300 sm:text-sm">
              {links.referralUrl}
            </code>
            <button
              type="button"
              onClick={() => copy(links.referralUrl, "ref")}
              className="flex items-center justify-center gap-1 rounded-lg border border-emerald-500/40 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/10"
            >
              <Copy size={14} /> {copied === "ref" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
