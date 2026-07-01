"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firestore";

/** Player UIDs attached to an agent (ancestors contains agent). */
export function useAgentCustomerIds(agentId: string | undefined) {
  const [customerIds, setCustomerIds] = useState<Set<string> | null>(null);
  const [customerNames, setCustomerNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!agentId) {
      setCustomerIds(null);
      setCustomerNames(new Map());
      return;
    }
    const q = query(
      collection(db, "users"),
      where("role", "==", "player"),
      where("ancestors", "array-contains", agentId)
    );
    return onSnapshot(q, (snap) => {
      const ids = new Set<string>();
      const names = new Map<string, string>();
      for (const doc of snap.docs) {
        ids.add(doc.id);
        names.set(doc.id, String(doc.data().name || "Customer"));
      }
      setCustomerIds(ids);
      setCustomerNames(names);
    });
  }, [agentId]);

  return { customerIds, customerNames };
}
