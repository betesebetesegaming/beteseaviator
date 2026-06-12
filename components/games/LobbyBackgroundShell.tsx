"use client";

import dynamic from "next/dynamic";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Palette } from "lucide-react";
import {
  getLobbyTheme,
  readLobbyTheme,
  saveLobbyTheme,
  themeCssVars,
  themeSwatchStyle,
  type LobbyThemeId,
} from "@/lib/lobbyThemes";

const LobbyThemeModal = dynamic(
  () => import("./LobbyThemeModal").then((m) => m.LobbyThemeModal),
  { ssr: false }
);

type Ctx = {
  themeId: LobbyThemeId;
  setThemeId: (id: LobbyThemeId) => void;
};

const LobbyThemeContext = createContext<Ctx | null>(null);

export function useLobbyTheme() {
  const ctx = useContext(LobbyThemeContext);
  if (!ctx) throw new Error("useLobbyTheme must be used within LobbyBackgroundShell");
  return ctx;
}

/** @deprecated */
export const useLobbyBackground = useLobbyTheme;

export function LobbyBackgroundShell({
  children,
  showPicker = true,
}: {
  children: ReactNode;
  showPicker?: boolean;
}) {
  const [themeId, setThemeIdState] = useState<LobbyThemeId>("betese");
  const [ready, setReady] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    setThemeIdState(readLobbyTheme());
    setReady(true);
  }, []);

  function setThemeId(id: LobbyThemeId) {
    setThemeIdState(id);
    saveLobbyTheme(id);
  }

  const theme = getLobbyTheme(ready ? themeId : "betese");

  return (
    <LobbyThemeContext.Provider value={{ themeId, setThemeId }}>
      <div
        data-lobby-theme={theme.id}
        style={themeCssVars(theme)}
        className="lobby-bg-shell relative flex min-h-full flex-1 flex-col"
      >
        <div className="lobby-bg-layer pointer-events-none fixed inset-0 -z-10" aria-hidden />
        <div className="lobby-bg-glow pointer-events-none fixed inset-0 -z-10" aria-hidden />
        <div className="lobby-bg-noise pointer-events-none fixed inset-0 -z-10 opacity-[0.03]" aria-hidden />

        {showPicker && ready && (
          <>
            <div className="pointer-events-none fixed bottom-4 right-4 z-30 sm:bottom-6 sm:right-6">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/15 bg-slate-900/90 px-3 py-2 text-xs font-semibold text-slate-200 shadow-lg backdrop-blur-md transition hover:border-[var(--lobby-accent)]/50 hover:text-white"
                title="Select layout & colors"
              >
                <span
                  className="h-6 w-6 shrink-0 rounded-full border border-white/20"
                  style={themeSwatchStyle(theme)}
                />
                <Palette size={14} className="text-[var(--lobby-accent)]" />
                <span className="hidden sm:inline">Theme</span>
              </button>
            </div>
            {modalOpen ? (
              <LobbyThemeModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                value={themeId}
                onChange={setThemeId}
              />
            ) : null}
          </>
        )}
        {children}
      </div>
    </LobbyThemeContext.Provider>
  );
}
