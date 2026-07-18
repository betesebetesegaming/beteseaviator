"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { doc, onSnapshot } from "firebase/firestore";
import { CheckCircle2, Circle, Copy, RefreshCw } from "lucide-react";
import { db } from "@/lib/firestore";
import {
  adminAddQTechGame,
  adminDeleteGame,
  adminGetQTechSetup,
  adminPreviewQTechGame,
  adminRunQTechCwTest,
  adminSaveQTechSettings,
  adminSeedQTechGames,
  adminSyncQTechGameImages,
  adminSetGameStatus,
  errorMessage,
  type QTechCwTestResult,
  type QTechSetupStatus,
} from "@/lib/api";
import { DEFAULT_SETTINGS, type PlatformSettings, type QTechSettings } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Input, Spinner } from "@/components/ui";

type GameDraft = { qtechGameId: string; rtp: string };

function copyText(text: string, label: string) {
  void navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

function generatePassKey(): string {
  return crypto.randomUUID();
}

const HANDOVER_FIELDS: Array<{ label: string; value: (walletUrl: string, passKey: string) => string }> = [
  { label: "Client company", value: () => "BETESE" },
  { label: "Brand URL", value: () => "https://www.beteseaviator.com/play" },
  { label: "Brand name", value: () => "BETESE Aviator" },
  { label: "Language", value: () => "English (en_GM)" },
  { label: "Currency", value: () => "GMD" },
  { label: "Target market", value: () => "Gambia" },
  { label: "Hosting", value: () => "Google Cloud Firebase (us-central1)" },
  { label: "API type", value: () => "Common Wallet" },
  {
    label: "Wallet URL (staging + prod)",
    value: (walletUrl) => walletUrl || "(deploy qtcwApi first)",
  },
  {
    label: "Pass-Key (staging + prod)",
    value: (_, passKey) => passKey || "(generate below, then save)",
  },
  {
    label: "Rewards URL",
    value: (walletUrl) => (walletUrl ? `${walletUrl}/bonus/reward` : ""),
  },
];

function StatusRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
      ) : (
        <Circle size={16} className="shrink-0 text-slate-500" />
      )}
      <span className={ok ? "text-slate-200" : "text-slate-400"}>{label}</span>
    </li>
  );
}

import { LobbyGamesSection } from "@/components/admin/LobbyGamesSection";
import { LobbyOrderEditor } from "@/components/admin/LobbyOrderEditor";

