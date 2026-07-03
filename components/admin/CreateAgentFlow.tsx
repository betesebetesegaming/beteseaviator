"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
import { adminCreateUser, errorMessage } from "@/lib/api";
import { AgentMarketingLinks } from "@/components/agent/AgentMarketingLinks";
import { agentSignupUrl, slugifyAgentName } from "@/lib/agentLinks";
import { STAFF_LOGIN_PATH } from "@/lib/staff-routes";
import { Button, Input, Modal } from "@/components/ui";

type CreatedAgent = {
  slug: string;
  name: string;
  loginId: string;
  password: string;
};

type Props = {
  buttonLabel?: string;
  autoOpen?: boolean;
};

/** Admin-only: opens agent account — link uses full first + surname. */
export function CreateAgentFlow({ buttonLabel = "Create Agent Account", autoOpen = false }: Props) {
  const [open, setOpen] = useState(autoOpen);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedAgent | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const linkPreview = useMemo(() => {
    const slug = slugifyAgentName(form.name);
    if (!slug) return null;
    return agentSignupUrl(slug).replace(/^https?:\/\//, "");
  }, [form.name]);

  function resetForm() {
    setForm({ name: "", email: "", password: "" });
  }

  async function submit() {
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const password = form.password;
    if (!name) return toast.error("Enter first name and surname together (e.g. Fatou Jarju).");
    if (slugifyAgentName(name).length < 3) {
      return toast.error("Name is too short for a signup link — use first and surname.");
    }
    if (password.length < 8) return toast.error("Staff password must be at least 8 characters.");

    setCreating(true);
    try {
      const res = await adminCreateUser({
        role: "agent",
        name,
        email: email || undefined,
        password,
      });
      if (!res.slug) {
        toast.error("Agent created but link is missing — use Fix agent logins on All Users.");
        setOpen(false);
        resetForm();
        return;
      }
      setCreated({
        slug: res.slug,
        name,
        loginId: res.slug,
        password,
      });
      setOpen(false);
      resetForm();
      toast.success(`Agent ${name} created — customers under this link earn them GGR commission.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <span className="flex items-center gap-1.5">
          <Plus size={16} /> {buttonLabel}
        </span>
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Create agent account (admin only)">
        <div className="space-y-4">
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            Use the agent&apos;s <strong>full name</strong> (first + surname). Their customer link becomes{" "}
            <strong>beteseaviator.com/agent/firstnamesurname</strong>. Everyone who signs up or is opened
            under them counts for their GGR commission.
          </p>
          <Input
            label="Full name (first + surname)"
            placeholder="Fatou Jarju"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          {linkPreview ? (
            <p className="text-xs text-emerald-300">
              Customer link: <code className="text-emerald-100">{linkPreview}</code>
            </p>
          ) : null}
          <Input
            label="Email (optional — sign in at /admin/login)"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label="Password (min 8 characters — share with agent)"
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
                  <dd className="font-mono">{created.loginId}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-emerald-300/80">Password</dt>
                  <dd className="font-mono">{created.password}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-emerald-200/80">
                Customers from this link or opened by {created.name} play under them — agent earns
                commission on their GGR.
              </p>
            </div>
            <AgentMarketingLinks slug={created.slug} agentName={created.name} />
            <Button className="w-full" onClick={() => setCreated(null)}>
              Done
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
