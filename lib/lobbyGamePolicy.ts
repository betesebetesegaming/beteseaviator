/** BETESE player lobby — crash + instant win only (no reel slots, tables, or lottery). */

export type DisallowedLobbyKind = "lottery" | "table" | "slot";

/** QTech ids look like `SPB-aviator` / `IOG-chickenroad` (provider prefix + slug). */
export function isValidQTechGameIdFormat(qtechGameId: string): boolean {
  return /^[A-Za-z0-9]{2,10}-[A-Za-z0-9_-]+$/.test(qtechGameId.trim());
}

export function disallowedLobbyGameKind(input: {
  qtechGameId?: string | null;
  name?: string | null;
  id?: string | null;
}): DisallowedLobbyKind | null {
  const qid = String(input.qtechGameId ?? "").trim();
  const docId = String(input.id ?? "").trim();
  const name = String(input.name ?? "").trim();
  const hay = `${qid} ${docId} ${name}`.toLowerCase();
  const slug = (qid.includes("-") ? qid.split("-").slice(1).join("-") : qid).toLowerCase();
  const compact = hay.replace(/-/g, "");

  if (
    /\b(loto|lotto|lottery|keno|bingo)\b/.test(hay) ||
    /\blucky[-_]?(5|6|7)\b/.test(hay) ||
    /\blucky(5|6|7)\b/.test(hay) ||
    /lucky(5|6|7)/.test(compact)
  ) {
    return "lottery";
  }

  if (
    /\b(roulette|miniroulette|baccarat|blackjack|poker|sicbo|dragontiger|andarbahar)\b/.test(hay)
  ) {
    return "table";
  }
  if (/\bwheel\b/.test(hay) && qid.startsWith("IOG-")) return "table";
  if (/(upgwheel|btvroulette|spbminiroulette)/.test(compact)) return "table";
  if (slug === "wheel" || slug === "roulette" || slug === "baccarat" || slug === "miniroulette") {
    return "table";
  }

  if (/mineslot/.test(compact)) return "slot";
  if (
    /(multihot|bonusmania|bonanza|megaways|bookof|hammercrusher|wishoffortune|piggybar|foxjob|cockadoodle|luckymoney|jokerpyre|chickencoin|chickenroyal)/.test(
      compact
    )
  ) {
    return "slot";
  }
  if (/hot(5|7|10|20|40|100)/.test(compact) && !compact.includes("shot")) return "slot";
  if (/\bslot\b/.test(slug) && !/\b(chickenroad|plinko|mines)\b/.test(slug)) return "slot";

  return null;
}

/**
 * Policy gate for lobby games. Does NOT require the curated seed catalog —
 * admins may add any launchable crash/instant-win QTech id.
 */
export function isAllowedLobbyGame(input: {
  qtechGameId?: string | null;
  name?: string | null;
  id?: string | null;
}): boolean {
  const qid = String(input.qtechGameId ?? "").trim();
  if (!qid || !isValidQTechGameIdFormat(qid)) return false;
  return disallowedLobbyGameKind(input) === null;
}
