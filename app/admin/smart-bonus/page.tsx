"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { Brain, Play, Sparkles, MessageSquare, Phone, History, Check, X, Pencil, Send, Zap } from "lucide-react";
import { db } from "@/lib/firestore";
import {
  adminRunSmartBonusAnalysis,
  adminSaveSettings,
  errorMessage,
  smartBonusApprove,
  smartBonusEdit,
  smartBonusReject,
  smartBonusSend,
  adminCreateSmartBonusOffer,
  adminStartHappyHour,
  adminCancelHappyHour,
} from "@/lib/api";
import { mergePlatformSettings } from "@/lib/platformSettingsMerge";
import { DEFAULT_SETTINGS, type PlatformSettings, type SmartBonusOffer, type HappyHourCampaign } from "@/lib/types";
import { formatXof } from "@/lib/format";
import { formatPlayerId } from "@/lib/playerId";
import { offerMessage, offerStatusMeta, tierMeta } from "@/lib/smartBonus";
import { SmartBonusBriefing } from "@/components/admin/SmartBonusBriefing";
import { SmartBonusReports } from "@/components/admin/SmartBonusReports";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  Spinner,
  StatCard,
  TableShell,
  Td,
  Th,
} from "@/components/ui";

type StatusFilter = "all" | "pending" | "approved" | "sent" | "activated" | "completed" | "rejected" | "expired";

type EventRow = {
  id: string;
  action: string;
  actorRole: string;
  detail?: string;
  at?: { toDate?: () => Date } | null;
};

