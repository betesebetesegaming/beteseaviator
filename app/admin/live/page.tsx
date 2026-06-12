"use client";

import { useEffect, useMemo, useState } from "react";
import { onValue, ref } from "firebase/database";
import { Users, Radio } from "lucide-react";
import { rtdb } from "@/lib/firebase";
import { formatDate } from "@/lib/format";
import type { Role } from "@/lib/types";
import { Badge, Card, EmptyState, TableShell, Td, Th } from "@/components/ui";

type PresenceRow = {
  uid: string;
  name: string;
  role: Role;
  page: string;
  lastSeen: number;
};

const ONLINE_MS = 3 * 60 * 1000;

function roleLabel(role: Role) {
  switch (role) {
    case "player":
      return "Customer";
    case "super_agent":
      return "Super agent";
    case "sub_agent":
      return "Sub agent";
    case "admin":
      return "Admin";
    default:
      return role;
  }
}

export default function AdminLivePage() {
  const [rows, setRows] = useState<PresenceRow[]>([]);

  useEffect(() => {
    return onValue(ref(rtdb, "presence"), (snap) => {
      const val = snap.val() as Record<string, Record<string, unknown>> | null;
      if (!val) {
        setRows([]);
        return;
      }
      const next: PresenceRow[] = Object.entries(val).map(([uid, data]) => ({
        uid,
        name: String(data.name ?? "Unknown"),
        role: String(data.role ?? "player") as Role,
        page: String(data.page ?? "/"),
        lastSeen: Number(data.lastSeen ?? 0),
      }));
      next.sort((a, b) => b.lastSeen - a.lastSeen);
      setRows(next);
    });
  }, []);

  const now = Date.now();
  const online = useMemo(
    () => rows.filter((r) => now - r.lastSeen <= ONLINE_MS),
    [rows, now]
  );
  const byRole = useMemo(() => {
    const counts: Partial<Record<Role, number>> = {};
    for (const r of online) counts[r.role] = (counts[r.role] ?? 0) + 1;
    return counts;
  }, [online]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Live users</h1>
        <p className="mt-1 text-sm text-slate-400">
          Anyone active in the last 3 minutes. Updates automatically.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs uppercase text-slate-500">Online now</p>
          <p className="mt-1 text-2xl font-bold text-emerald-300">{online.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-slate-500">Customers</p>
          <p className="mt-1 text-2xl font-bold">{byRole.player ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-slate-500">Agents</p>
          <p className="mt-1 text-2xl font-bold">
            {(byRole.super_agent ?? 0) + (byRole.sub_agent ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-slate-500">Admins</p>
          <p className="mt-1 text-2xl font-bold">{byRole.admin ?? 0}</p>
        </Card>
      </div>

      {online.length === 0 ? (
        <EmptyState message="No one is online right now." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>User</Th>
              <Th>Role</Th>
              <Th>Page</Th>
              <Th>Last seen</Th>
            </tr>
          </thead>
          <tbody>
            {online.map((r) => (
              <tr key={r.uid}>
                <Td>
                  <span className="flex items-center gap-2 font-medium text-white">
                    <Radio size={14} className="text-emerald-400" />
                    {r.name}
                  </span>
                </Td>
                <Td>
                  <Badge value={r.role} />
                </Td>
                <Td className="font-mono text-xs text-slate-400">{r.page}</Td>
                <Td className="text-xs text-slate-400">{formatDate(new Date(r.lastSeen))}</Td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      {rows.length > online.length && (
        <Card className="p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Users size={16} /> Recently seen (offline)
          </p>
          <div className="space-y-2 text-xs text-slate-500">
            {rows
              .filter((r) => now - r.lastSeen > ONLINE_MS)
              .slice(0, 15)
              .map((r) => (
                <div key={r.uid} className="flex justify-between gap-2 border-b border-white/5 pb-2">
                  <span>
                    {r.name} · {roleLabel(r.role)}
                  </span>
                  <span>{formatDate(new Date(r.lastSeen))}</span>
                </div>
              ))}
          </div>
        </Card>
      )}
    </div>
  );
}
