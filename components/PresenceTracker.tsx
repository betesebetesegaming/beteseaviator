"use client";

import { useEffect, useRef } from "react";
import { ref, serverTimestamp, set } from "firebase/database";
import { usePathname } from "next/navigation";
import { rtdb } from "@/lib/rtdb";
import { useAuth } from "@/lib/auth-context";
import { PRESENCE_HEARTBEAT_MS } from "@/lib/presence";

/**
 * Keeps presence/{uid} fresh while the play app is open (lobby or in-game).
 * Do not delete the node on React unmount — lobby ↔ game remounts would drop
 * the player from Live. Phone sleep is handled by a 10-minute online window
 * plus a last write when the tab hides. Logout clears the node.
 */
export function PresenceTracker() {
  const { fbUser, profile } = useAuth();
  const pathname = usePathname();
  const pageRef = useRef(pathname);

  useEffect(() => {
    pageRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!fbUser || !profile || profile.status !== "active") return;

    const node = ref(rtdb, `presence/${fbUser.uid}`);
    const write = () => {
      void set(node, {
        name: profile.name,
        role: profile.role,
        page: pageRef.current,
        lastSeen: serverTimestamp(),
      }).catch(() => undefined);
    };

    write();
    const beat = window.setInterval(write, PRESENCE_HEARTBEAT_MS);

    const onVis = () => write();
    const onFocus = () => write();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    window.addEventListener("online", onFocus);

    return () => {
      clearInterval(beat);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [fbUser, profile, pathname]);

  return null;
}
