"use client";

import { useEffect, useState } from "react";
import {
  collection,
  documentId,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firestore";
import {
  addPlayerToAgentBook,
  emptyAgentCommissionBook,
  finalizeAgentBook,
  type AgentCommissionBook,
} from "@/lib/platformFinancials";

/** Live cash for linked players. Falls back to stats.walletCash when a wallet doc is missing. */
async function liveWalletCashByPlayer(playerIds: string[]): Promise<Map<string, number> | null> {
  if (playerIds.length === 0) return new Map();
  const map = new Map<string, number>();
  try {
    for (let i = 0; i < playerIds.length; i += 10) {
      const chunk = playerIds.slice(i, i + 10);
      const snap = await getDocs(
        query(collection(db, "wallets"), where(documentId(), "in", chunk))
      );
      for (const d of snap.docs) {
        map.set(d.id, Math.max(0, Number(d.data()?.balance ?? 0)));
      }
    }
    return map;
  } catch {
    return null;
  }
}

/** Live commission book for one marketer from players on their link. */
export function useAgentCommissionBook(agentId: string | undefined) {
  const [book, setBook] = useState<AgentCommissionBook | null>(null);
  const [customerCount, setCustomerCount] = useState(0);

  useEffect(() => {
    if (!agentId) {
      setBook(null);
      setCustomerCount(0);
      return;
    }
    let cancelled = false;
    let gen = 0;
    const q = query(
      collection(db, "users"),
      where("role", "==", "player"),
      where("ancestors", "array-contains", agentId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const thisGen = ++gen;
        const acc = emptyAgentCommissionBook();
        const ids: string[] = [];
        for (const d of snap.docs) {
          ids.push(d.id);
          addPlayerToAgentBook(acc, d.data().stats);
        }
        void liveWalletCashByPlayer(ids).then((liveMap) => {
          if (cancelled || thisGen !== gen) return;
          if (liveMap) {
            acc.cashHeld = 0;
            for (const d of snap.docs) {
              const live = liveMap.get(d.id);
              acc.cashHeld +=
                live != null ? live : Math.max(0, Number(d.data()?.stats?.walletCash ?? 0));
            }
          }
          setCustomerCount(snap.size);
          setBook(finalizeAgentBook(acc));
        });
      },
      () => {
        if (cancelled) return;
        setCustomerCount(0);
        setBook(finalizeAgentBook(emptyAgentCommissionBook()));
      }
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [agentId]);

  return { book, customerCount };
}
