"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Plus, Search } from "lucide-react";
import { db } from "@/lib/firestore";
import { adminCreateUser, adminBackfillPlayerIds, adminSetAgentCashOps, adminSetUserStatus, adminSyncAgentLogins, errorMessage } from "@/lib/api";
import { formatPlayerId, playerDisplayId } from "@/lib/playerId";
import { agentSignupUrl } from "@/lib/agentLinks";
import { staffSignInId } from "@/lib/staffAccount";
import { normalizePhone, formatDate } from "@/lib/format";
import {
  PASSWORD_FIELD_LABEL,
  PASSWORD_MAX,
  validatePassword,
} from "@/lib/passwordPolicy";
import { AdminResetPasswordModal } from "@/components/admin/AdminResetPasswordModal";
import { PasswordStrengthHint } from "@/components/PasswordStrengthHint";
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
  return (
    <Suspense fallback={<Spinner />}>
      <AdminUsersContent />
    </Suspense>
  );
}

function AdminUsersContent() {
  const searchParams = useSearchParams();
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
  const [backfillingIds, setBackfillingIds] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserProfile | null>(null);

  function openCreate(role: Role = "player") {
    setForm({
      role,
      name: "",
      email: "",
      phone: "",
      username: "",
      password: "",
      parentId: "",
    });
    setCreateOpen(true);
  }

  useEffect(() => {
    if (searchParams.get("create") === "agent") {
      window.location.replace("/admin/agents?create=1");
    }
  }, [searchParams]);

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
          u.phone?.includes(normalizePhone(s) || s) ||
          (u.playerNumber ? formatPlayerId(u.playerNumber).toLowerCase().includes(s) : false) ||
          String(u.playerNumber ?? "").includes(s)
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

  async function backfillPlayerIds() {
    setBackfillingIds(true);
    try {
      const res = await adminBackfillPlayerIds({ limit: 2000 });
      toast.success(`Assigned Player IDs to ${res.count} customer${res.count === 1 ? "" : "s"}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBackfillingIds(false);
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

  async function toggleCashOps(u: UserProfile) {
    const next = !u.cashOpsEnabled;
    setBusyUid(u.uid);
    try {
      await adminSetAgentCashOps({ uid: u.uid, enabled: next });
      toast.success(`${u.name}: cash desk ${next ? "enabled" : "disabled"}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyUid(null);
    }
  }

  async function create() {
    const { role, name, email, phone, username, password, parentId } = form;
    if (!name.trim()) return toast.error("Name is required.");
    if (role === "player") {
      const pwCheck = validatePassword(password);
      if (!pwCheck.ok) return toast.error(pwCheck.message);
    } else if (password.length < 8) {
      return toast.error("Staff password must be at least 8 characters.");
    }
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
      toast.success(
        role === "admin"
          ? `Admin created. Sign in at /admin/login with ${email.trim() || username.trim() || name.trim()}.`
          : `User created${res.slug ? ` — username "${res.slug}"` : ""}.`,
      );
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
          <h1 className="text-xl font-bold">All Users</h1>
          <p className="text-sm text-slate-400">
            Customers, admins, and Player IDs. Agents are created under{" "}
            <Link href="/admin/agents" className="text-emerald-400 hover:underline">
              Agents
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => openCreate("admin")}>
            <span className="flex items-center gap-1.5">
              <Plus size={16} /> Create Admin
            </span>
          </Button>
          <Button variant="secondary" onClick={() => openCreate("player")}>
            <span className="flex items-center gap-1.5">
              <Plus size={16} /> Create Customer
            </span>
          </Button>
          <Link href="/admin/agents?create=1">
            <Button variant="secondary">
              <span className="flex items-center gap-1.5">
                <Plus size={16} /> Create Agent
              </span>
            </Button>
          </Link>
          <Button variant="secondary" onClick={() => void backfillPlayerIds()} disabled={backfillingIds}>
            {backfillingIds ? "Assigning…" : "Assign Player IDs"}
          </Button>
          <Button variant="secondary" onClick={() => void syncAgentLogins()} disabled={syncingAgents}>
            {syncingAgents ? "Syncing…" : "Fix agent logins"}
          </Button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4">
        <div className="min-w-0 text-sm text-emerald-50/95">
          <p className="font-semibold text-emerald-200">Need another admin login?</p>
          <p className="mt-1 text-emerald-100/80">
            Name + password (min 8). Optional email / login ID. They sign in at{" "}
            <Link href="/admin/login" className="underline">
              /admin/login
            </Link>
            .
          </p>
        </div>
        <Button onClick={() => openCreate("admin")}>
          <span className="flex items-center gap-1.5">
            <Plus size={16} /> Create Admin
          </span>
        </Button>
      </div>

      <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-50/90">
        <p>
          <strong>Password help:</strong> Admin cannot view existing passwords (they are encrypted).
          Use <strong>Reset password</strong> on any customer or agent to set a new one and share it
          with them when they have sign-in problems.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
          <Input
            placeholder="Search name, phone, Player ID, username…"
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
              <Th>Player ID</Th>
              <Th>Role</Th>
              <Th>Login</Th>
              <Th>Agent / Username</Th>
              <Th>Agent link</Th>
              <Th>Joined</Th>
              <Th>Status</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const owner = u.role === "player" && u.parentId
                ? users?.find((a) => a.uid === u.parentId)
                : null;
              return (
              <tr key={u.uid}>
                <Td className="font-medium">{u.name}</Td>
                <Td className="font-mono text-sm text-emerald-300">
                  {u.role === "player" ? playerDisplayId(u) : "—"}
                </Td>
                <Td>
                  <Badge value={displayRole(u.role)} />
                </Td>
                <Td className="tabular-nums text-slate-400">
                  {u.role === "player"
                    ? (u.phone ?? "—")
                    : (staffSignInId(u) ?? "—")}
                </Td>
                <Td className="text-emerald-300">
                  {u.role === "player" ? (owner?.name ?? "Direct") : (u.agentSlug ?? "—")}
                </Td>
                <Td>
                  {u.agentSlug ? (
                    <a
                      href={agentSignupUrl(u.agentSlug)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-400 hover:underline"
                    >
                      beteseaviator.com/agent/{u.agentSlug}
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
                  <div className="flex flex-wrap gap-1.5">
                    {u.role !== "admin" ? (
                      <Button
                        variant="secondary"
                        className="!px-2.5 !py-1 text-xs"
                        onClick={() => setResetPasswordUser(u)}
                      >
                        Reset password
                      </Button>
                    ) : null}
                    {isAgentRole(u.role) ? (
                      <Button
                        variant={u.cashOpsEnabled ? "secondary" : "secondary"}
                        className={`!px-2.5 !py-1 text-xs ${u.cashOpsEnabled ? "text-amber-200" : ""}`}
                        disabled={busyUid === u.uid}
                        onClick={() => toggleCashOps(u)}
                        title="Enable OTC cash deposit/withdraw at agent shop"
                      >
                        {u.cashOpsEnabled ? "Cash desk on" : "Cash desk off"}
                      </Button>
                    ) : null}
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
                  </div>
                </Td>
              </tr>
            );
            })}
          </tbody>
        </TableShell>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={form.role === "agent" ? "Create Agent Account" : form.role === "admin" ? "Create Admin Account" : "Create Customer"}
      >
        <div className="space-y-4">
          <Select
            label="Role"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          >
            <option value="player">Customer</option>
            <option value="agent">Agent</option>
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
            label={
              form.role === "player"
                ? PASSWORD_FIELD_LABEL
                : "Password (min 8 characters)"
            }
            type="password"
            value={form.password}
            maxLength={form.role === "player" ? PASSWORD_MAX : undefined}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          {form.role === "player" ? (
            <PasswordStrengthHint length={form.password.length} />
          ) : null}
          {isStaffRole && form.role === "admin" ? (
            <p className="rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
              New admins get full backend access. Share the password securely — it cannot be viewed
              again (only reset).
            </p>
          ) : null}
          <Button className="w-full" onClick={create} disabled={creating}>
            {creating
              ? "Creating…"
              : form.role === "admin"
                ? "Create admin"
                : "Create"}
          </Button>
        </div>
      </Modal>

      <AdminResetPasswordModal
        user={resetPasswordUser}
        onClose={() => setResetPasswordUser(null)}
      />
    </div>
  );
}