export default function AdminQTechPage() {
  const [qtech, setQtech] = useState<QTechSettings>(DEFAULT_SETTINGS.qtech!);
  const [status, setStatus] = useState<QTechSetupStatus | null>(null);
  const [drafts, setDrafts] = useState<Record<string, GameDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingCreds, setSavingCreds] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [syncingImages, setSyncingImages] = useState(false);
  const [busyGameId, setBusyGameId] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<{
    qtechGameId: string;
    name: string;
    lobbyCategory: "aviator" | "crash" | "instantwin";
    rtp: string;
  }>({ qtechGameId: "", name: "", lobbyCategory: "crash", rtp: "97" });
  const [adding, setAdding] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [cwTesting, setCwTesting] = useState(false);
  const [cwResult, setCwResult] = useState<QTechCwTestResult | null>(null);
  const [testPlayerUid, setTestPlayerUid] = useState("");

  const refreshStatus = useCallback(async () => {
    try {
      const res = await adminGetQTechSetup({});
      setStatus(res);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const g of res.games) {
          if (!next[g.id]) {
            next[g.id] = { qtechGameId: g.qtechGameId, rtp: "97" };
          }
        }
        return next;
      });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "platform"), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as PlatformSettings;
        setQtech({ ...DEFAULT_SETTINGS.qtech!, ...(data.qtech ?? {}) });
      }
      setLoading(false);
    });
    void refreshStatus();
    return unsub;
  }, [refreshStatus]);

  async function saveCredentials() {
    setSavingCreds(true);
    try {
      const res = await adminSaveQTechSettings({ qtech: { ...qtech } });
      setStatus(res);
      toast.success("QTech credentials saved.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSavingCreds(false);
    }
  }

  async function seedGames() {
    setSeeding(true);
    try {
      const res = await adminSeedQTechGames({});
      setStatus(res);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const g of res.games) {
          next[g.id] = { qtechGameId: g.qtechGameId, rtp: prev[g.id]?.rtp ?? "97" };
        }
        return next;
      });
      const synced = res.imageSync?.updated?.length ?? 0;
      toast.success(
        synced > 0
          ? `Lobby games ready — ${synced} thumbnail${synced === 1 ? "" : "s"} synced from QTech.`
          : "Lobby games ready.",
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSeeding(false);
    }
  }

  async function syncThumbnails() {
    setSyncingImages(true);
    try {
      const res = await adminSyncQTechGameImages({});
      setStatus(res);
      const { updated, missing } = res.imageSync;
      if (updated.length === 0 && missing.length > 0) {
        toast.error(`No thumbnails found — check API credentials and game IDs (${missing.join(", ")}).`);
      } else if (updated.length === 0) {
        toast.success("Thumbnails already up to date.");
      } else {
        toast.success(`Synced ${updated.length} game thumbnail${updated.length === 1 ? "" : "s"} from QTech.`);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSyncingImages(false);
    }
  }

  async function saveGame(gameId: string) {
    const draft = drafts[gameId];
    if (!draft) return;
    setBusyGameId(gameId);
    try {
      await adminSetGameStatus({
        gameId,
        qtechGameId: draft.qtechGameId.trim(),
        rtp: Number(draft.rtp),
      });
      await refreshStatus();
      toast.success("Game settings saved.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyGameId(null);
    }
  }

  async function toggleGame(gameId: string, current: string) {
    const draft = drafts[gameId];
    if (current !== "active" && !draft?.qtechGameId.trim()) {
      return toast.error("Enter the QTech catalog game ID first.");
    }
    setBusyGameId(gameId);
    try {
      await adminSetGameStatus({
        gameId,
        status: current === "active" ? "inactive" : "active",
      });
      await refreshStatus();
      toast.success(`Game ${current === "active" ? "deactivated" : "activated"} on /play.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyGameId(null);
    }
  }

  async function addGame() {
    const qtechGameId = addForm.qtechGameId.trim();
    const name = addForm.name.trim();
    const lobbyCategory = addForm.lobbyCategory;
    if (!qtechGameId || !name) {
      return toast.error("Enter the QTech game ID and a display name.");
    }
    setAdding(true);
    try {
      const res = await adminAddQTechGame({
        qtechGameId,
        name,
        lobbyCategory,
        rtp: Number(addForm.rtp) || 97,
      });
      setStatus(res);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const g of res.games) {
          next[g.id] = next[g.id] ?? { qtechGameId: g.qtechGameId, rtp: "97" };
        }
        return next;
      });
      setAddForm((f) => ({ qtechGameId: "", name: "", lobbyCategory: f.lobbyCategory, rtp: "97" }));
      const tab =
        { aviator: "Aviator", crash: "Crash", instantwin: "Instant Win" }[lobbyCategory] ?? lobbyCategory;
      toast.success(`${name} is now LIVE on the ${tab} tab — open /play and check that tab.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setAdding(false);
    }
  }

  async function previewGame(qtechGameId: string) {
    const id = qtechGameId.trim();
    if (!id) return toast.error("Enter a QTech game ID to preview.");
    if (!status?.launchReady) {
      const missing = status?.missing?.length ? status.missing.join(" · ") : "API credentials in section 4";
      return toast.error(`Complete launch setup first: ${missing}`);
    }
    setPreviewing(true);
    try {
      const res = await adminPreviewQTechGame({ qtechGameId: id, device: "desktop" });
      setPreviewUrl(res.launchUrl);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPreviewing(false);
    }
  }

  async function removeGame(gameId: string, name: string) {
    if (!window.confirm(`Remove "${name}" from the dashboard? This permanently deletes it.`)) return;
    setBusyGameId(gameId);
    try {
      await adminDeleteGame({ gameId });
      await refreshStatus();
      toast.success(`${name} removed.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyGameId(null);
    }
  }

  if (loading && !status) {
    return <Spinner label="Loading QTech setup…" />;
  }

  const walletUrl = status?.walletUrl ?? "";
  const qtechGames = status?.games ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">QTech &amp; Games</h1>
          <p className="mt-1 text-sm text-slate-400">
            Add QTech credentials, enable Aviator &amp; Crash on the player lobby.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => void refreshStatus()}>
            <RefreshCw size={14} className="mr-1.5 inline" />
            Refresh status
          </Button>
          <Button
            className="px-3 py-1.5 text-xs"
            onClick={() => void seedGames()}
            disabled={seeding}
            title="Adds missing games only — does not re-activate hidden games or overwrite your names/images."
          >
            {seeding ? "Creating…" : "Restore lobby games"}
          </Button>
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            onClick={() => void syncThumbnails()}
            disabled={syncingImages || !status?.launchReady}
          >
            {syncingImages ? "Syncing…" : "Sync QTech thumbnails"}
          </Button>
        </div>
      </div>

      <LobbyOrderEditor />

      {/* Environment banner — prevents accidental INT launches after production cutover */}
      {status?.environment === "production" ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          <strong className="font-semibold">Production API active.</strong>{" "}
          Games launch on real QTech hosts ({status.apiBaseUrl || "api.qtplatform.com"}
          {status.operatorId ? ` · ${status.operatorId}` : ""}). Real-money bets apply when signed in.
        </div>
      ) : status?.environment === "integration" ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <strong className="font-semibold">Integration (INT) API — not production.</strong>{" "}
          SmartSoft titles can load slowly or stick on splash. Switch API base URL to{" "}
          <code className="text-xs">https://api.qtplatform.com</code> and use production operator
          credentials when ready.
        </div>
      ) : null}

      {/* Section 1 — Setup checklist */}
      <Card>
        <h2 className="mb-3 font-semibold">1. Setup checklist</h2>
        <ul className="space-y-2">
          <StatusRow ok={Boolean(status?.walletReady)} label="Wallet Pass-Key configured" />
          <StatusRow ok={Boolean(status?.integrationEnabled)} label="Game launch enabled" />
          <StatusRow ok={Boolean(status?.launchReady)} label="Operator API credentials complete" />
          <StatusRow
            ok={status?.environment === "production"}
            label={
              status?.environment === "production"
                ? "Production API (api.qtplatform.com)"
                : status?.environment === "integration"
                  ? "Still on Integration API (api-int) — switch for live players"
                  : "QTech environment unknown — reload status"
            }
          />
          {qtechGames.map((g) => (
            <StatusRow
              key={g.id}
              ok={g.ready}
              label={`${g.name} live on /play${g.qtechGameId ? ` (${g.qtechGameId})` : ""}`}
            />
          ))}
        </ul>
        {status?.missing && status.missing.length > 0 && (
          <p className="mt-3 text-xs text-amber-200">
            Still needed: {status.missing.join(" · ")}
          </p>
        )}
      </Card>

      {/* Handover — values to email QTech */}
      <Card>
        <h2 className="mb-1 font-semibold">2. Handover to QTech</h2>
        <p className="mb-4 text-sm text-slate-400">
          Copy these into the QTech handover Excel and send to your account manager. When they reply
          with API URL, operator login, and game IDs, enter them in sections 3–5 below.
        </p>
        <div className="space-y-2">
          {HANDOVER_FIELDS.map(({ label, value }) => {
            const text = value(walletUrl, qtech.passKey ?? "");
            return (
              <div
                key={label}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-white/5 bg-slate-950/40 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="break-all text-sm text-slate-200">{text || "—"}</p>
                </div>
                {text ? (
                  <button
                    type="button"
                    className="shrink-0 rounded bg-slate-800 p-1.5 text-slate-300 hover:text-white"
                    onClick={() => copyText(text, label)}
                  >
                    <Copy size={14} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            onClick={() => {
              const block = HANDOVER_FIELDS.map(({ label, value }) => {
                const text = value(walletUrl, qtech.passKey ?? "");
                return `${label}: ${text}`;
              }).join("\n");
              copyText(block, "Full handover");
            }}
          >
            Copy all fields
          </Button>
          <Button
            variant="secondary"
            className="px-3 py-1.5 text-xs"
            onClick={() => {
              const key = generatePassKey();
              setQtech({ ...qtech, passKey: key });
              toast.success("Pass-Key generated — click Save wallet credentials");
            }}
          >
            Generate Pass-Key
          </Button>
        </div>
      </Card>

      {/* Section 3 — Wallet API (give URL to QTech) */}
      <Card>
        <h2 className="mb-1 font-semibold">3. Wallet API — credentials</h2>
        <p className="mb-4 text-sm text-slate-400">
          QTech calls this URL for balance, bets, wins &amp; rollbacks. Send them the wallet URL and
          your Pass-Key (they share the same secret with you).
        </p>
        <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="mb-1 text-xs uppercase tracking-wider text-slate-500">Wallet URL for QTech</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all text-xs text-emerald-300">{walletUrl || "Deploy qtcwApi first"}</code>
            {walletUrl ? (
              <button
                type="button"
                className="rounded bg-slate-800 p-1.5 text-slate-300 hover:text-white"
                onClick={() => copyText(walletUrl, "Wallet URL")}
              >
                <Copy size={14} />
              </button>
            ) : null}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Pass-Key (shared secret)"
            type="password"
            autoComplete="off"
            value={qtech.passKey ?? ""}
            onChange={(e) => setQtech({ ...qtech, passKey: e.target.value })}
          />
          <Input
            label="Wallet currency"
            value={qtech.currency ?? "GMD"}
            onChange={(e) => setQtech({ ...qtech, currency: e.target.value.toUpperCase() })}
          />
        </div>
        <Button className="mt-4 w-full sm:w-auto" onClick={() => void saveCredentials()} disabled={savingCreds}>
          {savingCreds ? "Saving…" : "Save wallet credentials"}
        </Button>
      </Card>

      {/* Section 4 — Launch API */}
      <Card>
        <h2 className="mb-1 font-semibold">4. Game launch — operator API</h2>
        <p className="mb-4 text-sm text-slate-400">
          Calls QTech <code className="text-xs">POST /v1/games/&#123;gameId&#125;/launch-url</code> with{" "}
          <code className="text-xs">walletSessionId</code> (Common Wallet API v2.53). Auth:{" "}
          <code className="text-xs">GET /v1/auth/token</code>.
        </p>
        <label className="mb-4 flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            className="h-4 w-4 accent-emerald-500"
            checked={qtech.enabled === true}
            onChange={(e) => setQtech({ ...qtech, enabled: e.target.checked })}
          />
          Enable QTech game launch for players
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="QTech API base URL"
            placeholder="https://api.qtplatform.com"
            className="sm:col-span-2"
            value={qtech.apiBaseUrl ?? ""}
            onChange={(e) => setQtech({ ...qtech, apiBaseUrl: e.target.value })}
          />
          {/api-int|int\.qtplatform/i.test(String(qtech.apiBaseUrl ?? "")) ? (
            <p className="sm:col-span-2 text-xs text-amber-200">
              This URL is Integration (sandbox). Production is{" "}
              <code className="text-[11px]">https://api.qtplatform.com</code>.
            </p>
          ) : null}
          <Input
            label="Operator ID (API Username)"
            placeholder="api_BETESEAviator"
            value={qtech.operatorId ?? ""}
            onChange={(e) => setQtech({ ...qtech, operatorId: e.target.value })}
          />
          <Input
            label="API password"
            type="password"
            autoComplete="off"
            value={qtech.apiPassword ?? ""}
            onChange={(e) => setQtech({ ...qtech, apiPassword: e.target.value })}
          />
          <Input
            label="Lobby return URL"
            className="sm:col-span-2"
            value={qtech.lobbyUrl ?? "https://www.beteseaviator.com/play"}
            onChange={(e) => setQtech({ ...qtech, lobbyUrl: e.target.value })}
          />
          <Input
            label="Country code (GM)"
            value={qtech.country ?? "GM"}
            onChange={(e) => setQtech({ ...qtech, country: e.target.value.toUpperCase() })}
          />
          <Input
            label="Language (en_GM)"
            value={qtech.lang ?? "en_GM"}
            onChange={(e) => setQtech({ ...qtech, lang: e.target.value })}
          />
        </div>
        <Button className="mt-4 w-full sm:w-auto" onClick={() => void saveCredentials()} disabled={savingCreds}>
          {savingCreds ? "Saving…" : "Save launch credentials"}
        </Button>
      </Card>

      {/* Section 5 — Enable games */}
      <Card>
        <h2 className="mb-1 font-semibold">5. Enable games on /play</h2>
        <p className="mb-4 text-sm text-slate-400">
          Copy the <strong>Game ID</strong> from{" "}
          <a
            href="https://bo-int.qtplatform.com/client/main.html#/operator-games"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 underline"
          >
            QTech operator games
          </a>
          , add it here, upload a thumbnail in section 6, and enter API credentials in section 4.
        </p>

        {/* Add a QTech game by catalog ID */}
        <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="mb-3 text-sm font-semibold text-emerald-200">Add a QTech game</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="QTech game ID"
              placeholder="e.g. SPB-aviator"
              value={addForm.qtechGameId}
              onChange={(e) => setAddForm((f) => ({ ...f, qtechGameId: e.target.value }))}
            />
            <Input
              label="Display name"
              placeholder="e.g. Aviator"
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
            />
            <label className="block text-sm">
              <span className="mb-1 block text-slate-400">Lobby tab</span>
              <select
                className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                value={addForm.lobbyCategory}
                onChange={(e) =>
                  setAddForm((f) => ({
                    ...f,
                    lobbyCategory: e.target.value as "aviator" | "crash" | "instantwin",
                  }))
                }
              >
                <option value="aviator">Aviator</option>
                <option value="crash">Crash</option>
                <option value="instantwin">Instant Win</option>
              </select>
            </label>
            <Input
              label="Display RTP %"
              type="number"
              value={addForm.rtp}
              onChange={(e) => setAddForm((f) => ({ ...f, rtp: e.target.value }))}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button className="px-3 py-1.5 text-xs" onClick={() => void addGame()} disabled={adding}>
              {adding ? "Adding…" : "Add game"}
            </Button>
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              onClick={() => void previewGame(addForm.qtechGameId)}
              disabled={previewing}
            >
              {previewing ? "Loading…" : "Preview (demo)"}
            </Button>
          </div>
        </div>

        {qtechGames.length === 0 ? (
          <EmptyState message='Click "Create game entries" above to add Aviator and Crash.' />
        ) : (
          <div className="space-y-4">
            {qtechGames.map((game) => {
              const draft = drafts[game.id] ?? { qtechGameId: game.qtechGameId, rtp: "97" };
              return (
                <div
                  key={game.id}
                  className="rounded-xl border border-white/10 bg-slate-950/50 p-4"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{game.name}</p>
                      <p className="text-xs text-slate-500">
                        {game.id} · {game.lobbyCategory} tab
                      </p>
                    </div>
                    <Badge value={game.status} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="QTech catalog game ID"
                      placeholder="From QTech sandbox / production"
                      value={draft.qtechGameId}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [game.id]: { ...draft, qtechGameId: e.target.value },
                        }))
                      }
                    />
                    <Input
                      label="Display RTP %"
                      type="number"
                      value={draft.rtp}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [game.id]: { ...draft, rtp: e.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      disabled={busyGameId === game.id}
                      onClick={() => void saveGame(game.id)}
                    >
                      Save
                    </Button>
                    <Button
                      className="px-3 py-1.5 text-xs"
                      disabled={busyGameId === game.id}
                      onClick={() => void toggleGame(game.id, game.status)}
                    >
                      {game.status === "active" ? "Deactivate" : "Activate on lobby"}
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      disabled={previewing}
                      onClick={() => void previewGame(draft.qtechGameId || game.qtechGameId)}
                    >
                      Preview
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs text-rose-300 hover:text-rose-200"
                      disabled={busyGameId === game.id}
                      onClick={() => void removeGame(game.id, game.name)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Section 6 — Native games */}
      <LobbyGamesSection busyGameId={busyGameId} setBusyGameId={setBusyGameId} onRefresh={refreshStatus} />

      <Card>
        <h2 className="mb-2 font-semibold">7. Game thumbnails</h2>
        <p className="text-sm text-slate-400">
          Thumbnails are pulled from the QTech Game List API (<code className="text-xs">GET /v2/games</code>)
          using banner / logo assets hosted on QTech CDN. Requires launch credentials in section 4.
        </p>
        <Button
          className="mt-3 px-3 py-1.5 text-xs"
          variant="secondary"
          onClick={() => void syncThumbnails()}
          disabled={syncingImages || !status?.launchReady}
        >
          {syncingImages ? "Syncing…" : "Sync all thumbnails from QTech"}
        </Button>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">8. Common Wallet certification</h2>
        <p className="text-sm text-slate-400">
          Before real game launches, run the Common Wallet test suite. It checks session verification,
          balance, bet (withdrawal), payout (deposit), rollback, reward, and idempotency against your live{" "}
          <code className="text-xs text-slate-300">qtcwApi</code> deployment.
        </p>
        <ul className="mt-3 list-inside list-disc text-xs text-slate-500">
          <li>Pass-Key must be saved in section 3 above.</li>
          <li>Uses a player wallet with at least 200 GMD playable balance (cash + bonus).</li>
          <li>Test amount defaults to 10 GMD per bet — real money moves on the test player.</li>
        </ul>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Input
            label="Test player UID (optional)"
            placeholder="Auto-pick highest-balance player"
            value={testPlayerUid}
            onChange={(e) => setTestPlayerUid(e.target.value)}
          />
        </div>
        <Button
          className="mt-4"
          onClick={async () => {
            if (!status?.walletReady) {
              toast.error("Save your Pass-Key in section 3 first.");
              return;
            }
            setCwTesting(true);
            setCwResult(null);
            try {
              const res = await adminRunQTechCwTest({
                playerUid: testPlayerUid.trim() || undefined,
              });
              setCwResult(res);
              if (res.ok) {
                toast.success(`Common Wallet tests passed in ${Math.round(res.durationMs / 1000)}s`);
              } else {
                toast.error(res.error || "Common Wallet tests failed");
              }
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setCwTesting(false);
            }
          }}
          disabled={cwTesting || !status?.walletReady}
        >
          {cwTesting ? "Running CW tests…" : "Run Common Wallet tests"}
        </Button>
        {cwResult && (
          <div
            className={`mt-4 rounded-lg border p-3 text-sm ${
              cwResult.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                : "border-red-500/30 bg-red-500/10 text-red-100"
            }`}
          >
            <p className="font-semibold">
              {cwResult.ok ? "All Common Wallet tests passed" : "Common Wallet tests failed"}
            </p>
            {cwResult.error && <p className="mt-1 text-xs opacity-90">{cwResult.error}</p>}
            <p className="mt-2 text-xs text-slate-400">
              Player: <code className="text-slate-300">{cwResult.playerId}</code> ·{" "}
              {Math.round(cwResult.durationMs / 1000)}s
            </p>
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-xs">
              {cwResult.steps.map((step) => (
                <li key={step.name} className={step.ok ? "text-emerald-300" : "text-red-300"}>
                  {step.ok ? "✓" : "✗"} {step.name}
                  {step.detail ? ` — ${step.detail}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-4 text-xs text-slate-500">
          Official QTech script:{" "}
          <code className="text-slate-400">docs/qtech/cw_qtcw_tester.py all</code> — see{" "}
          <code className="text-slate-400">docs/qtech/README.txt</code>.
        </p>
      </Card>

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="relative h-[80vh] w-full max-w-4xl overflow-hidden rounded-xl border border-white/10 bg-black"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 bg-slate-900 px-3 py-2">
              <span className="text-xs font-semibold text-slate-300">Game preview (demo mode)</span>
              <button
                type="button"
                className="rounded bg-slate-800 px-3 py-1 text-xs text-white hover:bg-slate-700"
                onClick={() => setPreviewUrl(null)}
              >
                Close ✕
              </button>
            </div>
            <iframe src={previewUrl} className="h-[calc(80vh-2.5rem)] w-full" title="Game preview" />
          </div>
        </div>
      )}
    </div>
  );
}
