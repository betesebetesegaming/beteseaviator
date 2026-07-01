"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Plus, Search } from "lucide-react";
import { db } from "@/lib/firestore";
import { adminCreateUser, adminSetUserStatus, adminSyncAgentLogins, errorMessage } from "@/lib/api";
import { agentSubdomainUrl } from "@/lib/agentLinks";
import { staffSignInId } from "@/lib/staffAccount";
import { AgentMarketingLinks } from "@/components/agent/AgentMarketingLinks";
import { normalizePhone, formatDate } from "@/lib/format";
import type { Role, UserProfile } from "@/lib/types";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  Select,
  Spinner,
  TableShell,
  Td,
  Th,
} from "@/components/ui";

import { isAgentRole, roleLabel as sharedRoleLabel } from "@/lib/roles";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserProfile[] | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    role: "player" as Role,
    name: "",
    email: "",
    phone: "",
    username: "",
    password: "",
    parentId: "",
  });
  const [creating, setCreating] = useState(false);
  const [syncingAgents, setSyncingAgents] = useState(false);
  const [createdAgent, setCreatedAgent] = useState<{ slug: string; name: string } | null>(null);

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(500));
    return onSnapshot(q, (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile));
    });
  }, []);

  const agents = useMemo(
    () => (users ?? []).filter((u) => isAgentRole(u.role)),
    [users]
  );

  const filtered = useMemo(() => {
    if (!users) return null;
    let list = users;
    if (roleFilter !== "all") list = list.filter((u) => u.role === roleFilter);
    const s = search.trim().toLowerCase();
    if (s) {
      list = list.filter(
        (u) =>
          u.name?.toLowerCase().includes(s) ||
          u.email?.toLowerCase().includes(s) ||
          u.agentSlug?.toLowerCase().includes(s) ||
          u.phone?.includes(normalizePhone(s) || s)
      );
    }
    return list;
  }, [users, search, roleFilter]);

  async function toggleStatus(u: UserProfile) {
    const next = u.status === "active" ? "suspended" : "active";
    setBusyUid(u.uid);
    try {
      await adminSetUserStatus({ uid: u.uid, status: next });
      toast.success(`${u.name} is now ${next}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyUid(null);
    }
  }

  async function syncAgentLogins() {
    setSyncingAgents(true);
    try {
      const res = await adminSyncAgentLogins({});
      toast.success(`Agent logins synced for ${res.synced} account${res.synced === 1 ? "" : "s"}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSyncingAgents(false);
    }
  }

  async function create() {
    const { role, name, email, phone, username, password, parentId } = form;
    if (!name.trim()) return toast.error("Name is required.");
    if (password.length < 8) return toast.error("Password must be at least 8 characters.");
    if (role === "player" && !normalizePhone(phone))
      return toast.error("Customers need a valid Gambian mobile number.");
    if (isStaffRole && !email.trim() && !username.trim())
      return toast.error("Staff can sign in with name or username — add a username if needed.");
    setCreating(true);
    try {
      const res = await adminCreateUser({
        role,
        name: name.trim(),
        email: email.trim().toLowerCase() || undefined,
        phone: normalizePhone(phone) || undefined,
        username: username.trim().toLowerCase() || undefined,
        password,
        parentId: parentId || null,
      });
      toast.success(`User created${res.slug ? ` — username "${res.slug}"` : ""}.`);
      if (res.slug && role === "agent") {
        setCreatedAgent({ slug: res.slug, name: name.trim() });
      }
      setCreateOpen(false);
      setForm({
        role: "player",
        name: "",
        email: "",
        phone: "",
        username: "",
        password: "",
        parentId: "",
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  const isAgentForm = form.role === "agent";
  const isStaffRole = isAgentForm || form.role === "admin";

  function displayRole(role: Role): string {
    return sharedRoleLabel(role);
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Users</h1>
          <p className="text-sm text-slate-400">
            All accounts. Suspending blocks sign-in and play — nothing is hard-deleted.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void syncAgentLogins()} disabled={syncingAgents}>
            {syncingAgents ? "Syncing…" : "Fix agent logins"}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <span className="flex items-center gap-1.5">
              <Plus size={16} /> Create User
            </span>
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
          <Input
            placeholder="Search name, phone, email, username…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-44">
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | "all")}>
            <option value="all">All roles</option>
            <option value="player">Customers</option>
            <option value="agent">Agent Marketers</option>
            <option value="admin">Admins</option>
          </Select>
        </div>
      </div>

      {!filtered ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState message="No users match." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Login</Th>
              <Th>Username</Th>
              <Th>Agent link</Th>
              <Th>Joined</Th>
              <Th>Status</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.uid}>
                <Td className="font-medium">{u.name}</Td>
                <Td>
                  <Badge value={displayRole(u.role)} />
                </Td>
                <Td className="tabular-nums text-slate-400">
                  {u.role === "player"
                    ? (u.phone ?? "—")
                    : (staffSignInId(u) ?? "—")}
                </Td>
                <Td className="text-emerald-300">{u.agentSlug ?? "—"}</Td>
                <Td>
                  {u.agentSlug ? (
                    <a
                      href={agentSubdomainUrl(u.agentSlug)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-400 hover:underline"
                    >
                      {u.agentSlug}.beteseaviator.com
                    </a>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="text-slate-500">{formatDate(u.createdAt)}</Td>
                <Td>
                  <Badge value={u.status} />
                </Td>
                <Td>
                  {u.role !== "admin" && (
                    <Button
                      variant={u.status === "active" ? "danger" : "secondary"}
                      className="!px-2.5 !py-1 text-xs"
                      disabled={busyUid === u.uid}
                      onClick={() => toggleStatus(u)}
                    >
                      {u.status === "active" ? "Suspend" : "Re-activate"}
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create User">
        <div className="space-y-4">
          <Select
            label="Role"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          >
            <option value="player">Customer</option>
            <option value="agent">Agent Marketer</option>
            <option value="admin">Admin</option>
          </Select>
          <Input
            label="Full Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          {form.role === "player" ? (
            <Input
              label="Phone (used to sign in)"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          ) : (
            <Input
              label="Email (optional — sign in with username or name instead)"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          )}
          {isStaffRole && (
            <Input
              label={
                form.role === "admin"
                  ? "Staff login ID (sign in at /admin/login — e.g. admin)"
                  : "Username (creates paul.beteseaviator.com automatically — blank = from name)"
              }
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          )}
          {form.role === "player" && (
            <Select
              label="Owning agent (optional — blank = direct BETESE customer)"
              value={form.parentId}
              onChange={(e) => setForm({ ...form, parentId: e.target.value })}
            >
              <option value="">Direct (no agent)</option>
              {agents.map((a) => (
                <option key={a.uid} value={a.uid}>
                  {a.name} ({a.agentSlug}) — {sharedRoleLabel(a.role)}
                </option>
              ))}
            </Select>
          )}
          <Input
            label="Password (min 8 characters)"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Button className="w-full" onClick={create} disabled={creating}>
            {creating ? "Creating…" : "Create"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={!!createdAgent}
        onClose={() => setCreatedAgent(null)}
        title="Agent marketing links ready"
      >
        {createdAgent && (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Share these with <strong>{createdAgent.name}</strong>. Customers who sign up through
              either link are attached to this agent immediately.
            </p>
            <AgentMarketingLinks slug={createdAgent.slug} agentName={createdAgent.name} />
            <Button className="w-full" onClick={() => setCreatedAgent(null)}>
              Done
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
