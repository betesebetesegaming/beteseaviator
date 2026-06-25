/** QTech provider codes + common slug probes for lobby discovery. */
export type ProviderProbeConfig = {
  code: string;
  displayName: string;
  /** Extra slugs beyond the shared list. */
  slugs?: string[];
};

const COMMON_SLUGS = [
  "aviator",
  "crash",
  "plinko",
  "mines",
  "dice",
  "hilo",
  "keno",
  "balloon",
  "limbo",
  "jetx",
  "goal",
  "wheel",
  "roulette",
  "tower",
  "chicken",
  "poker",
  "blackjack",
  "baccarat",
  "sicbo",
  "andarbahar",
  "luckyjet",
  "spaceman",
  "pilot",
  "trader",
  "hotline",
  "multikeno",
  "instant",
  "instantwin",
  "fruits",
  "bonanza",
  "sweet",
  "mega",
  "fire",
  "gold",
  "wild",
  "magic",
  "star",
  "joker",
  "slot",
  "live",
  "lobby",
  "game",
  "game1",
  "game2",
  "game3",
  "game4",
  "game5",
];

/** Studios requested for BETESE lobby — multiple code variants each. */
export const REQUESTED_PROVIDERS: ProviderProbeConfig[] = [
  { code: "BEON", displayName: "Beon Gaming", slugs: ["beon", "beon1", "beon2", "beon3", "beon4", "beon5"] },
  { code: "BON", displayName: "Beon Gaming" },
  { code: "BEO", displayName: "Beon Gaming" },
  { code: "BRI", displayName: "Brino Games", slugs: ["brino", "brino1", "brino2"] },
  { code: "BRN", displayName: "Brino Games" },
  { code: "BRG", displayName: "Brino Games" },
  { code: "SHK", displayName: "Shacks Evolution", slugs: ["shacks", "evolution", "shack"] },
  { code: "SEV", displayName: "Shacks Evolution" },
  { code: "SHV", displayName: "Shacks Evolution" },
  { code: "SHE", displayName: "Shacks Evolution" },
  { code: "BTG", displayName: "Betgames", slugs: ["betgames", "lucky7", "lucky6", "lucky5", "poker", "wheel", "baccarat", "war", "dice"] },
  { code: "BGM", displayName: "Betgames" },
  { code: "BGG", displayName: "Betgames" },
  { code: "UPG", displayName: "Upgames", slugs: ["upgames", "chicken", "chickenroad", "up"] },
  { code: "GCO", displayName: "Gaming Corps", slugs: ["gamingcorps", "corps", "raging", "zombie", "penny", "jet", "777"] },
  { code: "GCS", displayName: "Gaming Corps" },
  { code: "GCR", displayName: "Gaming Corps" },
  { code: "GCP", displayName: "Gaming Corps" },
  { code: "ABR", displayName: "AbraCadabra", slugs: ["abracadabra", "abra", "cadabra", "magic"] },
  { code: "ABC", displayName: "AbraCadabra" },
  { code: "ACD", displayName: "AbraCadabra" },
  { code: "SMS", displayName: "Smartsoft", slugs: ["smartsoft", "jetx", "balloon", "footballx", "smash", "multiplayer"] },
  { code: "SSF", displayName: "Smartsoft" },
  { code: "SMT", displayName: "Smartsoft" },
  { code: "SFS", displayName: "Smartsoft" },
  { code: "PLP", displayName: "Platipus", slugs: ["platipus", "wildspin", "aztec", "pirates", "book"] },
  { code: "PLS", displayName: "Platipus" },
  { code: "PLT", displayName: "Platipus" },
  { code: "PTU", displayName: "Platipus" },
  { code: "YOG", displayName: "YOriginal", slugs: ["yoriginal", "original", "yorig"] },
  { code: "YOR", displayName: "YOriginal" },
  { code: "YOJ", displayName: "YOriginal" },
];

export function buildProviderGameCandidates(configs: ProviderProbeConfig[] = REQUESTED_PROVIDERS): string[] {
  const ids = new Set<string>();
  for (const cfg of configs) {
    const slugs = new Set([...COMMON_SLUGS, ...(cfg.slugs ?? [])]);
    for (const slug of slugs) {
      ids.add(`${cfg.code}-${slug}`);
    }
  }
  return [...ids].sort();
}

export function providerDisplayNameFromCode(code: string): string {
  const upper = code.toUpperCase();
  const hit = REQUESTED_PROVIDERS.find((p) => p.code === upper);
  if (hit) return hit.displayName;
  const map: Record<string, string> = {
    BEON: "Beon Gaming",
    BON: "Beon Gaming",
    BRI: "Brino Games",
    BRN: "Brino Games",
    SHK: "Shacks Evolution",
    SEV: "Shacks Evolution",
    BTG: "Betgames",
    BGM: "Betgames",
    UPG: "Upgames",
    GCO: "Gaming Corps",
    GCS: "Gaming Corps",
    ABR: "AbraCadabra",
    ABC: "AbraCadabra",
    SMS: "Smartsoft",
    SSF: "Smartsoft",
    PLP: "Platipus",
    PLS: "Platipus",
    YOG: "YOriginal",
    YOR: "YOriginal",
  };
  return map[upper] ?? code;
}
