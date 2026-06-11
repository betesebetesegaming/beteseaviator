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
  "✈️ Aviator — cash out before the crash",
  "💰 Instant Wave & AfriMoney deposits",
  "🔥 Aviator Turbo — faster rounds, up to x200",
  "🎁 Demo players: 10,000 GMD play money",
];

export type LobbyNavCategory = "aviator" | "crash";

export type LobbyNavItem = {
  id: LobbyNavCategory;
  label: string;
  icon: "plane" | "rocket";
  available: boolean;
};

export const LOBBY_NAV: LobbyNavItem[] = [
  { id: "aviator", label: "Aviator Games", icon: "plane", available: true },
  { id: "crash", label: "Crash Games", icon: "rocket", available: true },
];

export function filterGamesByLobbyCategory(
  games: Game[],
  category: LobbyNavCategory
): Game[] {
  switch (category) {
    case "aviator":
      return games.filter((g) => g.id === "aviator");
    case "crash":
      return games.filter((g) => g.type === "crash" && g.id !== "aviator");
    default:
      return games;
  }
}
