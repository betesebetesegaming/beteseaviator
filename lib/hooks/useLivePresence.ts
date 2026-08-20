"use client";

import { useEffect, useMemo, useState } from "react";
import { onValue, ref } from "firebase/database";
import { rtdb } from "@/lib/rtdb";
import { parsePresenceTree, type PresenceRow } from "@/lib/presence";

/** Admin-only live list from RTDB `/presence`. Returns error if rules block the parent read. */
export function useLivePresence(enabled: boolean) {
  const [rows, setRows] = useState<PresenceRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setRows(null);
      setError(false);
      return;
    }
    return onValue(
      ref(rtdb, "presence"),
      (snap) => {
        setError(false);
        const val = snap.val() as Record<
          string,
          { lastSeen?: unknown; name?: unknown; role?: unknown; page?: unknown }
        > | null;
        setRows(parsePresenceTree(val));
      },
      () => {
        setError(true);
        setRows(null);
      },
    );
  }, [enabled]);

  const online = useMemo(() => (rows ?? []).filter((r) => r.online), [rows]);

  return {
    rows,
    online,
    onlineCount: online.length,
    error,
    loading: enabled && rows === null && !error,
  };
}
