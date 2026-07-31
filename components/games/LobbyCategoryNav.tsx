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
      className="lobby-scroll-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 pt-1"
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
            className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold transition-all sm:px-4 sm:text-sm ${
              disabled
                ? "cursor-not-allowed opacity-35"
                : isActive
                  ? "bg-sky-500 text-white shadow-md shadow-sky-500/25"
                  : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon size={16} strokeWidth={2} />
            <span>{item.label}</span>
            {item.available && count !== undefined && count > 0 && !isActive ? (
              <span className="text-[10px] font-semibold text-slate-500">{count}</span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
