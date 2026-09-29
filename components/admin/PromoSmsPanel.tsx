"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { MessageSquare, Send } from "lucide-react";
import { db } from "@/lib/firestore";
import { adminCancelPromoSms, adminStartPromoSms, errorMessage } from "@/lib/api";
import { FREE_SPIN_BULK_SMS } from "@/lib/games/promotions";
import { Button, Card } from "@/components/ui";

type PromoSmsCampaign = {
  id: string;
  status?: string;
  message?: string;
  smsSent?: number;
  smsFailed?: number;
  skipped?: number;
  processed?: number;
};

export function PromoSmsPanel() {
  const [message, setMessage] = useState(FREE_SPIN_BULK_SMS);
  const [busy, setBusy] = useState(false);
  const [campaign, setCampaign] = useState<PromoSmsCampaign | null>(null);

  useEffect(() => {
    const q = query(collection(db, "promoSmsCampaigns"), orderBy("createdAt", "desc"), limit(1));
    return onSnapshot(
      q,
      (snap) => {
        const doc = snap.docs[0];
        setCampaign(doc ? ({ id: doc.id, ...doc.data() } as PromoSmsCampaign) : null);
      },
      () => setCampaign(null),
    );
  }, []);

  const running = campaign?.status === "running";
  const length = message.trim().length;

  async function send() {
    const text = message.trim();
    if (text.length < 10) return toast.error("Paste the SMS first.");
    if (
      typeof window !== "undefined" &&
      !window.confirm("Send this exact SMS to every active player? It does not add a bonus.")
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await adminStartPromoSms({ message: text });
      toast.success(`Sending started. ${res.smsSent} texts sent in the first batch.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!campaign || typeof window === "undefined") return;
    if (!window.confirm("Stop sending this SMS? Texts already sent stay sent.")) return;
    setBusy(true);
    try {
      await adminCancelPromoSms({ campaignId: campaign.id });
      toast.success("SMS sending stopped.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-5 border-emerald-500/30">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <MessageSquare size={16} className="text-emerald-300" /> Paste and send SMS
      </h2>
      <p className="mb-3 text-xs text-slate-400">
        This is separate from the Happy Hour gift text. Paste the free-spin message, then send it to active players.
        One text is 160 characters.
      </p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        disabled={running}
        className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs font-bold ${length > 160 ? "text-amber-300" : "text-emerald-300"}`}>{length}/160</p>
        {running ? (
          <Button variant="secondary" onClick={() => void stop()} disabled={busy}>
            {busy ? "Stopping…" : "Stop sending"}
          </Button>
        ) : (
          <Button onClick={() => void send()} disabled={busy}>
            <span className="flex items-center gap-1.5">
              <Send size={15} /> {busy ? "Sending…" : "Send SMS"}
            </span>
          </Button>
        )}
      </div>
      {campaign ? (
        <p className="mt-2 text-xs text-slate-400">
          {campaign.status === "running" ? "Sending" : campaign.status === "canceled" ? "Stopped" : "Last send"} ·{" "}
          <span className="text-emerald-300">{campaign.smsSent ?? 0} texts sent</span>
          {(campaign.smsFailed ?? 0) > 0 ? (
            <span className="text-rose-300"> · {campaign.smsFailed} failed</span>
          ) : null}
          {(campaign.skipped ?? 0) > 0 ? <span> · {campaign.skipped} skipped (no phone)</span> : null}
          {campaign.status === "running" ? " · still sending…" : null}
        </p>
      ) : null}
    </Card>
  );
}
