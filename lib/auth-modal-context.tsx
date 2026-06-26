"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { AuthModal, type AuthModalMode } from "@/components/auth-modal";

interface AuthModalContextValue {
  openAuth: (mode?: AuthModalMode, ref?: string | null, pref?: string | null) => void;
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
  const [prefCode, setPrefCode] = useState<string | null>(null);
  const [session, setSession] = useState(0);

  const openAuth = useCallback(
    (next: AuthModalMode = "register", ref?: string | null, pref?: string | null) => {
      setMode(next);
      if (ref !== undefined) setRefCode(ref);
      if (pref !== undefined) setPrefCode(pref);
      setSession((n) => n + 1);
      setOpen(true);
    },
    []
  );

  const closeAuth = useCallback(() => setOpen(false), []);

  return (
    <AuthModalContext.Provider value={{ openAuth, closeAuth }}>
      {children}
      {open ? (
        <AuthModal
          key={`auth-modal-${mode}-${session}`}
          open={open}
          onClose={closeAuth}
          initialMode={mode}
          refCode={refCode}
          prefCode={prefCode}
        />
      ) : null}
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  return useContext(AuthModalContext);
}
