"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Sparkles, ChevronRight, X } from "lucide-react";
import { db } from "@/lib/firestore";
import { useAuth } from "@/lib/auth-context";
import { isLiveOffer } from "@/lib/smartBonus";
import type { SmartBonusOffer } from "@/lib/types";

/** Slim congrats banner nudging players with a live Smart Bonus to My Rewards. */
export function SmartBonusBanner() {
  const { fbUser, profile } = useAuth();
  const pathname = usePathname();
  const [offer, setOffer] = useState<SmartBonusOffer | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!fbUser || profile?.role !== "player") return;
    const q = query(collection(db, "smartBonusOffers"), where("userId", "==", fbUser.uid));
    return onSnapshot(
      q,
      (snap) => {
        const live = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as SmartBonusOffer)
          .find((o) => isLiveOffer(o.status));
        setOffer(live ?? null);
      },
      () => setOffer(null)
    );
  }, [fbUser, profile?.role]);

  if (!offer || dismissed || pathname?.startsWith("/play/rewards")) return null;

  return (
    <div className="border-b border-violet-500/20 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/15">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
        <Sparkles size={16} className="shrink-0 text-violet-200" />
        <Link href="/play/rewards" className="flex min-w-0 flex-1 items-center gap-1 text-sm">
          <span className="truncate">
            <strong className="text-violet-100">Congratulations!</strong>{" "}
            <span className="text-slate-200">A personalized Smart Bonus is waiting for you.</span>
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-0.5 font-semibold text-violet-200">
            View <ChevronRight size={14} />
          </span>
        </Link>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded p-1 text-slate-400 hover:text-white"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
