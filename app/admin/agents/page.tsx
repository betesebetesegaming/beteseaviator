"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Search } from "lucide-react";
import { db } from "@/lib/firestore";
import { adminSetAgentCashOps, adminSetUserStatus, adminSyncAgentLogins, errorMessage } from "@/lib/api";
import { agentSignupUrl } from "@/lib/agentLinks";
import { staffSignInId } from "@/lib/staffAccount";
import { AdminResetPasswordModal } from "@/components/admin/AdminResetPasswordModal";
import { CreateAgentFlow } from "@/components/admin/CreateAgentFlow";
import { formatDate } from "@/lib/format";
import { isAgentRole, roleLabel as sharedRoleLabel } from "@/lib/roles";
import type { UserProfile } from "@/lib/types";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Spinner,
  TableShell,
  Td,
  Th,
} from "@/components/ui";

function AdminAgentsContent() {
  const searchParams = useSearchParams();
  const autoCreate = searchParams.get("create") === "1";
  const [users, setUsers] = useState<UserProfile[] | null>(null);
  const [search, setSearch] = useState("");
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [syncingAgents, setSyncingAgents] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(500));
    return onSnapshot(q, (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile));
    });
  }, []);

  const agents = useMemo(() => {
    if (!users) return null;
    const list = users.filter((u) => isAgentRole(u.role));
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (u) =>
        u.name?.toLowerCase().includes(s) ||
        u.agentSlug?.toLowerCase().includes(s) ||
        staffSignInId(u)?.toLowerCase().includes(s)
    );
  }, [users, search]);

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

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Agents</h1>
          <p className="text-sm text-slate-400">
            Admin creates every agent&apos;s first staff account here. Agents sign in at{" "}
            <Link href="/admin/login" className="text-emerald-400 hover:underline">
              /admin/login
            </Link>{" "}
            — no self-registration.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void syncAgentLogins()} disabled={syncingAgents}>
            {syncingAgents ? "Syncing…" : "Fix agent logins"}
          </Button>
          <CreateAgentFlow autoOpen={autoCreate} />
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-50/90">
        <p>
          <strong>Password help:</strong> You cannot read an agent&apos;s current password. Use{" "}
          <strong>Reset password</strong> to set a new one and give it to them for /admin/login.
        </p>
      </div>

      <div className="mb-5 rounded-xl border border-violet-500/25 bg-violet-500/10 p-4 text-sm text-violet-50/90">
        <h2 className="font-semibold text-violet-100">Admin-only onboarding</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Click <strong>Create Agent Account</strong> and set name, username, and password.</li>
          <li>Give the agent their username + password for staff sign-in.</li>
          <li>
            Choose link style when creating: <strong>first name only</strong> (e.g.{" "}
            <code className="text-violet-200">/agent/fatou</code>) or <strong>full name</strong> (
            <code className="text-violet-200">/agent/fatoujarju</code>).
          </li>
          <li>Turn on <strong>Cash desk</strong> below if they handle shop cash.</li>
        </ol>
        <p className="mt-3 text-xs text-violet-200/70">
          To open a customer (player) account, use{" "}
          <Link href="/admin/users" className="text-violet-200 underline">
            All Users → Create Customer
          </Link>
          .
        </p>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
        <Input
          placeholder="Search agent name or username…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {!agents ? (
        <Spinner />
      ) : agents.length === 0 ? (
        <EmptyState message="No agents yet — create the first agent account above." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Staff login</Th>
              <Th>Customer link</Th>
              <Th>Joined</Th>
              <Th>Status</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {agents.map((u) => (
              <tr key={u.uid}>
                <Td className="font-medium">{u.name}</Td>
                <Td>
                  <Badge value={sharedRoleLabel(u.role)} />
                </Td>
                <Td className="font-mono text-sm text-slate-300">{staffSignInId(u) ?? "—"}</Td>
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
                    <Button
                      variant="secondary"
                      className="!px-2.5 !py-1 text-xs"
                      onClick={() => setResetPasswordUser(u)}
                    >
                      Reset password
                    </Button>
                    <Button
                      variant="secondary"
                      className={`!px-2.5 !py-1 text-xs ${
                        u.cashOpsEnabled ? "text-emerald-200" : "text-sky-200"
                      }`}
                      disabled={busyUid === u.uid}
                      onClick={() => toggleCashOps(u)}
                      title={
                        u.cashOpsEnabled
                          ? "Cash desk is ON — this agent can credit (+ Cash) and pay out (− Cash) customer wallets. Click to turn OFF."
                          : "Turn ON to let this agent credit and withdraw customer cash at the shop (+ Cash / − Cash)."
                      }
                    >
                      {u.cashOpsEnabled ? "✓ Cash desk: ON" : "Enable cash desk"}
                    </Button>
                    <Button
                      variant={u.status === "active" ? "danger" : "secondary"}
                      className="!px-2.5 !py-1 text-xs"
                      disabled={busyUid === u.uid}
                      onClick={() => toggleStatus(u)}
                    >
                      {u.status === "active" ? "Suspend" : "Re-activate"}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <AdminResetPasswordModal
        user={resetPasswordUser}
        onClose={() => setResetPasswordUser(null)}
      />
    </div>
  );
}

export default function AdminAgentsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AdminAgentsContent />
    </Suspense>
  );
}
