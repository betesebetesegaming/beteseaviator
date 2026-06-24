"use client";

import {
  Dice5,
  Grid3X3,
  Plane,
  Rocket,
  type LucideIcon,
} from "lucide-react";
import { LOBBY_NAV, type LobbyNavCategory } from "@/lib/games/promotions";

const ICONS: Record<string, LucideIcon> = {
  grid: Grid3X3,
  plane: Plane,
  rocket: Rocket,
  dice: Dice5,
};

type Props = {
  active: LobbyNavCategory;
  onChange: (cat: LobbyNavCategory) => void;
  counts: Partial<Record<LobbyNavCategory, number>>;
};

export function LobbyCategoryNav({ active, onChange, counts }: Props) {
  return (
    <nav
      className="lobby-scroll-x -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 pt-2"
      aria-label="Game categories"
    >
      {LOBBY_NAV.map((item) => {
        const Icon = ICONS[item.icon] ?? Plane;
        const isActive = active === item.id;
        const count = counts[item.id];
        const disabled = !item.available;

        return (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            onClick={() => item.available && onChange(item.id)}
            className={`flex min-w-[4.5rem] shrink-0 flex-col items-center gap-1.5 rounded-xl px-3 py-2 transition-all sm:min-w-[5.5rem] ${
              disabled
                ? "cursor-not-allowed opacity-35"
                : isActive
                  ? "bg-[color-mix(in_srgb,var(--lobby-accent)_15%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--lobby-accent)_40%,transparent)]"
                  : "hover:bg-white/5"
            }`}
          >
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                isActive
                  ? "border-[var(--lobby-accent)] bg-[color-mix(in_srgb,var(--lobby-accent)_20%,transparent)] text-[var(--lobby-accent)]"
                  : "border-[color-mix(in_srgb,var(--lobby-accent)_50%,transparent)] text-[color-mix(in_srgb,var(--lobby-accent)_80%,white)]"
              }`}
            >
              <Icon size={20} strokeWidth={1.75} />
            </span>
            <span
              className={`text-center text-[9px] font-bold uppercase leading-tight tracking-wide sm:text-[10px] ${
                isActive ? "text-[var(--lobby-accent)]" : "text-slate-400"
              }`}
            >
              {item.label}
            </span>
            {item.available && count !== undefined && count > 0 && (
              <span className="text-[9px] font-semibold text-slate-600">{count} games</span>
            )}
            {disabled && (
              <span className="text-[8px] font-bold uppercase text-slate-600">Soon</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
