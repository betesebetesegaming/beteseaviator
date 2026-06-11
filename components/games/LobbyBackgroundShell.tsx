"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  readLobbyBackground,
  saveLobbyBackground,
  type LobbyBackgroundId,
} from "@/lib/lobbyBackgrounds";
import { LobbyBackgroundPicker } from "./LobbyBackgroundPicker";

type Ctx = {
  background: LobbyBackgroundId;
  setBackground: (id: LobbyBackgroundId) => void;
};

const LobbyBackgroundContext = createContext<Ctx | null>(null);

export function useLobbyBackground() {
  const ctx = useContext(LobbyBackgroundContext);
  if (!ctx) throw new Error("useLobbyBackground must be used within LobbyBackgroundShell");
  return ctx;
}

export function LobbyBackgroundShell({
  children,
  showPicker = true,
}: {
  children: ReactNode;
  showPicker?: boolean;
}) {
  const [background, setBackgroundState] = useState<LobbyBackgroundId>("classic");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setBackgroundState(readLobbyBackground());
    setReady(true);
  }, []);

  function setBackground(id: LobbyBackgroundId) {
    setBackgroundState(id);
    saveLobbyBackground(id);
  }

  return (
    <LobbyBackgroundContext.Provider value={{ background, setBackground }}>
      <div
        data-lobby-bg={ready ? background : "classic"}
        className="lobby-bg-shell relative flex min-h-full flex-1 flex-col"
      >
        <div className="lobby-bg-layer pointer-events-none fixed inset-0 -z-10" aria-hidden />
        <div className="lobby-bg-glow pointer-events-none fixed inset-0 -z-10" aria-hidden />
        {showPicker && ready && (
          <div className="pointer-events-none fixed bottom-4 right-4 z-30 sm:bottom-6 sm:right-6">
            <div className="pointer-events-auto">
              <LobbyBackgroundPicker value={background} onChange={setBackground} />
            </div>
          </div>
        )}
        {children}
      </div>
    </LobbyBackgroundContext.Provider>
  );
}
