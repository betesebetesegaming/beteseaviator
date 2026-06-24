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
    title: "Welcome to BETESE",
    subtitle: "Top up with Wave, AfriMoney & more — play QTech games in GMD",
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
