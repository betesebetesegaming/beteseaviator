"use client";

import { useEffect, useState } from "react";
import { collection, documentId, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firestore";
import {
  addPlayerToAgentBook,
  emptyAgentCommissionBook,
  finalizeAgentBook,
  type AgentCommissionBook,
} from "@/lib/platformFinancials";
import { useAgentLinkedPlayers } from "@/lib/hooks/useAgentLinkedPlayers";

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
  const players = useAgentLinkedPlayers(agentId);
  const [book, setBook] = useState<AgentCommissionBook | null>(null);
  const [customerCount, setCustomerCount] = useState(0);

  useEffect(() => {
    if (!agentId) {
      setBook(null);
      setCustomerCount(0);
      return;
    }
    if (!players) {
      setBook(null);
      return;
    }
    let cancelled = false;
    const acc = emptyAgentCommissionBook();
    const ids: string[] = [];
    for (const p of players) {
      ids.push(p.uid);
      addPlayerToAgentBook(acc, p.stats);
    }
    void liveWalletCashByPlayer(ids).then((liveMap) => {
      if (cancelled) return;
      if (liveMap) {
        acc.cashHeld = 0;
        for (const p of players) {
          const live = liveMap.get(p.uid);
          acc.cashHeld +=
            live != null ? live : Math.max(0, Number(p.stats?.walletCash ?? 0));
        }
      }
      setCustomerCount(players.length);
      setBook(finalizeAgentBook(acc));
    });
    return () => {
      cancelled = true;
    };
  }, [agentId, players]);

  return { book, customerCount };
}
