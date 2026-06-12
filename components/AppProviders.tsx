"use client";

import { AuthProvider } from "@/lib/auth-context";
import { AuthModalProvider } from "@/lib/auth-modal-context";
import { PresenceTracker } from "@/components/PresenceTracker";
import type { ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AuthModalProvider>
        <PresenceTracker />
        {children}
      </AuthModalProvider>
    </AuthProvider>
  );
}
