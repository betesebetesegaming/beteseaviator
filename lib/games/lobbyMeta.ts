import type { Game } from "@/lib/types";

export type GameLobbyVisual = {
  gradient: string;
  accent: string;
  icon: "plane" | "rocket" | "slots" | "dice";
  tagline: string;
};

const TYPE_DEFAULTS: Record<Game["type"], GameLobbyVisual> = {
  crash: {
    gradient: "from-red-600/40 via-orange-500/20 to-slate-950",
    accent: "text-red-400",
    icon: "plane",
    tagline: "Cash out before the crash",
  },
  slots: {
    gradient: "from-violet-600/40 via-fuchsia-500/20 to-slate-950",
    accent: "text-violet-400",
    icon: "slots",
    tagline: "Spin and win big",
  },
};

const GAME_OVERRIDES: Record<string, Partial<GameLobbyVisual>> = {
  aviator: {
    gradient: "from-red-600/50 via-rose-500/25 to-slate-950",
    tagline: "Classic crash — fly high, cash out smart",
  },
  "aviator-turbo": {
    gradient: "from-amber-500/45 via-orange-600/25 to-slate-950",
    accent: "text-amber-400",
    icon: "rocket",
    tagline: "Faster rounds · higher multipliers",
  },
};

export function getGameLobbyVisual(game: Pick<Game, "id" | "type" | "name">): GameLobbyVisual {
  const base = TYPE_DEFAULTS[game.type] ?? TYPE_DEFAULTS.crash;
  const override = GAME_OVERRIDES[game.id] ?? {};
  return { ...base, ...override };
}

export type DemoAccount = {
  id: string;
  label: string;
  role: string;
  login: string;
  loginHint: string;
  password: string;
  balance?: string;
  description: string;
};

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: "customer-1",
    label: "Demo Player 1",
    role: "Customer",
    login: "3010001",
    loginHint: "Phone number at sign-in",
    password: "password",
    balance: "10,000 GMD",
    description: "Full betting experience — wallet, deposits, Aviator bets.",
  },
  {
    id: "customer-2",
    label: "Demo Player 2",
    role: "Customer",
    login: "3020002",
    loginHint: "Phone number at sign-in",
    password: "password",
    balance: "5,000 GMD",
    description: "Direct customer (no agent) with starter balance.",
  },
  {
    id: "agent-john",
    label: "John Super",
    role: "Super agent",
    login: "john",
    loginHint: "Agent username",
    password: "password",
    description: "Agent dashboard — commissions & players (cannot bet).",
  },
  {
    id: "agent-victor",
    label: "Victor Sub",
    role: "Sub agent",
    login: "victor",
    loginHint: "Agent username",
    password: "password",
    description: "Sub-agent portal under John.",
  },
];

export type GameCategory = "all" | Game["type"];

export function filterGamesByCategory(games: Game[], category: GameCategory): Game[] {
  if (category === "all") return games;
  return games.filter((g) => g.type === category);
}
