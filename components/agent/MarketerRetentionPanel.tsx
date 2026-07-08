"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Brain, Bell, Phone, MessageSquare } from "lucide-react";
import { db } from "@/lib/firestore";
import { useAuth } from "@/lib/auth-context";
import { agentRequestSmartBonus, errorMessage } from "@/lib/api";
import { formatXof } from "@/lib/format";
import { formatPlayerId } from "@/lib/playerId";
import { isLiveOffer, offerStatusMeta, tierMeta } from "@/lib/smartBonus";
import type { HealthTier, PlayerHealth, SmartBonusOffer } from "@/lib/types";
import { Button, Card, Spinner } from "@/components/ui";

const SEGMENTS: { tier: HealthTier | "all"; label: string }[] = [
  { tier: "all", label: "Total" },
  { tier: "very_active", label: "Very Active" },
  { tier: "active", label: "Active" },
  { tier: "at_risk", label: "At Risk" },
  { tier: "inactive", label: "Inactive" },
  { tier: "dormant", label: "Dormant" },
];

/** Marketer-facing player-retention view — segments + welcome-back requests. */
export function MarketerRetentionPanel() {
  const { fbUser } = useAuth();
  const [health, setHealth] = useState<PlayerHealth[] | null>(null);
  const [offers, setOffers] = useState<Record<string, SmartBonusOffer>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!fbUser) return;
    const q = query(collection(db, "playerHealth"), where("ancestors", "array-contains", fbUser.uid));
    return onSnapshot(
      q,
      (snap) => setHealth(snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as PlayerHealth)),
      () => setHealth([])
    );
  }, [fbUser]);

  useEffect(() => {
    if (!fbUser) return;
    const q = query(collection(db, "smartBonusOffers"), where("ancestors", "array-contains", fbUser.uid));
    return onSnapshot(
      q,
      (snap) => {
        // Keep the most recent non-terminal offer per player for status display.
        const map: Record<string, SmartBonusOffer> = {};
        for (const d of snap.docs) {
          const o = { id: d.id, ...d.data() } as SmartBonusOffer;
          const existing = map[o.userId];
          const rank = (s: string) =>
            ["completed", "activated", "sent", "approved", "pending", "rejected", "expired"].indexOf(s);
          if (!existing || rank(o.status) < rank(existing.status)) map[o.userId] = o;
        }
        setOffers(map);
      },
      () => setOffers({})
    );
  }, [fbUser]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, very_active: 0, active: 0, at_risk: 0, inactive: 0, dormant: 0 };
    for (const h of health ?? []) {
      c.all += 1;
      c[h.tier] = (c[h.tier] ?? 0) + 1;
    }
    return c;
  }, [health]);

  const needAttention = useMemo(() => {
    return (health ?? [])
      .filter((h) => h.tier === "at_risk" || h.tier === "inactive" || h.tier === "dormant")
      .sort((a, b) => a.healthScore - b.healthScore)
      .slice(0, 15);
  }, [health]);

  async function requestBonus(playerId: string) {
    setBusyId(playerId);
    try {
      await agentRequestSmartBonus({ playerId });
      toast.success("Welcome-back bonus requested — sent to admin for approval.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  if (health === null) {
    return (
      <Card className="mb-5">
        <Spinner label="Loading player health…" />
      </Card>
    );
  }

  if (health.length === 0) return null;

  return (
    <Card className="mb-5 border-violet-500/20 bg-violet-500/[0.04]">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <Brain size={16} className="text-violet-300" /> Player Retention (AI)
      </h2>

      <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {SEGMENTS.map((s) => {
          const meta = s.tier === "all" ? null : tierMeta(s.tier);
          return (
            <div
              key={s.tier}
              className={`rounded-lg border px-2 py-2 text-center ${
                meta ? `${meta.bg} ${meta.border}` : "border-white/10 bg-slate-950/40"
              }`}
            >
              <div className={`text-lg font-bold ${meta ? meta.text : "text-white"}`}>{counts[s.tier] ?? 0}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">{s.label}</div>
            </div>
          );
        })}
      </div>

      {needAttention.length === 0 ? (
        <p className="text-sm text-emerald-300">All your players are active — nothing at risk right now. 🎉</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-400">
            Customers slipping away — request a welcome-back bonus (admin approves &amp; issues):
          </p>
          <ul className="space-y-2">
            {needAttention.map((h) => {
              const meta = tierMeta(h.tier);
              const offer = offers[h.uid];
              const live = offer && isLiveOffer(offer.status);
              const phone = (h.phone ?? "").replace(/\D/g, "");
              return (
                <li
                  key={h.uid}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 bg-slate-950/40 p-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{h.name}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${meta.bg} ${meta.text}`}>
                        {h.healthScore} · {meta.label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {h.playerNumber ? formatPlayerId(h.playerNumber) : ""} · {h.daysSinceLastBet}d since last bet ·
                      avg {formatXof(h.avgDeposit)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {phone && (
                      <>
                        <a
                          href={`tel:${phone}`}
                          title="Call"
                          className="rounded-lg border border-white/10 bg-slate-800 p-1.5 text-slate-200 hover:bg-slate-700"
                        >
                          <Phone size={14} />
                        </a>
                        <a
                          href={`https://wa.me/${phone.startsWith("220") ? phone : `220${phone}`}`}
                          target="_blank"
                          rel="noreferrer"
                          title="WhatsApp"
                          className="rounded-lg border border-white/10 bg-slate-800 p-1.5 text-slate-200 hover:bg-slate-700"
                        >
                          <MessageSquare size={14} />
                        </a>
                      </>
                    )}
                    {offer ? (
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${offerStatusMeta(offer.status).bg} ${offerStatusMeta(offer.status).text}`}>
                        {live ? "Bonus live" : offerStatusMeta(offer.status).label}
                      </span>
                    ) : (
                      <Button
                        variant="secondary"
                        className="!px-2.5 !py-1.5 text-xs"
                        disabled={busyId === h.uid}
                        onClick={() => requestBonus(h.uid)}
                      >
                        <span className="flex items-center gap-1">
                          <Bell size={13} /> {busyId === h.uid ? "…" : "Request bonus"}
                        </span>
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
