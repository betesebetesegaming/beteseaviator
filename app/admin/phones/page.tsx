"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { adminGambia9Migration, errorMessage, type Gambia9PreviewRow } from "@/lib/api";
import { Button, Card } from "@/components/ui";

type Preview = {
  scanned: number;
  counts: Record<string, number>;
  samples: Record<string, Gambia9PreviewRow[]>;
};

function SampleTable({ title, rows }: { title: string; rows: Gambia9PreviewRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="mb-5 overflow-x-auto">
      <h3 className="mb-2 text-sm font-semibold text-slate-200">{title}</h3>
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="text-slate-400">
          <tr>
            <th className="py-1 pr-3">Name</th>
            <th className="py-1 pr-3">Old number</th>
            <th className="py-1 pr-3">New number</th>
            <th className="py-1 pr-3">Network</th>
            <th className="py-1 pr-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.uid}-${row.oldNumber}`} className="border-t border-white/5">
              <td className="py-1.5 pr-3">{row.name || row.uid.slice(0, 8)}</td>
              <td className="py-1.5 pr-3 font-mono">{row.oldNumber || "—"}</td>
              <td className="py-1.5 pr-3 font-mono">{row.newNumber || "—"}</td>
              <td className="py-1.5 pr-3">{row.network}</td>
              <td className="py-1.5 pr-3 text-slate-400">{row.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminPhoneMigrationPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [backupId, setBackupId] = useState("");
  const [confirm, setConfirm] = useState("");
  const [applyResult, setApplyResult] = useState<string>("");

  async function run(action: "preview" | "backup" | "apply" | "rollback") {
    setBusy(action);
    setApplyResult("");
    try {
      const res = await adminGambia9Migration({
        action,
        confirm: action === "apply" ? confirm : undefined,
        backupId: action === "apply" || action === "rollback" ? backupId : undefined,
      });
      if (action === "preview") {
        setPreview({
          scanned: Number(res.scanned ?? 0),
          counts: res.counts ?? {},
          samples: res.samples ?? {},
        });
        toast.success(`Preview ready — ${res.scanned ?? 0} accounts scanned. Nothing was changed.`);
      } else if (action === "backup") {
        setBackupId(String(res.backupId ?? ""));
        toast.success(`Backup saved (${res.saved ?? 0} phones). ID: ${res.backupId}`);
      } else if (action === "apply") {
        setApplyResult(
          `Updated ${res.updated ?? 0}. Skipped ${res.skipped ?? 0}. Failed ${res.failed ?? 0}.`,
        );
        toast.success(`Conversion finished. Updated ${res.updated ?? 0}.`);
      } else {
        toast.success(`Rollback restored ${res.restored ?? 0} numbers.`);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-bold">Phone Number Migration</h1>
      <p className="mb-6 text-sm text-slate-400">
        Official Gambia9 / PURA rules: Africell 87, QCell 83, Comium 86. Gamcel stays 7 digits.
        Already-9-digit numbers are not changed. This page does not convert anyone until you type
        CONVERT after a backup.
      </p>

      <Card className="mb-5">
        <h2 className="mb-2 font-semibold">1. Preview (safe — no writes)</h2>
        <p className="mb-3 text-sm text-slate-400">
          Scans every <code>users/{"{uid}"}</code> phone. Shows old number, new number, network, and
          whether it is already converted or unsafe.
        </p>
        <Button disabled={busy !== null} onClick={() => void run("preview")}>
          {busy === "preview" ? "Scanning…" : "Preview all accounts"}
        </Button>
        {preview ? (
          <div className="mt-4 space-y-2 text-sm">
            <p>
              Scanned <strong>{preview.scanned}</strong>. Convert{" "}
              <strong>{preview.counts.convert ?? 0}</strong>. Already 9-digit{" "}
              <strong>{preview.counts.already_converted ?? 0}</strong>. Gamcel unchanged{" "}
              <strong>{preview.counts.gamcel_unchanged ?? 0}</strong>. Unsafe{" "}
              <strong>{preview.counts.unsafe ?? 0}</strong>. Empty{" "}
              <strong>{preview.counts.empty ?? 0}</strong>.
            </p>
            <SampleTable title="Will convert" rows={preview.samples.convert ?? []} />
            <SampleTable title="Already 9 digits" rows={preview.samples.already_converted ?? []} />
            <SampleTable title="Gamcel unchanged" rows={preview.samples.gamcel_unchanged ?? []} />
            <SampleTable title="Cannot convert safely" rows={preview.samples.unsafe ?? []} />
          </div>
        ) : null}
      </Card>

      <Card className="mb-5">
        <h2 className="mb-2 font-semibold">2. Backup</h2>
        <p className="mb-3 text-sm text-slate-400">
          Copies every stored phone (and Firebase Auth email) to{" "}
          <code>gambia9_phone_backups</code> before any convert. Needed for rollback.
        </p>
        <Button variant="secondary" disabled={busy !== null} onClick={() => void run("backup")}>
          {busy === "backup" ? "Saving backup…" : "Create backup"}
        </Button>
        {backupId ? <p className="mt-2 text-xs text-emerald-300">Last backup ID: {backupId}</p> : null}
      </Card>

      <Card className="mb-5 border-amber-500/30">
        <h2 className="mb-2 font-semibold">3. Convert (only after you approve)</h2>
        <p className="mb-3 text-sm text-slate-400">
          Updates <code>users.phone</code> and the <code>phones/</code> lookup index only. Does not
          touch wallets, bets, deposits, withdrawals, or player IDs. Old 7-digit login still works
          through aliases. Type CONVERT to enable.
        </p>
        <input
          className="mb-3 w-full max-w-xs rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
          placeholder="Type CONVERT"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Button
          disabled={busy !== null || confirm !== "CONVERT" || !backupId}
          onClick={() => void run("apply")}
        >
          {busy === "apply" ? "Converting…" : "Convert approved accounts"}
        </Button>
        {applyResult ? <p className="mt-2 text-sm text-emerald-300">{applyResult}</p> : null}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">4. Rollback</h2>
        <p className="mb-3 text-sm text-slate-400">Restores phones and auth emails from the last backup ID.</p>
        <Button variant="secondary" disabled={busy !== null || !backupId} onClick={() => void run("rollback")}>
          {busy === "rollback" ? "Restoring…" : "Rollback last backup"}
        </Button>
      </Card>
    </div>
  );
}
