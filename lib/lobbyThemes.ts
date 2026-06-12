import type { CSSProperties } from "react";

/** Casino-style accent + background themes (BETBY-inspired picker). */

export type LobbyThemeId =
  | "betese"
  | "teal"
  | "cyan"
  | "gold"
  | "emerald"
  | "orange"
  | "violet"
  | "rose"
  | "lime"
  | "crimson"
  | "sky"
  | "amber";

export type LobbyTheme = {
  id: LobbyThemeId;
  label: string;
  accent: string;
  background: string;
  deep: string;
};

export const LOBBY_THEME_STORAGE_KEY = "betese-lobby-theme";

/** Legacy storage key → migrate on read */
const LEGACY_KEY = "betese-lobby-background";
const LEGACY_MAP: Record<string, LobbyThemeId> = {
  classic: "betese",
  sky: "sky",
  gold: "amber",
};

export const LOBBY_THEMES: LobbyTheme[] = [
  { id: "betese", label: "BETESE Green", accent: "#22c55e", background: "#0f172a", deep: "#020617" },
  { id: "teal", label: "Teal", accent: "#14b8a6", background: "#0f172a", deep: "#042f2e" },
  { id: "cyan", label: "Cyan", accent: "#06b6d4", background: "#0f172a", deep: "#083344" },
  { id: "gold", label: "Gold", accent: "#eab308", background: "#1e1b4b", deep: "#0c0a1a" },
  { id: "emerald", label: "Emerald", accent: "#10b981", background: "#0f172a", deep: "#022c22" },
  { id: "orange", label: "Orange", accent: "#f97316", background: "#0f172a", deep: "#431407" },
  { id: "violet", label: "Violet", accent: "#8b5cf6", background: "#0f172a", deep: "#2e1065" },
  { id: "rose", label: "Rose", accent: "#f43f5e", background: "#0f172a", deep: "#4c0519" },
  { id: "lime", label: "Lime", accent: "#84cc16", background: "#0f172a", deep: "#1a2e05" },
  { id: "crimson", label: "Crimson", accent: "#ef4444", background: "#0f172a", deep: "#450a0a" },
  { id: "sky", label: "Sky", accent: "#38bdf8", background: "#1e3a8a", deep: "#0c1445" },
  { id: "amber", label: "Amber", accent: "#f59e0b", background: "#292524", deep: "#1c1917" },
];

export function getLobbyTheme(id: LobbyThemeId): LobbyTheme {
  return LOBBY_THEMES.find((t) => t.id === id) ?? LOBBY_THEMES[0];
}

export function isLobbyThemeId(value: string): value is LobbyThemeId {
  return LOBBY_THEMES.some((t) => t.id === value);
}

export function readLobbyTheme(): LobbyThemeId {
  if (typeof window === "undefined") return "betese";
  const saved = localStorage.getItem(LOBBY_THEME_STORAGE_KEY);
  if (saved && isLobbyThemeId(saved)) return saved;
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy && LEGACY_MAP[legacy]) return LEGACY_MAP[legacy];
  return "betese";
}

export function saveLobbyTheme(id: LobbyThemeId): void {
  localStorage.setItem(LOBBY_THEME_STORAGE_KEY, id);
}

export function randomLobbyTheme(): LobbyThemeId {
  const pick = LOBBY_THEMES[Math.floor(Math.random() * LOBBY_THEMES.length)];
  return pick.id;
}

export function themeSwatchStyle(theme: LobbyTheme): CSSProperties {
  return {
    background: `linear-gradient(90deg, ${theme.accent} 50%, ${theme.background} 50%)`,
  };
}

export function themeCssVars(theme: LobbyTheme): CSSProperties {
  return {
    "--lobby-accent": theme.accent,
    "--lobby-bg": theme.background,
    "--lobby-bg-deep": theme.deep,
  } as CSSProperties;
}
