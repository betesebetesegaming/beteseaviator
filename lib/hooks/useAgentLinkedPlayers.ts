"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firestore";
import type { UserProfile } from "@/lib/types";

/** Players on a marketer link: ancestors contains them, or parentId is them. */
export function useAgentLinkedPlayers(agentId: string | undefined): UserProfile[] | null {
  const [players, setPlayers] = useState<UserProfile[] | null>(null);

  useEffect(() => {
    if (!agentId) {
      setPlayers(null);
      return;
    }
    const ancestorQ = query(
      collection(db, "users"),
      where("role", "==", "player"),
      where("ancestors", "array-contains", agentId)
    );
    const parentQ = query(
      collection(db, "users"),
      where("role", "==", "player"),
      where("parentId", "==", agentId)
    );
    const buckets = {
      ancestors: new Map<string, UserProfile>(),
      parent: new Map<string, UserProfile>(),
    };
    const publish = () => {
      const byId = new Map<string, UserProfile>();
      for (const row of buckets.ancestors.values()) byId.set(row.uid, row);
      for (const row of buckets.parent.values()) byId.set(row.uid, row);
      setPlayers([...byId.values()]);
    };
    const unsubA = onSnapshot(
      ancestorQ,
      (snap) => {
        buckets.ancestors = new Map(
          snap.docs.map((d) => [d.id, { uid: d.id, ...d.data() } as UserProfile])
        );
        publish();
      },
      () => {
        buckets.ancestors = new Map();
        publish();
      }
    );
    const unsubP = onSnapshot(
      parentQ,
      (snap) => {
        buckets.parent = new Map(
          snap.docs.map((d) => [d.id, { uid: d.id, ...d.data() } as UserProfile])
        );
        publish();
      },
      () => {
        buckets.parent = new Map();
        publish();
      }
    );
    return () => {
      unsubA();
      unsubP();
    };
  }, [agentId]);

  return players;
}
