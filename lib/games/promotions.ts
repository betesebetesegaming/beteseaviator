import type { Game } from "@/lib/types";

/** Recommended lobby banner upload size (16:3). */
export const LOBBY_BANNER_WIDTH = 1920;
export const LOBBY_BANNER_HEIGHT = 360;
export const LOBBY_BANNER_ASPECT = "1920/360" as const;
export const LOBBY_BANNER_SIZE_LABEL = `${LOBBY_BANNER_WIDTH}×${LOBBY_BANNER_HEIGHT}px`;

export type PromoSlide = {
  id: string;
  title: string;
  subtitle: string;
  cta?: string;
  href?: string;
  /** Full-width banner photo (admin upload or static asset). */
  imageUrl?: string;
  gradient: string;
  accent: string;
  active?: boolean;
  sortOrder?: number;
};

/** Stored at settings/lobbyPromos — managed from admin → Promotions. */
export type LobbyPromoConfig = {
  slides: PromoSlide[];
  ticker?: string[];
  updatedAt?: string;
};

export const PROMO_SLIDES: PromoSlide[] = [
  {
    id: "welcome",
    title: "Welcome to BETESE",
    subtitle: "Top up from GMD 20 — Wave, AfriMoney & more. Play QTech games in GMD",
    cta: "Top up wallet",
    href: "/play/wallet",
    gradient: "from-emerald-700 via-emerald-900 to-black",
    accent: "text-betese-yellow",
  },
  {
    id: "games",
    title: "QTech games are live",
    subtitle: "Pick a game below and play with your BETESE wallet",
    cta: "Browse games",
    href: "/play",
    gradient: "from-red-700 via-rose-900 to-black",
    accent: "text-betese-yellow",
  },
];

export const PROMO_TICKER: string[] = [
  "✈️ QTech games — play with your BETESE wallet",
  "💰 Instant Wave & AfriMoney deposits",
  "🎮 New games added from your QTech catalog",
];

export type LobbyNavCategory = "all" | "aviator" | "crash" | "instantwin";

export const LOBBY_NAV: Array<{ id: LobbyNavCategory; label: string; icon: string; available: boolean }> = [
  { id: "all", label: "All", icon: "grid", available: true },
  { id: "aviator", label: "Aviator", icon: "plane", available: true },
  { id: "crash", label: "Crash", icon: "rocket", available: true },
  { id: "instantwin", label: "Instant Win", icon: "dice", available: true },
];
