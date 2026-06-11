"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { Plus, ArrowRightLeft } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { agentCreateSubAgent, agentTransferToSubAgent, errorMessage } from "@/lib/api";
import { formatXof } from "@/lib/format";
import type { UserProfile } from "@/lib/types";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  Spinner,
  TableShell,
  Td,
  Th,
} from "@/components/ui";

type AgentRow = UserProfile & { balance?: number };

export default function SubAgentsPage() {
  const router = useRouter();
  const { fbUser, profile, wallet } = useAuth();
  const [subAgents, setSubAgents] = useState<AgentRow[] | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", username: "", password: "" });
  const [transferTarget, setTransferTarget] = useState<AgentRow | null>(null);
  const [transferAmount, setTransferAmount] = useState("");
  const [busy, setBusy] = useState(false);

  // sub agents are a super-agent feature only
  useEffect(() => {
    if (profile && profile.role !== "super_agent") router.replace("/agent");
  }, [profile, router]);

  useEffect(() => {
    if (!fbUser) return;
    const q = query(
      collection(db, "users"),
      where("role", "==", "sub_agent"),
      where("parentId", "==", fbUser.uid)
    );
    return onSnapshot(q, async (snap) => {
      const rows = snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as AgentRow);
      await Promise.all(
        rows.map(async (r) => {
          try {
            const w = await getDoc(doc(db, "wallets", r.uid));
            r.balance = w.exists() ? (w.data().balance as number) : 0;
          } catch {
            r.balance = undefined;
          }
        })
      );
      setSubAgents(rows.sort((a, b) => (a.name > b.name ? 1 : -1)));
    });
  }, [fbUser]);

  async function createSubAgent() {
    if (!form.name.trim() || !form.email.trim() || !form.username.trim())
      return toast.error("Name, email and username are required.");
    if (form.password.length < 8) return toast.error("Password must be at least 8 characters.");
    setBusy(true);
    try {
      const res = await agentCreateSubAgent({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        username: form.username.trim().toLowerCase(),
        password: form.password,
      });
      toast.success(`Sub agent created — username "${res.slug}".`);
      setCreateOpen(false);
      setForm({ name: "", email: "", username: "", password: "" });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function transfer() {
    if (!transferTarget) return;
    const amt = Number(transferAmount);
    if (!Number.isFinite(amt) || amt <= 0) return toast.error("Enter a valid amount.");
    if (amt > (wallet?.balance ?? 0)) return toast.error("Insufficient balance.");
    setBusy(true);
    try {
      await agentTransferToSubAgent({ subAgentId: transferTarget.uid, amount: amt });
      toast.success(`Transferred ${formatXof(amt)} to ${transferTarget.name}.`);
      setTransferTarget(null);
      setTransferAmount("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Sub Agents</h1>
          <p className="text-sm text-slate-400">
            Your team of marketers. You earn super-agent commission on their customers too.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <span className="flex items-center gap-1.5">
            <Plus size={16} /> Add Sub Agent
          </span>
        </Button>
      </div>

      {!subAgents ? (
        <Spinner />
      ) : subAgents.length === 0 ? (
        <EmptyState message="No sub agents yet. Create one to grow your network." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Username</Th>
              <Th>Email</Th>
              <Th>Balance</Th>
              <Th>Status</Th>
              <Th>Action</Th>
            </tr>
          </thead>
          <tbody>
            {subAgents.map((a) => (
              <tr key={a.uid}>
                <Td className="font-medium">{a.name}</Td>
                <Td className="text-emerald-300">{a.agentSlug}</Td>
                <Td className="text-slate-400">{a.email}</Td>
                <Td className="tabular-nums">
                  {a.balance === undefined ? "—" : formatXof(a.balance)}
                </Td>
                <Td>
                  <Badge value={a.status} />
                </Td>
                <Td>
                  <Button
                    variant="secondary"
                    className="!px-2.5 !py-1 text-xs"
                    onClick={() => setTransferTarget(a)}
                  >
                    <span className="flex items-center gap-1">
                      <ArrowRightLeft size={13} /> Transfer
                    </span>
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add Sub Agent">
        <div className="space-y-4">
          <Input
            label="Full Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Email (used to sign in)"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label="Username (referral code & sign-in)"
            placeholder="victor"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
          />
          <Input
            label="Password (min 8 characters)"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Button className="w-full" onClick={createSubAgent} disabled={busy}>
            {busy ? "Creating…" : "Create Sub Agent"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={!!transferTarget}
        onClose={() => setTransferTarget(null)}
        title={`Transfer to ${transferTarget?.name ?? ""}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Moves credit from your balance ({formatXof(wallet?.balance ?? 0)}) to the sub
            agent&apos;s wallet. Both legs are logged.
          </p>
          <Input
            label="Amount (XOF)"
            type="number"
            min={1}
            value={transferAmount}
            onChange={(e) => setTransferAmount(e.target.value)}
          />
          <Button className="w-full" onClick={transfer} disabled={busy}>
            {busy ? "Transferring…" : "Transfer"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
