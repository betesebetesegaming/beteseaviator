"use client";

import { Shuffle } from "lucide-react";
import {
  LOBBY_THEMES,
  getLobbyTheme,
  randomLobbyTheme,
  themeSwatchStyle,
  type LobbyThemeId,
} from "@/lib/lobbyThemes";
import { Button, Modal } from "@/components/ui";

type Props = {
  open: boolean;
  onClose: () => void;
  value: LobbyThemeId;
  onChange: (id: LobbyThemeId) => void;
};

export function LobbyThemeModal({ open, onClose, value, onChange }: Props) {
  const current = getLobbyTheme(value);

  function pick(id: LobbyThemeId) {
    onChange(id);
  }

  function randomize() {
    onChange(randomLobbyTheme());
  }

  return (
    <Modal open={open} onClose={onClose} title="Select layout & colors">
      <div className="space-y-6">
        {/* Layout row — Classic is live; others coming soon */}
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Layout</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "tile", label: "Tile", soon: true },
              { id: "sidebar", label: "Sidebar", soon: true },
              { id: "classic", label: "Classic", soon: false },
            ].map((layout) => {
              const active = layout.id === "classic";
              return (
                <button
                  key={layout.id}
                  type="button"
                  disabled={layout.soon}
                  className={`rounded-xl border px-2 py-3 text-center transition-all ${
                    layout.soon
                      ? "cursor-not-allowed border-white/5 opacity-40"
                      : active
                        ? "border-[var(--lobby-accent)] bg-white/10 ring-2 ring-[var(--lobby-accent)]/30"
                        : "border-white/10 hover:bg-white/5"
                  }`}
                >
                  <div
                    className={`mx-auto mb-2 h-10 w-14 rounded-md border ${
                      active ? "border-[var(--lobby-accent)]/50 bg-slate-800" : "border-white/10 bg-slate-900"
                    }`}
                  >
                    {layout.id === "classic" && (
                      <div className="flex h-full gap-0.5 p-1">
                        <span className="w-1/4 rounded-sm bg-[var(--lobby-accent)]/60" />
                        <span className="flex-1 rounded-sm bg-white/10" />
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-300">
                    {layout.label}
                    {layout.soon ? "" : " ✓"}
                  </span>
                  {layout.soon && (
                    <span className="mt-0.5 block text-[8px] uppercase text-slate-600">Soon</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Color presets */}
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
            Color theme
          </p>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-7">
            {LOBBY_THEMES.map((theme) => {
              const active = theme.id === value;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => pick(theme.id)}
                  aria-label={theme.label}
                  aria-pressed={active}
                  title={theme.label}
                  className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full border-2 transition-all hover:scale-105 ${
                    active
                      ? "border-white ring-2 ring-[var(--lobby-accent)] ring-offset-2 ring-offset-slate-900"
                      : "border-white/15 hover:border-white/40"
                  }`}
                  style={themeSwatchStyle(theme)}
                />
              );
            })}
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">
            Active: <span className="font-semibold text-[var(--lobby-accent)]">{current.label}</span>
          </p>
        </div>

        <Button
          variant="secondary"
          className="w-full gap-2"
          onClick={randomize}
        >
          <Shuffle size={16} /> Randomize
        </Button>
      </div>
    </Modal>
  );
}
