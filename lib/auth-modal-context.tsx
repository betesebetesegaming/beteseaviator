"use client";

import dynamic from "next/dynamic";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { AuthModalMode } from "@/components/auth-modal";

const LazyAuthModal = dynamic(
  () => import("@/components/auth-modal").then((m) => m.AuthModal),
  { ssr: false }
);

interface AuthModalContextValue {
  openAuth: (mode?: AuthModalMode, ref?: string | null) => void;
  closeAuth: () => void;
}

const AuthModalContext = createContext<AuthModalContextValue>({
  openAuth: () => {},
  closeAuth: () => {},
});

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthModalMode>("register");
  const [refCode, setRefCode] = useState<string | null>(null);

  const openAuth = useCallback((next: AuthModalMode = "register", ref?: string | null) => {
    setMode(next);
    if (ref !== undefined) setRefCode(ref);
    setOpen(true);
  }, []);

  const closeAuth = useCallback(() => setOpen(false), []);

  return (
    <AuthModalContext.Provider value={{ openAuth, closeAuth }}>
      {children}
      {open ? (
        <LazyAuthModal
          open={open}
          onClose={closeAuth}
          initialMode={mode}
          refCode={refCode}
        />
      ) : null}
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  return useContext(AuthModalContext);
}
