"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import type { Gambia9PreviewRow } from "@/lib/api";
import {
  applyGambia9Accounts,
  backupGambia9Accounts,
  previewGambia9Accounts,
  rollbackGambia9Accounts,
} from "@/lib/adminGambia9Client";
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
  const [readyToConfirm, setReadyToConfirm] = useState(false);
  const [applyResult, setApplyResult] = useState("");

  async function runPreview() {
    setBusy("preview");
    try {
      const res = await Promise.race([
        previewGambia9Accounts(),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error("Preview is taking too long. Refresh and try again.")), 90_000);
        }),
      ]);
      setPreview({ scanned: res.scanned, counts: res.counts, samples: res.samples });
      toast.success(`Preview ready — ${res.scanned} accounts scanned. Nothing was changed.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed.");
    } finally {
      setBusy(null);
    }
  }

  async function runBackup() {
    setBusy("backup");
    try {
      const res = await backupGambia9Accounts();
      setBackupId(res.backupId);
      toast.success(`Backup saved (${res.saved} phones). A JSON file also downloaded.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup failed.");
    } finally {
      setBusy(null);
    }
  }

  async function runApply() {
    setBusy("apply");
    try {
      const res = await applyGambia9Accounts(confirm, backupId);
      setApplyResult(`Updated ${res.updated}. Skipped ${res.skipped}. Failed ${res.failed}.`);
      toast.success(`Conversion finished. Updated ${res.updated}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Conversion failed.");
    } finally {
      setBusy(null);
    }
  }

  async function runRollback() {
    setBusy("rollback");
    try {
      const res = await rollbackGambia9Accounts(backupId);
      toast.success(`Rollback restored ${res.restored} numbers.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rollback failed.");
    } finally {
      setBusy(null);
    }
  }

  const nextStep = !preview ? "preview" : !backupId ? "backup" : "review";

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-bold">Phone Number Migration</h1>
      <p className="mb-3 text-sm text-slate-400">
        Official Gambia9 / PURA rules: Africell 87, QCell 83, Comium 86. Gamcel stays 7 digits.
        Already-9-digit numbers are not changed. Opening this page does not convert anyone.
      </p>
      <div className="mb-6 rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-100">
        {nextStep === "preview" ? (
          <>
            <strong>Do this now:</strong> click the green <strong>Preview all accounts</strong> button.
            Wait for the numbers table. That does not change any account.
          </>
        ) : nextStep === "backup" ? (
          <>
            <strong>Do this now:</strong> click the green <strong>Create backup</strong> button.
            A file will download. Keep it. Then scroll to step 3.
          </>
        ) : (
          <>
            Preview and backup are done. Scroll to step 3 only if the numbers look correct.
            Do not convert until you have checked the table.
          </>
        )}
      </div>

      <Card className="mb-5">
        <h2 className="mb-2 font-semibold">1. Preview (safe — no writes)</h2>
        <p className="mb-3 text-sm text-slate-400">
          Reads every account phone. Shows old number, new number, network, and whether it is already
          converted or unsafe.
        </p>
        <Button disabled={busy === "preview"} onClick={() => void runPreview()}>
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
          Downloads a JSON backup of every stored phone to this PC. Keep that file for rollback.
        </p>
        <Button disabled={busy === "backup"} onClick={() => void runBackup()}>
          {busy === "backup" ? "Saving backup…" : "Create backup"}
        </Button>
        {backupId ? <p className="mt-2 text-xs text-emerald-300">Last backup ID: {backupId}</p> : null}
      </Card>

      <Card className="mb-5 border-amber-500/30">
        <h2 className="mb-2 font-semibold">3. Convert accounts</h2>
        <p className="mb-3 text-sm text-slate-400">
          Changes only the phone field and phone lookup. Wallets, bets, deposits, withdrawals, and
          player IDs stay the same.
        </p>
        {!preview || !backupId ? (
          <p className="mb-3 text-sm text-amber-200">
            Locked until you finish step 1 (preview) and step 2 (backup). Scroll up and use the green
            buttons first.
          </p>
        ) : (
          <p className="mb-3 text-sm text-emerald-200">Preview and backup are ready. Convert is optional.</p>
        )}
        <Button
          variant="secondary"
          disabled={busy === "apply" || !preview || !backupId}
          onClick={() => setReadyToConfirm(true)}
        >
          Convert accounts
        </Button>
        {readyToConfirm ? (
          <div className="mt-4 space-y-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
            <p className="text-sm text-amber-100">
              Confirm conversion changes stored Africell / QCell / Comium 7-digit numbers only.
            </p>
            <input
              className="w-full max-w-xs rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
              placeholder="Type CONVERT"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <Button disabled={busy === "apply" || confirm !== "CONVERT" || !backupId} onClick={() => void runApply()}>
              {busy === "apply" ? "Converting…" : "Confirm conversion"}
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="mb-5">
        <h2 className="mb-2 font-semibold">4. Conversion results</h2>
        <p className="text-sm text-slate-400">{applyResult || "No conversion has been run on this visit."}</p>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">5. Rollback / undo</h2>
        <p className="mb-3 text-sm text-slate-400">Restores phones from the backup created in this browser.</p>
        <Button variant="secondary" disabled={busy === "rollback" || !backupId} onClick={() => void runRollback()}>
          {busy === "rollback" ? "Restoring…" : "Rollback last backup"}
        </Button>
      </Card>
    </div>
  );
}
