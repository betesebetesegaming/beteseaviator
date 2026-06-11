"use client";

import { Palette } from "lucide-react";
import {
  LOBBY_BACKGROUNDS,
  type LobbyBackgroundId,
} from "@/lib/lobbyBackgrounds";

type Props = {
  value: LobbyBackgroundId;
  onChange: (id: LobbyBackgroundId) => void;
};

export function LobbyBackgroundPicker({ value, onChange }: Props) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 backdrop-blur-sm"
      title="Change lobby background"
    >
      <Palette size={14} className="hidden shrink-0 text-slate-400 sm:block" />
      <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-slate-500 md:inline">
        Theme
      </span>
      <div className="flex gap-1.5">
        {LOBBY_BACKGROUNDS.map((theme) => {
          const active = value === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => onChange(theme.id)}
              aria-label={`${theme.label} background`}
              aria-pressed={active}
              className={`relative h-7 w-7 rounded-full border-2 transition-transform hover:scale-105 ${
                active ? "border-betese-yellow ring-2 ring-betese-yellow/40" : "border-white/20"
              }`}
              style={{ background: theme.swatch }}
            >
              <span className="sr-only">{theme.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
