"use client";

import { useEffect } from "react";
import { onDisconnect, ref, serverTimestamp, set, update } from "firebase/database";
import { usePathname } from "next/navigation";
import { rtdb } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

/** Keeps presence/{uid} updated so admin can see who is online. */
export function PresenceTracker() {
  const { fbUser, profile } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (!fbUser || !profile || profile.status !== "active") return;

    const node = ref(rtdb, `presence/${fbUser.uid}`);
    const payload = {
      name: profile.name,
      role: profile.role,
      page: pathname,
      lastSeen: serverTimestamp(),
    };

    void set(node, payload);
    void onDisconnect(node).remove();

    const beat = window.setInterval(() => {
      void update(node, { lastSeen: serverTimestamp(), page: pathname });
    }, 60_000);

    return () => {
      clearInterval(beat);
      void onDisconnect(node).cancel();
    };
  }, [fbUser, profile, pathname]);

  return null;
}
