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
    id: "welcome",
    title: "Watch Aviator live — free",
    subtitle: "Sign up when you're ready to bet for real GMD",
    cta: "Play now",
    href: "/play/game/aviator",
    gradient: "from-red-700 via-rose-900 to-black",
    accent: "text-betese-yellow",
  },
];

export const PROMO_TICKER: string[] = [
  "✈️ Aviator — cash out before the crash",
  "💰 Instant Wave & AfriMoney deposits",
  "🔥 Aviator Turbo — faster rounds, up to x200",
  "🎁 Watch live for free — sign up to bet for real",
];

export type LobbyNavCategory = "aviator" | "crash" | "instantwin";

export type LobbyNavItem = {
  id: LobbyNavCategory;
  label: string;
  icon: "plane" | "rocket" | "dice";
  available: boolean;
};

export const LOBBY_NAV: LobbyNavItem[] = [
  { id: "aviator", label: "Aviator Games", icon: "plane", available: true },
  { id: "crash", label: "Crash Games", icon: "rocket", available: true },
  { id: "instantwin", label: "Instant Win", icon: "dice", available: true },
];

/** Aviator tab: explicit category plus the legacy native/qtech Aviator ids. */
function isAviatorGame(g: Game): boolean {
  return g.lobbyCategory === "aviator" || g.id === "aviator" || g.id === "qtech-aviator";
}

export function filterGamesByLobbyCategory(
  games: Game[],
  category: LobbyNavCategory
): Game[] {
  switch (category) {
    case "aviator":
      return games.filter(isAviatorGame);
    case "crash":
      // explicit crash category, or legacy crash games with no category assigned
      return games.filter(
        (g) =>
          g.lobbyCategory === "crash" ||
          (!g.lobbyCategory && g.type === "crash" && !isAviatorGame(g))
      );
    case "instantwin":
      return games.filter((g) => g.lobbyCategory === "instantwin");
    default:
      return games;
  }
}
