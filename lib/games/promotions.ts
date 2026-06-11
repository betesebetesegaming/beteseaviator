import type { Game } from "@/lib/types";

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
    title: "Welcome to BETESE Aviator",
    subtitle: "Top up with Wave, AfriMoney & more — play in GMD",
    cta: "Top up wallet",
    href: "/play/wallet",
    gradient: "from-emerald-700 via-emerald-900 to-black",
    accent: "text-betese-yellow",
  },
  {
    id: "turbo",
    title: "Aviator Turbo is live",
    subtitle: "Faster rounds · multipliers up to x200",
    cta: "Play Turbo",
    href: "/play/game/aviator-turbo",
    gradient: "from-amber-600 via-orange-800 to-black",
    accent: "text-white",
  },
  {
    id: "demo",
    title: "Try demo — 10,000 GMD free",
    subtitle: "Phone 3010001 · password: password",
    cta: "See demo accounts",
    href: "#demo-accounts",
    gradient: "from-red-700 via-rose-900 to-black",
    accent: "text-betese-yellow",
  },
];

export const PROMO_TICKER: string[] = [
  "🎮 New crash games added weekly on BETESE",
  "💰 Instant Wave & AfriMoney deposits",
  "✈️ Cash out before the crash — win in GMD",
  "🔥 Aviator Turbo — higher speed, higher multipliers",
  "🎁 Demo players: 10,000 GMD play money",
];

export type LobbyNavCategory =
  | "discover"
  | "crash"
  | "slots"
  | "instant"
  | "live"
  | "table";

export type LobbyNavItem = {
  id: LobbyNavCategory;
  label: string;
  icon: "compass" | "plane" | "sparkles" | "zap" | "tv" | "dice";
  available: boolean;
};

export const LOBBY_NAV: LobbyNavItem[] = [
  { id: "discover", label: "Discover", icon: "compass", available: true },
  { id: "crash", label: "Crash Games", icon: "plane", available: true },
  { id: "slots", label: "Slots", icon: "sparkles", available: true },
  { id: "instant", label: "Instant Win", icon: "zap", available: false },
  { id: "live", label: "Live Casino", icon: "tv", available: false },
  { id: "table", label: "Table Games", icon: "dice", available: false },
];

export function filterGamesByLobbyCategory(
  games: Game[],
  category: LobbyNavCategory
): Game[] {
  switch (category) {
    case "discover":
      return games;
    case "crash":
      return games.filter((g) => g.type === "crash");
    case "slots":
      return games.filter((g) => g.type === "slots");
    default:
      return [];
  }
}
