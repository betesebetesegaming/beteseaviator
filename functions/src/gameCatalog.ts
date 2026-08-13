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

/**
 * Old native / early-QTech lobby ids → current QTech lobby docs.
 * Keeps bookmarks, promo banners, and cached links working after native games were removed.
 */
export const LEGACY_GAME_ID_ALIASES: Record<string, string> = {
  aviator: "qt-spb-aviator",
  "aviator-turbo": "qt-spb-aviator",
  "qtech-aviator": "qt-spb-aviator",
  crash: "qt-spb-aviator",
  "crash-turbo": "qt-spb-aviator",
  "qtech-crash": "qt-spb-aviator",
};

export function resolveLobbyGameId(gameId: string): string {
  const id = gameId.trim();
  return LEGACY_GAME_ID_ALIASES[id] ?? id;
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
    PIX: "Pixmove",
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
    ABC: "AbraCadabra",
    "77G": "77 Gaming",
    ADL: "Ad Lunam",
    AID: "air dice",
    AMG: "Amigo Gaming",
    AUX: "AvatarUX",
    BAR: "BARBARA BANG",
    BGG: "BIGPOT Gaming",
    BLG: "blaze gaming",
  };
  return map[code] ?? code;
}

/** Spribe (SPB) games enabled on QTech for BETESE — real catalog IDs only. */
const SPRIBE_GAMES: SpribeSeed[] = [
  { qtechGameId: "SPB-aviator", name: "Aviator", type: "crash", lobbyCategory: "aviator" },
  { qtechGameId: "SPB-balloon", name: "Balloon", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "SPB-dice", name: "Dice", type: "slots", lobbyCategory: "instantwin" },
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
  // Pixmove (PIX)
  { qtechGameId: "PIX-chicknrun", name: "Chick N' Run", type: "slots", lobbyCategory: "instantwin" },
  // 77 Gaming (77G) — crash
  { qtechGameId: "77G-aviapilot", name: "Aviapilot", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "77G-flyrich", name: "Fly & Rich", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "77G-pilot", name: "Pilot", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "77G-richhammer", name: "Rich Hammer", type: "crash", lobbyCategory: "crash" },
  // AbraCadabra (ABC) — crash
  { qtechGameId: "ABC-aircraft", name: "Aircraft", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "ABC-crash", name: "Crash", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "ABC-crazyball", name: "Crazy Ball", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "ABC-crazyrocket", name: "Crazy Rocket", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "ABC-happybirdsday", name: "Happy Bird's Day", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "ABC-luckyfish", name: "Lucky Fish", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "ABC-luckyhelicopter", name: "Lucky Helicopter", type: "crash", lobbyCategory: "crash" },
  // Evoplay (EVP) — crash (EVP-uncrossablerush already seeded above)
  { qtechGameId: "EVP-footballmanager", name: "Football Manager", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "EVP-goblinrun", name: "Goblin Run", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "EVP-longball", name: "Long Ball", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "EVP-luckycrumbling", name: "Lucky Crumbling", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "EVP-highstriker", name: "High Striker", type: "crash", lobbyCategory: "crash" },
  // 77 Gaming (77G) — instant win (crash titles already seeded above)
  { qtechGameId: "77G-dicehighorlow", name: "Dice High or Low", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "77G-fencing", name: "Fencing", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "77G-flipdiving", name: "Flip Diving", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "77G-frogger", name: "Frogger", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "77G-goalshot", name: "Goal Shot", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "77G-headsortails", name: "Heads or Tails", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "77G-javlinthrow", name: "Javelin Throw", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "77G-kickthehero", name: "Kick the Hero", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "77G-mines", name: "Mines", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "77G-plinko", name: "Plinko", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "77G-powerforpunch", name: "Power for Punch", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "77G-prizedrawgame", name: "Prize Draw Game", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "77G-rockpaperscissors", name: "Rock Paper Scissors", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "77G-sprinters", name: "Sprinters", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "77G-surfing", name: "Surfing", type: "slots", lobbyCategory: "instantwin" },
  // AbraCadabra (ABC) — instant win
  { qtechGameId: "ABC-basketplinko", name: "Basket Plinko", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "ABC-coinflip", name: "Coin Flip", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "ABC-golfplinko", name: "Golf Plinko", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "ABC-grandmaroad", name: "GrandMa Road", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "ABC-hamstersmagic", name: "Hamster's Magic", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "ABC-mayanplinko", name: "Mayan Plinko", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "ABC-mines", name: "Mines", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "ABC-narcomines", name: "Narco Mines", type: "slots", lobbyCategory: "instantwin" },
  // Ad Lunam (ADL) — instant win
  { qtechGameId: "ADL-coinsweeper", name: "Coinsweeper", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "ADL-flipnspin", name: "Flip n' Spin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "ADL-pinrushx", name: "Pin Rush X", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "ADL-rockpaperscissorsdraw", name: "Rock Paper Scissors DRAW!", type: "slots", lobbyCategory: "instantwin" },
  // air dice (AID) — instant win (skip truncated sheet rows)
  { qtechGameId: "AID-cococash", name: "Coco Cash", type: "slots", lobbyCategory: "instantwin" },
  {
    qtechGameId: "AID-curvycorsairsslicindicincasual",
    name: "Curvy Corsairs Slicin' & Dicin' Casual",
    type: "slots",
    lobbyCategory: "instantwin",
  },
  {
    qtechGameId: "AID-gunslingerlegendsbountyhunter",
    name: "Gunslinger Legends: Bounty Hunter",
    type: "slots",
    lobbyCategory: "instantwin",
  },
  {
    qtechGameId: "AID-katiecombstreasuresofthelostcity",
    name: "Katie Combs – Treasures of the Lost City",
    type: "slots",
    lobbyCategory: "instantwin",
  },
  // AvatarUX (AUX) — instant win
  { qtechGameId: "AUX-majesticmeow", name: "Majestic Meow", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "AUX-toadsbounty", name: "Toad's Bounty", type: "slots", lobbyCategory: "instantwin" },
  // BARBARA BANG (BAR) — instant win
  { qtechGameId: "BAR-championsroadbb", name: "Champions Road BB", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "BAR-cricketlegacy", name: "Cricket Legacy", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "BAR-dicebb", name: "Dice BB", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "BAR-doodlecrash", name: "Doodle Crash", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "BAR-footballchampionsbb", name: "Football Champions BB", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "BAR-minesbb", name: "Mines BB", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "BAR-plinkobb", name: "Plinko BB", type: "slots", lobbyCategory: "instantwin" },
  // BetGames (BTV) — instant win (BTV-plinko already seeded)
  { qtechGameId: "BTV-luckykicks", name: "Lucky Kicks", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "BTV-penguinrush", name: "Penguin Rush", type: "slots", lobbyCategory: "instantwin" },
  // BIGPOT Gaming (BGG) — instant win
  { qtechGameId: "BGG-bountyhunter", name: "Bounty Hunter", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "BGG-highlow", name: "High Low", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "BGG-luckyrocket", name: "Lucky Rocket", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "BGG-luckyfifth", name: "Lucky Fifth", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "BGG-mazeadventure", name: "Maze Adventure", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "BGG-safarirace", name: "Safari Race", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "BGG-threezombies", name: "Three Zombies", type: "slots", lobbyCategory: "instantwin" },
  // blaze gaming (BLG) — instant win
  { qtechGameId: "BLG-frogxstormsurvival", name: "FrogX Storm Survival", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "BLG-santashilo", name: "Santas HI or LO", type: "slots", lobbyCategory: "instantwin" },
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
  "qt-spb-goal",
];
