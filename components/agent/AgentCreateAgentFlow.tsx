"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { UserPlus } from "lucide-react";
import { agentCreateAgent, errorMessage } from "@/lib/api";
import { AgentMarketingLinks } from "@/components/agent/AgentMarketingLinks";
import { agentLinkSlug, agentSignupUrl, type AgentLinkMode } from "@/lib/agentLinks";
import { STAFF_LOGIN_PATH } from "@/lib/staff-routes";
import { Button, Input, Modal } from "@/components/ui";

type CreatedAgent = {
  slug: string;
  name: string;
  password: string;
};

type Props = {
  buttonLabel?: string;
};

/**
 * Agents open new, INDEPENDENT agent accounts to grow the network.
 * Flat model: you earn no commission from the new agent's players — they run
 * their own shop and keep their own commission.
 */
export function AgentCreateAgentFlow({ buttonLabel = "Open Agent Account" }: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedAgent | null>(null);
  const [form, setForm] = useState({
    name: "",
    password: "",
    linkMode: "first" as AgentLinkMode,
  });

  const linkPreview = useMemo(() => {
    const slug = agentLinkSlug(form.name, form.linkMode);
    if (slug.length < 2) return null;
    return agentSignupUrl(slug).replace(/^https?:\/\//, "");
  }, [form.name, form.linkMode]);

  function resetForm() {
    setForm({ name: "", password: "", linkMode: "first" });
  }

  async function submit() {
    const name = form.name.trim();
    const password = form.password;
    if (!name) return toast.error("Enter the agent's name (e.g. Fatou Jarju).");
    if (agentLinkSlug(name, form.linkMode).length < 2) {
      return toast.error("Name is too short for an agent link.");
    }
    if (password.length < 8) return toast.error("Staff password must be at least 8 characters.");

    setCreating(true);
    try {
      const res = await agentCreateAgent({ name, password, linkMode: form.linkMode });
      setCreated({ slug: res.slug, name, password });
      setOpen(false);
      resetForm();
      toast.success(`Agent ${name} created.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <span className="flex items-center gap-1.5">
          <UserPlus size={16} /> {buttonLabel}
        </span>
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Open a new agent account">
        <div className="space-y-4">
          <p className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-100">
            This creates an <strong>independent agent</strong>. They get their own agent link and keep
            their own commission — you earn nothing from their players. It grows the BETESE network.
          </p>
          <Input
            label="Full name (first + surname)"
            placeholder="Fatou Jarju"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div>
            <p className="mb-2 text-sm text-slate-300">Their agent link style</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, linkMode: "first" })}
                className={`rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                  form.linkMode === "first"
                    ? "border-emerald-400 bg-emerald-500/15 text-emerald-100"
                    : "border-white/10 text-slate-400 hover:bg-white/5"
                }`}
              >
                <span className="font-semibold">First name only</span>
                <span className="mt-0.5 block text-xs opacity-80">Shorter — e.g. /agent/fatou</span>
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, linkMode: "full" })}
                className={`rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                  form.linkMode === "full"
                    ? "border-emerald-400 bg-emerald-500/15 text-emerald-100"
                    : "border-white/10 text-slate-400 hover:bg-white/5"
                }`}
              >
                <span className="font-semibold">Full name</span>
                <span className="mt-0.5 block text-xs opacity-80">Longer — e.g. /agent/fatoujarju</span>
              </button>
            </div>
          </div>
          {linkPreview ? (
            <p className="text-xs text-emerald-300">
              Link preview: <code className="text-emerald-100">{linkPreview}</code>
            </p>
          ) : null}
          <Input
            label="Password (min 8 characters — share with the new agent)"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Button className="w-full" onClick={() => void submit()} disabled={creating}>
            {creating ? "Creating…" : "Create agent account"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={!!created}
        onClose={() => setCreated(null)}
        title="Agent ready — share link & login"
      >
        {created && (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
              <p className="font-semibold text-emerald-100">{created.name}</p>
              <dl className="mt-3 space-y-2 text-emerald-50/90">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-emerald-300/80">Staff sign-in</dt>
                  <dd className="font-mono">{STAFF_LOGIN_PATH}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-emerald-300/80">Username</dt>
                  <dd className="font-mono">{created.slug}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-emerald-300/80">Password</dt>
                  <dd className="font-mono">{created.password}</dd>
                </div>
              </dl>
            </div>
            <AgentMarketingLinks slug={created.slug} agentName={created.name} showStaffLogin />
            <Button className="w-full" onClick={() => setCreated(null)}>
              Done
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
