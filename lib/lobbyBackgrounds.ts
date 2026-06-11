export type LobbyBackgroundId = "classic" | "sky" | "gold";

export type LobbyBackgroundTheme = {
  id: LobbyBackgroundId;
  label: string;
  /** Small swatch for the picker */
  swatch: string;
};

export const LOBBY_BACKGROUND_STORAGE_KEY = "betese-lobby-background";

export const LOBBY_BACKGROUNDS: LobbyBackgroundTheme[] = [
  {
    id: "classic",
    label: "Classic",
    swatch: "linear-gradient(135deg, #020617 0%, #0f172a 50%, #052e16 100%)",
  },
  {
    id: "sky",
    label: "Sky",
    swatch: "linear-gradient(135deg, #0c1445 0%, #1e3a8a 45%, #312e81 100%)",
  },
  {
    id: "gold",
    label: "Gold",
    swatch: "linear-gradient(135deg, #1a0a0a 0%, #451a03 50%, #78350f 100%)",
  },
];

export function isLobbyBackgroundId(value: string): value is LobbyBackgroundId {
  return value === "classic" || value === "sky" || value === "gold";
}

export function readLobbyBackground(): LobbyBackgroundId {
  if (typeof window === "undefined") return "classic";
  const saved = localStorage.getItem(LOBBY_BACKGROUND_STORAGE_KEY);
  return saved && isLobbyBackgroundId(saved) ? saved : "classic";
}

export function saveLobbyBackground(id: LobbyBackgroundId): void {
  localStorage.setItem(LOBBY_BACKGROUND_STORAGE_KEY, id);
}
