"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { doc, onSnapshot, getDoc } from "firebase/firestore";
import Link from "next/link";
import { CheckCircle2, Circle, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { db } from "@/lib/firestore";
import {
  adminGetQTechSetup,
  adminSaveQTechSettings,
  adminSeedQTechGames,
  adminSetGameStatus,
  errorMessage,
  type QTechSetupStatus,
} from "@/lib/api";
import { DEFAULT_SETTINGS, type PlatformSettings, type QTechSettings, type Game } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Input, Spinner } from "@/components/ui";

type GameDraft = { qtechGameId: string; rtp: string };

function copyText(text: string, label: string) {
  void navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

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

const NATIVE_GAME_IDS = ["aviator", "aviator-turbo"] as const;

function NativeGamesSection({
  busyGameId,
  setBusyGameId,
  onRefresh,
}: {
  busyGameId: string | null;
  setBusyGameId: (id: string | null) => void;
  onRefresh: () => Promise<void>;
}) {
  const [native, setNative] = useState<Game[]>([]);

  useEffect(() => {
    void (async () => {
      const rows: Game[] = [];
      for (const id of NATIVE_GAME_IDS) {
        const snap = await getDoc(doc(db, "games", id));
        if (snap.exists()) rows.push({ id: snap.id, ...snap.data() } as Game);
      }
      setNative(rows);
    })();
  }, [busyGameId]);

  async function toggle(game: Game) {
    setBusyGameId(game.id);
    try {
      await adminSetGameStatus({
        gameId: game.id,
        status: game.status === "active" ? "inactive" : "active",
      });
      await onRefresh();
      toast.success(`${game.name} ${game.status === "active" ? "deactivated" : "activated"}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyGameId(null);
    }
  }

  return (
    <Card>
      <h2 className="mb-1 font-semibold">5. Native BETESE games</h2>
      <p className="mb-4 text-sm text-slate-400">
        Built-in crash engine. Deactivate these when QTech versions are live to avoid duplicate
        Aviator entries on the lobby.
      </p>
      {native.length === 0 ? (
        <p className="text-sm text-slate-500">Native games not seeded yet.</p>
      ) : (
        <div className="space-y-2">
          {native.map((game) => (
            <div
              key={game.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2"
            >
              <div>
                <span className="text-sm font-medium">{game.name}</span>
                <span className="ml-2 text-xs text-slate-500">{game.id}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge value={game.status} />
                <Button
                  variant="secondary"
                  className="px-3 py-1.5 text-xs"
                  disabled={busyGameId === game.id}
                  onClick={() => void toggle(game)}
                >
                  {game.status === "active" ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function AdminQTechPage() {
  const [qtech, setQtech] = useState<QTechSettings>(DEFAULT_SETTINGS.qtech!);
  const [status, setStatus] = useState<QTechSetupStatus | null>(null);
  const [drafts, setDrafts] = useState<Record<string, GameDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingCreds, setSavingCreds] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [busyGameId, setBusyGameId] = useState<string | null>(null);

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
      toast.success("Aviator & Crash game entries are ready.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSeeding(false);
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
          <Button className="px-3 py-1.5 text-xs" onClick={() => void seedGames()} disabled={seeding}>
            {seeding ? "Creating…" : "Create game entries"}
          </Button>
        </div>
      </div>

      {/* Section 1 — Setup checklist */}
      <Card>
        <h2 className="mb-3 font-semibold">1. Setup checklist</h2>
        <ul className="space-y-2">
          <StatusRow ok={Boolean(status?.walletReady)} label="Wallet Pass-Key configured" />
          <StatusRow ok={Boolean(status?.integrationEnabled)} label="Game launch enabled" />
          <StatusRow ok={Boolean(status?.launchReady)} label="Operator API credentials complete" />
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

      {/* Section 2 — Wallet API (give URL to QTech) */}
      <Card>
        <h2 className="mb-1 font-semibold">2. Wallet API — credentials</h2>
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

      {/* Section 3 — Launch API */}
      <Card>
        <h2 className="mb-1 font-semibold">3. Game launch — operator API</h2>
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
            placeholder="https://api-int.qtech.com"
            className="sm:col-span-2"
            value={qtech.apiBaseUrl ?? ""}
            onChange={(e) => setQtech({ ...qtech, apiBaseUrl: e.target.value })}
          />
          <Input
            label="Operator ID"
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

      {/* Section 4 — Enable games */}
      <Card>
        <h2 className="mb-1 font-semibold">4. Enable games on /play</h2>
        <p className="mb-4 text-sm text-slate-400">
          Enter each game&apos;s QTech catalog ID, save, then activate. Deactivate native Aviator if
          you only want the QTech version live.
        </p>

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
                    {game.status === "active" ? (
                      <Link
                        href={`/play/game/${game.id}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
                      >
                        Preview <ExternalLink size={12} />
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Section 5 — Native games */}
      <NativeGamesSection busyGameId={busyGameId} setBusyGameId={setBusyGameId} onRefresh={refreshStatus} />

      <Card>
        <h2 className="mb-2 font-semibold">Certification tester</h2>
        <p className="text-sm text-slate-400">
          After Pass-Key is saved, run{" "}
          <code className="text-xs text-slate-300">docs/qtech/cw_qtcw_tester.py all</code> against
          your wallet URL. See <code className="text-xs text-slate-300">docs/qtech/README.txt</code>.
        </p>
      </Card>
    </div>
  );
}
