"use client";

import { useEffect, useRef } from "react";
import { onDisconnect, ref, remove, serverTimestamp, set, update } from "firebase/database";
import { usePathname } from "next/navigation";
import { rtdb } from "@/lib/rtdb";
import { useAuth } from "@/lib/auth-context";

const HEARTBEAT_MS = 120_000;
const PAGE_DEBOUNCE_MS = 5_000;

/** Keeps presence/{uid} updated so admin can see who is online. */
export function PresenceTracker() {
  const { fbUser, profile } = useAuth();
  const pathname = usePathname();
  const pageRef = useRef(pathname);
  const lastWriteRef = useRef(0);

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
    pageRef.current = pathname;
    lastWriteRef.current = Date.now();

    const beat = window.setInterval(() => {
      void update(node, { lastSeen: serverTimestamp(), page: pageRef.current });
    }, HEARTBEAT_MS);

    return () => {
      clearInterval(beat);
      void onDisconnect(node).cancel();
      void remove(node).catch(() => undefined);
    };
  }, [fbUser, profile]);

  useEffect(() => {
    if (!fbUser || !profile || profile.status !== "active") return;
    pageRef.current = pathname;
    const now = Date.now();
    if (now - lastWriteRef.current < PAGE_DEBOUNCE_MS) return;
    lastWriteRef.current = now;
    void update(ref(rtdb, `presence/${fbUser.uid}`), {
      page: pathname,
      lastSeen: serverTimestamp(),
    });
  }, [fbUser, profile, pathname]);

  return null;
}