export default function AdminSmartBonusPage() {
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [offers, setOffers] = useState<SmartBonusOffer[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);

  const [tgtNumber, setTgtNumber] = useState("");
  const [tgtBonus, setTgtBonus] = useState("100");
  const [tgtMatch, setTgtMatch] = useState("");
  const [tgtBusy, setTgtBusy] = useState(false);

  const [hhBonus, setHhBonus] = useState("100");
  const [hhMatch, setHhMatch] = useState("");
  const [hhBusy, setHhBusy] = useState(false);
  const [hhList, setHhList] = useState<HappyHourCampaign[] | null>(null);
  const [selectedHHId, setSelectedHHId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<SmartBonusOffer[] | null>(null);
  const [view, setView] = useState<"recommendations" | "happyhour" | "briefing" | "reports">("recommendations");

  const [editTarget, setEditTarget] = useState<SmartBonusOffer | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editMatch, setEditMatch] = useState("");

  const [historyTarget, setHistoryTarget] = useState<SmartBonusOffer | null>(null);
  const [events, setEvents] = useState<EventRow[] | null>(null);

  useEffect(() => {
    return onSnapshot(doc(db, "settings", "platform"), (snap) => {
      if (snap.exists()) setSettings(mergePlatformSettings(snap.data() as Partial<PlatformSettings>));
      setSettingsLoaded(true);
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, "smartBonusOffers"), orderBy("createdAt", "desc"), limit(300));
    return onSnapshot(
      q,
      (snap) => setOffers(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SmartBonusOffer)),
      () => setOffers([])
    );
  }, []);

  useEffect(() => {
    const q = query(collection(db, "happyHourCampaigns"), orderBy("createdAt", "desc"), limit(50));
    return onSnapshot(
      q,
      (snap) => setHhList(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HappyHourCampaign)),
      () => setHhList([])
    );
  }, []);

  useEffect(() => {
    if (!selectedHHId) {
      setRecipients(null);
      return;
    }
    setRecipients(null);
    const q = query(collection(db, "smartBonusOffers"), where("happyHourId", "==", selectedHHId), limit(1000));
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SmartBonusOffer);
        rows.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        setRecipients(rows);
      },
      () => setRecipients([])
    );
  }, [selectedHHId]);

  useEffect(() => {
    if (!historyTarget) return;
    const q = query(collection(db, "smartBonusEvents"), where("offerId", "==", historyTarget.id));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EventRow);
      rows.sort((a, b) => (a.at?.toDate?.()?.getTime() ?? 0) - (b.at?.toDate?.()?.getTime() ?? 0));
      setEvents(rows);
    });
  }, [historyTarget]);

  const sb = settings.smartBonus ?? DEFAULT_SETTINGS.smartBonus!;
  const hh = hhList?.[0] ?? null;

  const filtered = useMemo(() => {
    if (!offers) return null;
    if (statusFilter === "all") return offers;
    return offers.filter((o) => o.status === statusFilter);
  }, [offers, statusFilter]);

  const stats = useMemo(() => {
    const all = offers ?? [];
    const issued = all.length;
    const activated = all.filter((o) => o.status === "activated" || o.status === "completed").length;
    const sentPool = all.filter((o) =>
      ["sent", "approved", "activated", "completed", "expired"].includes(o.status)
    ).length;
    const bonusCredited = all.reduce((s, o) => s + (o.bonusCredited ?? 0), 0);
    const depositsDriven = all.reduce((s, o) => s + (o.matchedDeposit ?? 0), 0);
    const conversion = sentPool > 0 ? Math.round((activated / sentPool) * 100) : 0;
    return { issued, activated, conversion, bonusCredited, depositsDriven, pending: all.filter((o) => o.status === "pending").length };
  }, [offers]);

  function updateSb<K extends keyof typeof sb>(key: K, value: (typeof sb)[K]) {
    setSettings((s) => ({ ...s, smartBonus: { ...(s.smartBonus ?? DEFAULT_SETTINGS.smartBonus!), [key]: value } }));
  }

  async function saveConfig() {
    if (!settingsLoaded) return;
    if (sb.maxBonus < sb.minBonus) return toast.error("Max bonus must be ≥ min bonus.");
    setBusy(true);
    try {
      await adminSaveSettings({ smartBonus: sb });
      toast.success("Smart Bonus settings saved.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      const res = await adminRunSmartBonusAnalysis({});
      toast.success(
        `Analyzed ${res.analyzed} players — ${res.offersCreated} new offers, ${res.expired} expired, ${res.completed} completed.`
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRunning(false);
    }
  }

  async function sendTargeted() {
    const bonusAmount = Number(tgtBonus);
    if (!tgtNumber.trim()) return toast.error("Enter a phone or player number.");
    if (!Number.isFinite(bonusAmount) || bonusAmount <= 0) return toast.error("Enter a valid bonus amount.");
    setTgtBusy(true);
    try {
      const res = await adminCreateSmartBonusOffer({
        playerNumber: tgtNumber.trim(),
        bonusAmount,
        matchDeposit: tgtMatch.trim() ? Number(tgtMatch) : undefined,
      });
      const who = res.phone ?? "the player";
      if (res.sms && !res.sms.ok) {
        toast(`Offer created for ${who}, but the SMS failed: ${res.sms.error ?? "gateway error"}`);
      } else {
        toast.success(
          `Sent ${formatXof(res.bonusAmount)} gift bonus to ${who} — they deposit ${formatXof(res.matchDeposit)} to claim.`
        );
      }
      setTgtNumber("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setTgtBusy(false);
    }
  }

  const hhRunning = hh?.status === "running";

  async function startHappyHour() {
    const bonusAmount = Number(hhBonus);
    if (!Number.isFinite(bonusAmount) || bonusAmount <= 0) return toast.error("Enter a valid bonus amount.");
    if (hhRunning) return toast.error("A Happy Hour is already running.");
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Start a ${formatXof(bonusAmount)} Happy Hour for ALL recently-active players? ` +
          `It creates a bonus offer for each and texts them.`
      )
    ) {
      return;
    }
    setHhBusy(true);
    try {
      const res = await adminStartHappyHour({
        bonusAmount,
        matchDeposit: hhMatch.trim() ? Number(hhMatch) : undefined,
        activeDays: 14,
        notify: "sms",
      });
      toast.success(`Happy Hour started — ${formatXof(res.bonusAmount)} to every recently-active player. Rolling out now…`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setHhBusy(false);
    }
  }

  async function cancelHappyHour() {
    if (typeof window !== "undefined" && !window.confirm("Stop this Happy Hour now? No more offers or texts will go out. Bonuses already sent stay.")) {
      return;
    }
    setHhBusy(true);
    try {
      await adminCancelHappyHour({ campaignId: hh?.id });
      toast.success("Happy Hour stopped.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setHhBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function openEdit(o: SmartBonusOffer) {
    setEditTarget(o);
    setEditAmount(String(o.bonusAmount));
    setEditMatch(String(o.matchDeposit));
  }

  async function saveEdit() {
    if (!editTarget) return;
    const bonusAmount = Number(editAmount);
    const matchDeposit = Number(editMatch);
    if (!Number.isFinite(bonusAmount) || bonusAmount <= 0) return toast.error("Enter a valid bonus amount.");
    if (!Number.isFinite(matchDeposit) || matchDeposit <= 0) return toast.error("Enter a valid match deposit.");
    await act(() => smartBonusEdit({ offerId: editTarget.id, bonusAmount, matchDeposit }), "Offer updated.");
    setEditTarget(null);
  }

  const REWARDS_URL = "https://www.beteseaviator.com/play/rewards";

  function outreachText(o: SmartBonusOffer): string {
    const base = (o.outreachMessage ?? "").trim() || offerMessage(o.userName, o.bonusAmount, o.matchDeposit);
    return base.includes(REWARDS_URL) ? base : `${base} ${REWARDS_URL}`;
  }

  /** SMS is delivered server-side straight to the customer (with the link). */
  function sendSms(o: SmartBonusOffer) {
    void act(async () => {
      const res = await smartBonusSend({ offerId: o.id, channel: "sms" });
      if (res.sms && !res.sms.ok) throw new Error(res.sms.error || "SMS gateway error");
    }, "SMS sent to the customer.");
  }

  /** WhatsApp opens the admin's app pre-filled (message + link) to send in one tap. */
  function sendWhatsApp(o: SmartBonusOffer) {
    const phone = (o.phone ?? "").replace(/\D/g, "");
    if (typeof window !== "undefined" && phone) {
      const intl = phone.startsWith("220") ? phone : `220${phone}`;
      window.open(`https://wa.me/${intl}?text=${encodeURIComponent(outreachText(o))}`, "_blank");
    }
    void act(() => smartBonusSend({ offerId: o.id, channel: "whatsapp" }), "Marked sent via WhatsApp.");
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Brain size={20} className="text-violet-300" /> Smart Bonus — AI Recommendations
          </h1>
          <p className="text-sm text-slate-400">
            The AI analyzes every player nightly at 02:00 and recommends welcome-back bonuses. Only admins approve.
          </p>
        </div>
        <Button variant="secondary" onClick={runNow} disabled={running}>
          <span className="flex items-center gap-1.5">
            <Play size={15} /> {running ? "Running…" : "Run analysis now"}
          </span>
        </Button>
      </div>

      {!sb.enabled && (
        <Card className="mb-5 border-amber-500/30 bg-amber-500/10 text-sm text-amber-100">
          The Smart Bonus engine is <strong>OFF</strong>. Enable it in the settings below to start generating
          recommendations. Existing money flows are unaffected either way.
        </Card>
      )}

      <div className="mb-5 flex gap-1 rounded-lg bg-slate-900 p-1 text-sm font-medium">
        {(
          [
            ["recommendations", "Recommendations"],
            ["happyhour", "Happy Hour"],
            ["briefing", "Daily briefing"],
            ["reports", "Reports"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex-1 rounded-md py-2 transition-colors ${
              view === key ? "bg-violet-500 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "briefing" && <SmartBonusBriefing offers={offers} />}
      {view === "reports" && <SmartBonusReports offers={offers} />}

      {view === "happyhour" && (
        <>
          <Card className="mb-6 border-amber-500/30">
            <h2 className="mb-1 flex items-center gap-2 font-semibold">
              <Zap size={16} className="text-amber-300" /> Start a Happy Hour
            </h2>
            <p className="mb-3 text-xs text-slate-400">
              Sends one fixed bonus to every recently-active player (last 14 days) at once — in-app banner plus SMS.
              They claim it by matching the deposit. Expiry follows your main setting. Leave match blank to auto-set.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Input label="Bonus (GMD)" type="number" value={hhBonus} onChange={(e) => setHhBonus(e.target.value)} />
              <Input label="Match deposit (GMD)" type="number" value={hhMatch} onChange={(e) => setHhMatch(e.target.value)} placeholder="auto" />
              <div className="flex items-end">
                <Button className="w-full" onClick={startHappyHour} disabled={hhBusy || hhRunning}>
                  <span className="flex items-center justify-center gap-1.5">
                    <Zap size={15} /> {hhRunning ? "Running…" : hhBusy ? "Starting…" : "Start Happy Hour"}
                  </span>
                </Button>
              </div>
            </div>
          </Card>

          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <History size={15} /> Happy Hour history
          </h2>
          {!hhList ? (
            <Spinner />
          ) : hhList.length === 0 ? (
            <EmptyState message="No Happy Hour sent yet. Start one above." />
          ) : (
            <div className="mb-6 space-y-2">
              {hhList.map((c) => {
                const active = selectedHHId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedHHId(active ? null : c.id)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                      active ? "border-amber-500/40 bg-amber-500/10" : "border-white/10 bg-slate-950/40 hover:bg-slate-900"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {formatXof(c.bonusAmount)} bonus
                        <span className="ml-2 text-xs text-slate-500">
                          {c.createdAt?.toDate?.() ? c.createdAt.toDate!().toLocaleString() : ""}
                        </span>
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          c.status === "running"
                            ? "bg-amber-500/20 text-amber-200"
                            : c.status === "canceled"
                            ? "bg-rose-500/20 text-rose-200"
                            : "bg-emerald-500/20 text-emerald-200"
                        }`}
                      >
                        {c.status === "running" ? "Rolling out" : c.status === "canceled" ? "Stopped" : "Done"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      <strong className="text-emerald-300">{c.offersCreated}</strong> players got it · {c.smsSent} texts sent
                      {c.smsFailed > 0 ? `, ${c.smsFailed} failed` : ""} · tap to see who
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedHHId && (
            <>
              <h2 className="mb-2 text-sm font-semibold text-slate-300">
                Who got this Happy Hour
                {recipients ? (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {recipients.length} players ·{" "}
                    {recipients.filter((o) => o.status === "activated" || o.status === "completed").length} claimed
                  </span>
                ) : null}
              </h2>
              {!recipients ? (
                <Spinner />
              ) : recipients.length === 0 ? (
                <EmptyState message="No recipients recorded for this Happy Hour." />
              ) : (
                <TableShell>
                  <thead>
                    <tr>
                      <Th>Customer</Th>
                      <Th>Phone</Th>
                      <Th>Bonus / Deposit</Th>
                      <Th>Claimed?</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipients.map((o) => {
                      const claimed = o.status === "activated" || o.status === "completed";
                      return (
                        <tr key={o.id}>
                          <Td>
                            <div className="font-medium">{o.userName}</div>
                            <div className="font-mono text-xs text-slate-500">
                              {o.playerNumber ? formatPlayerId(o.playerNumber) : "—"}
                            </div>
                          </Td>
                          <Td className="tabular-nums">{o.phone ?? "—"}</Td>
                          <Td className="tabular-nums">
                            <span className="font-semibold text-violet-200">{formatXof(o.bonusAmount)}</span>
                            <span className="text-slate-500"> on {formatXof(o.matchDeposit)}</span>
                          </Td>
                          <Td>
                            {claimed ? (
                              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-200">
                                Claimed
                              </span>
                            ) : (
                              <span className="rounded-full bg-slate-600/20 px-2 py-0.5 text-xs font-semibold text-slate-400">
                                Not yet
                              </span>
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableShell>
              )}
            </>
          )}
        </>
      )}

      {view === "recommendations" && (
        <>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Offers issued" value={stats.issued} />
        <StatCard label="Pending review" value={stats.pending} />
        <StatCard label="Activated" value={stats.activated} />
        <StatCard label="Conversion" value={`${stats.conversion}%`} hint="activated ÷ sent" />
        <StatCard label="Bonus credited" value={formatXof(stats.bonusCredited)} />
        <StatCard label="Deposits driven" value={formatXof(stats.depositsDriven)} />
      </div>

      {/* Config */}
      <Card className="mb-6">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Sparkles size={16} className="text-violet-300" /> Engine settings
        </h2>
        {!settingsLoaded ? (
          <Spinner />
        ) : (
          <>
            <label className="mb-4 flex items-center gap-3 rounded-lg border border-white/10 bg-slate-950/50 p-3">
              <input
                type="checkbox"
                checked={sb.enabled}
                onChange={(e) => updateSb("enabled", e.target.checked)}
                className="h-5 w-5 accent-emerald-500"
              />
              <span className="text-sm">
                <span className="font-semibold">Enable Smart Bonus engine</span>
                <span className="block text-xs text-slate-400">Master switch for nightly analysis and offers.</span>
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <NumField label="Inactive days" value={sb.inactiveDays} onChange={(v) => updateSb("inactiveDays", v)} />
              <NumField label="Min bonus (GMD)" value={sb.minBonus} onChange={(v) => updateSb("minBonus", v)} />
              <NumField label="Max bonus (GMD)" value={sb.maxBonus} onChange={(v) => updateSb("maxBonus", v)} />
              <NumField label="Match % (1 = 100%)" step={0.05} value={sb.matchPercent} onChange={(v) => updateSb("matchPercent", v)} />
              <NumField label="Wager multiplier" value={sb.wagerMultiplier} onChange={(v) => updateSb("wagerMultiplier", v)} />
              <NumField label="Expiry (days)" value={sb.expiryDays} onChange={(v) => updateSb("expiryDays", v)} />
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={sb.autoCreate}
                onChange={(e) => updateSb("autoCreate", e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
              Auto-create pending offers each night (uncheck to only score players)
            </label>
            <label className="mt-2 flex items-start gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={sb.aiEnabled}
                onChange={(e) => updateSb("aiEnabled", e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-violet-500"
              />
              <span>
                <span className="font-medium text-violet-200">Use Claude AI</span> to size each bonus and write
                the explanation + outreach message
                <span className="block text-xs text-slate-500">
                  Requires <code className="text-slate-400">ANTHROPIC_API_KEY</code> in functions/.env. Falls back
                  to the rule-based engine automatically if unset or on any error.
                </span>
              </span>
            </label>
            <Button className="mt-4" onClick={saveConfig} disabled={busy}>
              {busy ? "Saving…" : "Save settings"}
            </Button>
          </>
        )}
      </Card>

      {/* Targeted send */}
      <Card className="mb-6">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <Send size={16} className="text-violet-300" /> Send a bonus to a number
        </h2>
        <p className="mb-3 text-xs text-slate-400">
          Push a gift bonus to one player right now — skips the nightly rules. They get an SMS with the link and
          claim it by depositing the match amount. Leave match blank to auto-set it.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Input
            label="Phone or player #"
            value={tgtNumber}
            onChange={(e) => setTgtNumber(e.target.value)}
            placeholder="7793854 or 9"
          />
          <Input label="Bonus (GMD)" type="number" value={tgtBonus} onChange={(e) => setTgtBonus(e.target.value)} />
          <Input label="Match deposit (GMD)" type="number" value={tgtMatch} onChange={(e) => setTgtMatch(e.target.value)} placeholder="auto" />
          <div className="flex items-end">
            <Button className="w-full" onClick={sendTargeted} disabled={tgtBusy}>
              {tgtBusy ? "Sending…" : "Send bonus"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Filter */}
      <div className="mb-3 max-w-xs">
        <Select label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          {(["pending", "approved", "sent", "activated", "completed", "rejected", "expired", "all"] as StatusFilter[]).map(
            (s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            )
          )}
        </Select>
      </div>

      {!filtered ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <EmptyState message="No offers in this view. Run the analysis or enable the engine." />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th>Phone</Th>
              <Th>Health</Th>
              <Th>Days inactive</Th>
              <Th>Bonus / Deposit</Th>
              <Th>Expires</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const t = tierMeta(o.tier);
              const st = offerStatusMeta(o.status);
              return (
                <tr key={o.id}>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">{o.userName}</span>
                      {o.aiGenerated ? (
                        <span className="rounded bg-violet-500/20 px-1 py-0.5 text-[9px] font-bold uppercase text-violet-200">
                          AI
                        </span>
                      ) : null}
                    </div>
                    <div className="font-mono text-xs text-slate-500">
                      {o.playerNumber ? formatPlayerId(o.playerNumber) : "—"}
                      {o.source === "agent_request" ? " · agent request" : ""}
                    </div>
                  </Td>
                  <Td className="tabular-nums">{o.phone ?? "—"}</Td>
                  <Td>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${t.bg} ${t.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} /> {o.healthScore} · {t.label}
                    </span>
                  </Td>
                  <Td className="tabular-nums">{o.daysInactive}d</Td>
                  <Td className="tabular-nums">
                    <span className="font-semibold text-violet-200">{formatXof(o.bonusAmount)}</span>
                    <span className="text-slate-500"> on {formatXof(o.matchDeposit)}</span>
                  </Td>
                  <Td className="text-xs text-slate-400">{o.expiresAt ? o.expiresAt.slice(0, 10) : "—"}</Td>
                  <Td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.bg} ${st.text}`}>{st.label}</span>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {o.status === "pending" && (
                        <>
                          <IconBtn title="Approve" onClick={() => act(() => smartBonusApprove({ offerId: o.id }), "Approved.")}>
                            <Check size={14} />
                          </IconBtn>
                          <IconBtn title="Edit amount" onClick={() => openEdit(o)}>
                            <Pencil size={14} />
                          </IconBtn>
                          <IconBtn title="Reject" danger onClick={() => act(() => smartBonusReject({ offerId: o.id }), "Rejected.")}>
                            <X size={14} />
                          </IconBtn>
                        </>
                      )}
                      {(o.status === "approved" || o.status === "sent") && (
                        <>
                          <IconBtn title="Send WhatsApp (opens your app)" onClick={() => sendWhatsApp(o)}>
                            <MessageSquare size={14} />
                          </IconBtn>
                          <IconBtn title="Send SMS (auto — texts the customer)" onClick={() => sendSms(o)}>
                            <Phone size={14} />
                          </IconBtn>
                          <IconBtn title="Reject" danger onClick={() => act(() => smartBonusReject({ offerId: o.id }), "Rejected.")}>
                            <X size={14} />
                          </IconBtn>
                        </>
                      )}
                      <IconBtn title="History" onClick={() => { setEvents(null); setHistoryTarget(o); }}>
                        <History size={14} />
                      </IconBtn>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}
        </>
      )}

      {/* Edit modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`Edit bonus — ${editTarget?.userName ?? ""}`}>
        <div className="space-y-4">
          {editTarget && (
            <p className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 text-xs text-slate-300">
              {editTarget.reason}
            </p>
          )}
          <Input label="Bonus amount (GMD)" type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
          <Input label="Required matching deposit (GMD)" type="number" value={editMatch} onChange={(e) => setEditMatch(e.target.value)} />
          <Button className="w-full" onClick={saveEdit} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Modal>

      {/* History modal */}
      <Modal open={!!historyTarget} onClose={() => setHistoryTarget(null)} title={`Activity — ${historyTarget?.userName ?? ""}`}>
        {!events ? (
          <Spinner />
        ) : events.length === 0 ? (
          <EmptyState message="No events logged yet." />
        ) : (
          <ul className="space-y-2 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-slate-950/40 p-2.5">
                <div>
                  <span className="font-semibold capitalize">{e.action.replace(/_/g, " ")}</span>
                  <span className="ml-2 text-xs text-slate-500">{e.actorRole}</span>
                  {e.detail ? <p className="text-xs text-slate-400">{e.detail}</p> : null}
                </div>
                <span className="whitespace-nowrap text-xs text-slate-500">
                  {e.at?.toDate?.() ? e.at.toDate!().toLocaleString() : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <Input
      label={label}
      type="number"
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded-lg border px-2 py-1.5 text-slate-200 transition-colors ${
        danger
          ? "border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20"
          : "border-white/10 bg-slate-800 hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  );
}
