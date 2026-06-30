/** InOut Games (IOG) — QTech release 2026-06-30. BETESE keeps instant win + crash only. */
export type IOGKind = "instantwin" | "crash" | "slot" | "table" | "lottery";

export type IOGSeed = {
  qtechGameId: string;
  name: string;
  kind: IOGKind;
  type: "crash" | "slots";
  lobbyCategory: "aviator" | "crash" | "instantwin";
};

/** QTech newsletter: 9 slot titles — reel games, not step-multiplier instant win. */
const IOG_SLOT_IDS = new Set([
  "IOG-jokerpyre",
  "IOG-mineslot",
  "IOG-mineslot2",
  "IOG-chickencoin",
  "IOG-chickenroyal",
]);

/** QTech newsletter: 3 table games. */
const IOG_TABLE_IDS = new Set(["IOG-wheel", "IOG-roulette", "IOG-blackjack", "IOG-baccarat"]);

export function classifyIOGGame(qtechGameId: string, name = ""): IOGKind {
  const id = qtechGameId.trim();
  const hay = `${id} ${name}`.toLowerCase();

  if (
    hay.includes("loto") ||
    hay.includes("lotto") ||
    hay.includes("lottery") ||
    hay.includes("keno") ||
    hay.includes("bingo")
  ) {
    return "lottery";
  }

  if (IOG_TABLE_IDS.has(id)) return "table";
  if (/\b(roulette|blackjack|baccarat|dragontiger|sicbo|andarbahar)\b/.test(hay)) return "table";
  if (id === "IOG-wheel") return "table";

  if (IOG_SLOT_IDS.has(id)) return "slot";
  if (/\bmineslot\b/.test(hay)) return "slot";
  if (/\b(jokerpyre|chickencoin|chickenroyal)\b/.test(hay.replace(/-/g, ""))) return "slot";

  if (id === "IOG-cricketroad" || id === "IOG-limbo" || /\b(crash|limbo)\b/.test(hay)) return "crash";

  return "instantwin";
}

export function isIOGAllowedInLobby(qtechGameId: string, name = ""): boolean {
  const kind = classifyIOGGame(qtechGameId, name);
  return kind === "instantwin" || kind === "crash";
}

/** @deprecated Use isIOGAllowedInLobby — lottery only. */
export function isIOGExcludedId(qtechGameId: string): boolean {
  return classifyIOGGame(qtechGameId) === "lottery";
}

/** Launch-validated IOG games — instant win + crash only (no slots, tables, lottery). */
export const IOG_LAUNCH_VALID_GAMES: IOGSeed[] = [
  { qtechGameId: "IOG-chickenroad", name: "Chicken Road", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-chickenroad2", name: "Chicken Road 2", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-chickenroad2bonus", name: "Chicken Road 2 Bonus", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-chickenroadbonus", name: "Chicken Road Bonus", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-chickenroadice", name: "Chicken Road Ice", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-chickenroadrace", name: "Chicken Road Race", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-chickenroadvegas", name: "Chicken Road Vegas", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-chickenroadgold", name: "Chicken Road Gold", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-chickenvszombies", name: "Chicken vs Zombies", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-rabbitroad", name: "Rabbit Road", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-cricketroad", name: "Cricket Road", kind: "crash", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "IOG-jumper", name: "Jumper", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-twist", name: "Twist", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-twistsanquentin", name: "Twist San Quentin", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-twistxmas", name: "Twist X-mas", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-triple", name: "Triple", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-limbo", name: "Limbo", kind: "crash", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "IOG-mines", name: "Mines", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-rockpaperscissors", name: "Rock Paper Scissors", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-coinflip", name: "Coin Flip", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-tower", name: "Tower", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-stairs", name: "Stairs", kind: "instantwin", type: "slots", lobbyCategory: "instantwin" },
];

export const IOG_LAUNCH_VALID_IDS = IOG_LAUNCH_VALID_GAMES.map((g) => g.qtechGameId);
