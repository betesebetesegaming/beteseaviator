/**
 * Game documents seeded in Firestore. Player lobby shows only active QTech games
 * with a real qtechGameId.
 */
import { qtechCdnLobbyImage } from "./qtech/imageUrls";
import { IOG_LAUNCH_VALID_GAMES } from "./qtech/iogCatalog";

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

type QTechSeed = SpribeSeed;

function providerForQtechId(qtechGameId: string): string {
  const code = qtechGameId.split("-")[0]?.toUpperCase() ?? "";
  const map: Record<string, string> = {
    SPB: "Spribe",
    AVX: "Aviatrix",
    BTL: "Betsoft",
    IOG: "InOut Games",
    INO: "InOut Games",
    EVP: "Evoplay",
    EVO: "Evoplay",
    PPC: "PPC",
    SMS: "Smartsoft",
    UPG: "Upgames",
    BTV: "Betgames",
    BLC: "Blitzcrown",
    KAG: "KA Gaming",
    GZX: "Gamzix",
    GLX: "Galaxsys",
    GTT: "GameTimeTec",
    TAD: "TaDa",
    MSG: "Mascot Gaming",
    MIL: "Million Games",
    BEON: "Beon Gaming",
    BRI: "Brino Games",
    BRN: "Brino Games",
    SHK: "Shacks Evolution",
    GCO: "Gaming Corps",
    GCS: "Gaming Corps",
    PLS: "Platipus",
    PLP: "Platipus",
    YOG: "YOriginal",
    YOR: "YOriginal",
    ABR: "AbraCadabra",
  };
  return map[code] ?? code;
}

/** Spribe (SPB) games enabled on QTech for BETESE — real catalog IDs only. */
const SPRIBE_GAMES: SpribeSeed[] = [
  { qtechGameId: "SPB-aviator", name: "Aviator", type: "crash", lobbyCategory: "aviator" },
  { qtechGameId: "SPB-balloon", name: "Balloon", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "SPB-dice", name: "Dice", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SPB-goal", name: "Goal", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SPB-hilo", name: "Hilo", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SPB-hotline", name: "Hotline", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SPB-mines", name: "Mines", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SPB-pilotchicken", name: "Pilot Chicken", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "SPB-plinko", name: "Plinko", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SPB-trader", name: "Trader", type: "crash", lobbyCategory: "crash" },
];

/** Aviatrix (AVX) crash games on QTech — launch-validated. */
const AVIATRIX_GAMES: QTechSeed[] = [
  { qtechGameId: "AVX-aviatrix", name: "Aviatrix", type: "crash", lobbyCategory: "aviator" },
  { qtechGameId: "AVX-secondchance", name: "Aviatrix Second Chance", type: "crash", lobbyCategory: "crash" },
];

/** Other studios — chicken / rush titles (non-IOG). */
const OTHER_CHICKEN_GAMES: QTechSeed[] = [
  { qtechGameId: "PPC-chicken", name: "Chicken", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "PPC-spaceman", name: "Spaceman", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "BTL-chickenrun", name: "Chicken Run", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "EVP-uncrossablerush", name: "Uncrossable Rush", type: "crash", lobbyCategory: "crash" },
];

/** InOut Games (IOG) — launch-validated on BETESE QTech (no lottery/loto). */
const IOG_GAMES: QTechSeed[] = IOG_LAUNCH_VALID_GAMES.map((g) => ({
  qtechGameId: g.qtechGameId,
  name: g.name,
  type: g.type,
  lobbyCategory: g.lobbyCategory,
}));

