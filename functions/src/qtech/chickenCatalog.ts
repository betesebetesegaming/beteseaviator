/** Candidate QTech game IDs to probe when Game List API is unavailable. */
export function buildChickenGameCandidates(): string[] {
  const providers = [
    "SPB",
    "INO",
    "INOUT",
    "IOG",
    "UPG",
    "OLP",
    "EVP",
    "EVO",
    "TUR",
    "HKS",
    "HAB",
    "BTL",
    "CGS",
    "GAL",
    "BGM",
    "BPG",
    "PPG",
    "RLX",
    "MNC",
    "NLC",
    "PPC",
    "WZN",
    "GPK",
    "YGG",
    "DSG",
    "FUG",
    "JDB",
    "KGL",
    "PLS",
    "SMK",
    "TK",
  ];

  const slugs = [
    "chick",
    "chicks",
    "chicken",
    "chickenroad",
    "chicken-road",
    "chickenroad2",
    "chicken-road-2",
    "chickenroad20",
    "chicken-road-20",
    "chickenroyal",
    "chicken-royal",
    "pilotchicken",
    "pilot-chicken",
    "chickenplinko",
    "chicken-plinko",
    "chickenshoot",
    "chicken-shoot",
    "chickenx",
    "chickencross",
    "chickencrossing",
    "chickenrush",
    "chicken-rush",
    "uncrossablerush",
    "uncrossable-rush",
    "chickenway",
    "chickenfire",
    "chickencrash",
    "chickenrun",
    "chickenroadx",
    "chickencoin",
    "chickencoop",
    "chickenjet",
    "chickenflight",
    "chickenbet",
    "chickencrossy",
    "chickensurvival",
    "chickenmania",
    "chickenfarm",
    "chickenscratch",
    "chickenhot",
    "chickencatch",
    "chickenblast",
    "chickenslot",
    "chickencrash2",
    "chickenrace",
    "chickencrossingroad",
    "chickeninvasion",
    "rabbitroad",
    "rabbit-road",
  ];

  const ids = new Set<string>();
  for (const provider of providers) {
    for (const slug of slugs) {
      ids.add(`${provider}-${slug}`);
    }
  }

  // Known catalog entries (always probe).
  for (const id of [
    "SPB-pilotchicken",
    "INO-chickenroad",
    "INO-chickenroad2",
    "IOG-chickenroad",
    "IOG-chickenroad2",
    "IOG-chicken-road",
    "IOG-chicken-road-2",
    "IOG-chickenroyal",
    "IOG-rabbitroad",
    "UPG-chicken",
    "OLP-chickenplinko",
    "EVO-uncrossablerush",
    "EVP-uncrossablerush",
    "HKS-chickensurvival",
    "TUR-chickencross",
    "PPC-chicken",
    "BTL-chickenrun",
  ]) {
    ids.add(id);
  }

  return [...ids].sort();
}

export function displayNameFromQTechId(qtechGameId: string): string {
  const raw = qtechGameId.includes("-") ? qtechGameId.split("-").slice(1).join("-") : qtechGameId;
  return raw
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bRoad2\b/g, "Road 2")
    .replace(/\bPlinko\b/g, "Plinko")
    .trim();
}

export function providerFromQTechId(qtechGameId: string): string {
  const code = qtechGameId.split("-")[0]?.toUpperCase() ?? "QTech";
  const map: Record<string, string> = {
    SPB: "Spribe",
    INO: "InOut Games",
    INOUT: "InOut Games",
    IOG: "InOut Games",
    UPG: "Upgaming",
    OLP: "OnlyPlay",
    EVO: "Evoplay",
    EVP: "Evoplay",
    TUR: "Turbo Games",
    HKS: "Hacksaw Gaming",
    HAB: "Habanero",
    BTL: "Betsoft",
  };
  return map[code] ?? code;
}
