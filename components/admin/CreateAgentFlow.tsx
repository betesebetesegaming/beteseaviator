"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
import { adminCreateUser, errorMessage } from "@/lib/api";
import { AgentMarketingLinks } from "@/components/agent/AgentMarketingLinks";
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

/** Admin-only: opens the first staff account for a new agent marketer. */
export function CreateAgentFlow({ buttonLabel = "Create Agent Account", autoOpen = false }: Props) {
  const [open, setOpen] = useState(autoOpen);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedAgent | null>(null);
  const [form, setForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
  });

  function resetForm() {
    setForm({ name: "", username: "", email: "", password: "" });
  }

  async function submit() {
    const name = form.name.trim();
    const username = form.username.trim().toLowerCase();
    const email = form.email.trim().toLowerCase();
    const password = form.password;
    if (!name) return toast.error("Enter the agent's full name.");
    if (password.length < 8) return toast.error("Staff password must be at least 8 characters.");
    if (!username && !email) {
      return toast.error("Add a username (e.g. paul) or email so they can sign in.");
    }

    setCreating(true);
    try {
      const res = await adminCreateUser({
        role: "agent",
        name,
        username: username || undefined,
        email: email || undefined,
        password,
      });
      if (!res.slug) {
        toast.error("Agent created but username link is missing — use Fix agent logins on All Users.");
        setOpen(false);
        resetForm();
        return;
      }
      setCreated({
        slug: res.slug,
        name,
        loginId: username || res.slug,
        password,
      });
      setOpen(false);
      resetForm();
      toast.success(`Agent account created for ${name}.`);
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
            Only BETESE admin can open an agent&apos;s first staff account. Agents cannot self-register —
            give them the username and password below after you create the account.
          </p>
          <Input
            label="Full name"
            placeholder="Paul Jallow"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Username (sign-in + customer link — e.g. paul → beteseaviator.com/paul)"
            placeholder="paul"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
          <Input
            label="Email (optional — if they prefer email sign-in)"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label="Password (min 8 characters — share securely with the agent)"
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
        title="Agent account ready — share with agent"
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
                Copy these details for the agent. They use this to sign in and manage customers — they
                cannot create their own staff account.
              </p>
            </div>
            <p className="text-sm text-slate-400">
              Customer signup link for this agent:
            </p>
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