/** Partner studios — launch-validated on api_BETESE. */
const PARTNER_GAMES: QTechSeed[] = [
  // Smartsoft (SMS)
  { qtechGameId: "SMS-jetx", name: "JetX", type: "crash", lobbyCategory: "aviator" },
  { qtechGameId: "SMS-footballx", name: "Football X", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "SMS-worldchampionx", name: "World Champion X", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "SMS-cricketx", name: "Cricket X", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "SMS-rollx", name: "Roll X", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "SMS-balloonx", name: "BalloonX", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "SMS-propelx", name: "Propel X", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "SMS-plinkox", name: "Plinko X", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SMS-towerx", name: "Tower X", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SMS-doublex", name: "Double X", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SMS-fortunecatch", name: "Fortune Catch", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SMS-chickenways", name: "Chicken Ways", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SMS-chickenhighway", name: "Chicken Highway", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SMS-cheesyroad", name: "Cheesy Road", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "SMS-cheesyroadclassic", name: "Cheesy Road Classic", type: "slots", lobbyCategory: "instantwin" },
  // Upgames (UPG)
  { qtechGameId: "UPG-dice", name: "Dice", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "UPG-hilo", name: "Hilo", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "UPG-mines", name: "Mines", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "UPG-plinko", name: "Plinko", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "UPG-aero", name: "Aero", type: "crash", lobbyCategory: "crash" },
  // Betgames (BTV)
  { qtechGameId: "BTV-plinko", name: "Plinko", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "BTV-skyward", name: "Skyward", type: "crash", lobbyCategory: "crash" },
  // Blitzcrown (BLC)
  { qtechGameId: "BLC-crash", name: "Crash", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "BLC-dragonwizardfly2win", name: "Dragon & Wizard Fly2Win", type: "crash", lobbyCategory: "crash" },
  // KA Gaming (KAG)
  { qtechGameId: "KAG-goldenbull", name: "Golden Bull", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "KAG-redbaron", name: "Red Baron", type: "crash", lobbyCategory: "crash" },
  // Gamzix (GZX)
  { qtechGameId: "GZX-pilot", name: "Pilot", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "GZX-pilotcup", name: "Pilot Cup", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "GZX-pilotcoin", name: "Pilot Coin", type: "crash", lobbyCategory: "crash" },
  // Galaxsys (GLX)
  { qtechGameId: "GLX-crash", name: "Crash", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "GLX-limbocrash", name: "Limbo Crash", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "GLX-crasher", name: "Crasher", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "GLX-rocketon", name: "Rocketon", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "GLX-cashshow", name: "Cash Show", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "GLX-hamstermania", name: "Hamster Mania", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "GLX-penalty", name: "Penalty", type: "slots", lobbyCategory: "instantwin" },
  // GameTimeTec (GTT)
  { qtechGameId: "GTT-aviatron", name: "Aviatron", type: "crash", lobbyCategory: "crash" },
  // TaDa / JiLi (TAD)
  { qtechGameId: "TAD-crashbonus", name: "Crash Bonus", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "TAD-gorush", name: "Go Rush", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "TAD-crashgoal", name: "Crash Goal", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "TAD-chickendash", name: "Chicken Dash", type: "slots", lobbyCategory: "instantwin" },
  // Mascot Gaming (MSG)
  { qtechGameId: "MSG-paperlanternscrashgame", name: "Paper Lanterns Crash", type: "crash", lobbyCategory: "crash" },
  // Million Games (MIL)
  { qtechGameId: "MIL-chickenx", name: "Chicken X", type: "slots", lobbyCategory: "instantwin" },
];

export const QTECH_GAME_SEEDS: GameSeed[] = [...SPRIBE_GAMES, ...AVIATRIX_GAMES, ...OTHER_CHICKEN_GAMES, ...IOG_GAMES, ...PARTNER_GAMES].map((g) => ({
  id: qtechGameDocId(g.qtechGameId),
  name: g.name,
  type: g.type,
  provider: providerForQtechId(g.qtechGameId),
  engine: "qtech",
  lobbyCategory: g.lobbyCategory,
  rtp: 97,
  status: "active",
  qtechGameId: g.qtechGameId,
  imageUrl: qtechCdnLobbyImage(g.qtechGameId),
  settings: {},
}));

/** Curated QTech catalog ids allowed in the player lobby. */
export const CATALOG_QTECH_GAME_ID_SET = new Set(
  QTECH_GAME_SEEDS.map((s) => String(s.qtechGameId ?? "").trim()).filter(Boolean),
);

export function isCatalogQTechGameId(qtechGameId: string): boolean {
  return CATALOG_QTECH_GAME_ID_SET.has(qtechGameId.trim());
}

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
];
