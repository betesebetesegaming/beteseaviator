/** InOut Games (IOG) — QTech release 2026-06-30. Launch-validated on api_BETESE. */
export type IOGSeed = {
  qtechGameId: string;
  name: string;
  type: "crash" | "slots";
  lobbyCategory: "aviator" | "crash" | "instantwin";
};

/** Skip lottery / loto titles — not wanted in BETESE lobby. */
export function isIOGExcludedId(qtechGameId: string): boolean {
  const hay = qtechGameId.toLowerCase();
  return (
    hay.includes("loto") ||
    hay.includes("lotto") ||
    hay.includes("lottery") ||
    hay.includes("keno")
  );
}

/** Games confirmed to launch (demo) on BETESE QTech — excludes Frog Road & MegaBlock (404). */
export const IOG_LAUNCH_VALID_GAMES: IOGSeed[] = [
  { qtechGameId: "IOG-chickenroad", name: "Chicken Road", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-chickenroad2", name: "Chicken Road 2", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-chickenroad2bonus", name: "Chicken Road 2 Bonus", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-chickenroadbonus", name: "Chicken Road Bonus", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-chickenroadice", name: "Chicken Road Ice", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-chickenroadrace", name: "Chicken Road Race", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-chickenroadvegas", name: "Chicken Road Vegas", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-chickenroadgold", name: "Chicken Road Gold", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-chickenvszombies", name: "Chicken vs Zombies", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-chickenroyal", name: "Chicken Royal", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-chickencoin", name: "Chicken Coin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-rabbitroad", name: "Rabbit Road", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-cricketroad", name: "Cricket Road", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "IOG-jumper", name: "Jumper", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-twist", name: "Twist", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-twistsanquentin", name: "Twist San Quentin", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-twistxmas", name: "Twist X-mas", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-triple", name: "Triple", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-limbo", name: "Limbo", type: "crash", lobbyCategory: "crash" },
  { qtechGameId: "IOG-mines", name: "Mines", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-mineslot", name: "Mine Slot", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-mineslot2", name: "Mine Slot 2", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-jokerpyre", name: "Joker Pyre", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-rockpaperscissors", name: "Rock Paper Scissors", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-coinflip", name: "Coin Flip", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-tower", name: "Tower", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-stairs", name: "Stairs", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-wheel", name: "Wheel", type: "slots", lobbyCategory: "instantwin" },
  { qtechGameId: "IOG-roulette", name: "Roulette", type: "slots", lobbyCategory: "instantwin" },
];

export const IOG_LAUNCH_VALID_IDS = IOG_LAUNCH_VALID_GAMES.map((g) => g.qtechGameId);
