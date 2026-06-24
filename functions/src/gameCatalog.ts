/**
 * Game documents seeded in Firestore. Player lobby shows only active QTech games
 * with a real qtechGameId.
 */
import { qtechCdnLobbyImage } from "./qtech/imageUrls";

export type LobbyCategory = "aviator" | "crash" | "instantwin";

export type GameSeed = {
  id: string;
  name: string;
  type: "crash" | "slots";
  provider: string;
  engine: "qtech";
  lobbyCategory?: LobbyCategory;
  rtp: number;
  status: "active" | "inactive";
  qtechGameId?: string;
  imageUrl?: string;
  settings?: { maxMultiplier?: number; growthRate?: number };
};

/** Firestore doc id for a QTech catalog game id (matches adminAddQTechGame). */
export function qtechGameDocId(qtechGameId: string): string {
  const slug = qtechGameId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `qt-${slug}`;
}

type SpribeSeed = {
  qtechGameId: string;
  name: string;
  type: "crash" | "slots";
  lobbyCategory: LobbyCategory;
};

/** Spribe (SPB) games enabled on QTech for BETESE — real catalog IDs only. */
const SPRIBE_GAMES: SpribeSeed[] = [
  { qtechGameId: "SPB-aviator", name: "Aviator", type: "crash", lobbyCategory: "aviator" },
  { qtechGameId: "SPB-balloon", name: "Balloon", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "SPB-dice", name: "Dice", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SPB-goal", name: "Goal", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SPB-hilo", name: "Hilo", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SPB-hotline", name: "Hotline", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SPB-keno", name: "Keno", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SPB-keno80", name: "Keno 80", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SPB-mines", name: "Mines", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SPB-miniroulette", name: "Mini Roulette", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SPB-pilotchicken", name: "Pilot Chicken", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "SPB-plinko", name: "Plinko", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SPB-trader", name: "Trader", type: "crash", lobbyCategory: "crash" },
];

export const QTECH_GAME_SEEDS: GameSeed[] = SPRIBE_GAMES.map((g) => ({
  id: qtechGameDocId(g.qtechGameId),
  name: g.name,
  type: g.type,
  provider: "Spribe",
  engine: "qtech",
  lobbyCategory: g.lobbyCategory,
  rtp: 97,
  status: "active",
  qtechGameId: g.qtechGameId,
  imageUrl: qtechCdnLobbyImage(g.qtechGameId),
  settings: {},
}));

export const ALL_GAME_SEEDS: GameSeed[] = QTECH_GAME_SEEDS;

/** Removed game docs — deleted from Firestore on every lobby seed. */
export const REMOVED_LOBBY_GAME_IDS = [
  "aviator",
  "aviator-turbo",
  "crash",
  "crash-turbo",
  "qtech-aviator",
  "qtech-crash",
  "qtech-jetx",
  "qtech-lucky-jet",
  "qtech-aviator-x",
  "qtech-limbo",
  "qtech-rocket",
  "qtech-instant-keno",
  "qtech-instant-hilo",
  "qtech-plinko",
  "qtech-mines",
  "qtech-dice",
  "qtech-wheel",
  "qtech-goal",
];
