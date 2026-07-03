"use client";

import toast from "react-hot-toast";
import { Copy, CheckCircle2 } from "lucide-react";
import { buildAgentLinks } from "@/lib/agentLinks";
import { ShareLinkPanel } from "@/components/shared/ShareLinkPanel";
import { agentSignupShareMessage } from "@/lib/agentShare";
import { Button, Modal } from "@/components/ui";

type Props = {
  open: boolean;
  onClose: () => void;
  customerName: string;
  playerId: string;
  phone: string;
  agentSlug?: string | null;
  agentName?: string;
};

/** Shown after an agent successfully registers a customer — Player ID + share prompts. */
export function CustomerCreatedSuccess({
  open,
  onClose,
  customerName,
  playerId,
  phone,
  agentSlug,
  agentName,
}: Props) {
  const links = agentSlug ? buildAgentLinks(agentSlug) : null;

  async function copyId() {
    await navigator.clipboard.writeText(playerId);
    toast.success("Player ID copied!");
  }

  return (
    <Modal open={open} onClose={onClose} title="Customer account opened">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={22} />
          <div>
            <p className="font-semibold text-white">{customerName} is ready</p>
            <p className="mt-1 text-sm text-slate-300">
              Phone login: <span className="tabular-nums">{phone}</span>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-bold text-emerald-300">{playerId}</span>
              <button
                type="button"
                onClick={() => void copyId()}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/10"
              >
                <Copy size={12} /> Copy ID
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Give them this Player ID for the office. They sign in with their phone + password.
            </p>
          </div>
        </div>

        {links ? (
          <ShareLinkPanel
            compact
            accent="emerald"
            title="Share your signup link too"
            subtitle="More customers can still join you online — same as your shop QR."
            url={links.signupUrl}
            shareMessage={agentSignupShareMessage({
              agentName: agentName ?? agentSlug ?? "Agent",
              signupUrl: links.signupUrl,
            })}
            qrLabel={`Scan — ${links.slug}`}
            downloadFileName={`betese-${links.slug}-qr`}
          />
        ) : null}

        <Button className="w-full" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
