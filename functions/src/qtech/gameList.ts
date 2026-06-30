import { logger } from "firebase-functions/v2";
import { db } from "../helpers";
import { QTECH_GAME_SEEDS, qtechGameDocId } from "../gameCatalog";
import { excludeLobbyGameId, removeGameFromLobbyLayout } from "../lobbyExclusions";
import { disallowedLobbyGameKind, isAllowedLobbyGame } from "../lobbyGamePolicy";
import { getQTechAccessToken, qtechNetworkError } from "./auth";
import { getQTechSettings } from "./config";
import {
  buildChickenGameCandidates,
  displayNameFromQTechId,
  providerFromQTechId,
} from "./chickenCatalog";
import { qtechCdnLobbyImage } from "./imageUrls";

type QTechGameImage = { type?: string; url?: string };

type QTechGameListItem = {
  id?: string;
  name?: string;
  category?: string;
  provider?: { id?: string; name?: string };
  images?: QTechGameImage[];
};

type QTechGameListResponse = {
  items?: QTechGameListItem[];
  links?: Array<{ href?: string; rel?: string }>;
};

/** Prefer fast banner thumbnails for lobby sync. */
export function pickLobbyImageUrl(images: QTechGameImage[] | undefined): string | undefined {
  if (!images?.length) return undefined;
  const order = ["banner", "logo-square", "logo-round"];
  for (const type of order) {
    const hit = images.find((img) => img.type === type && img.url?.trim());
    if (hit?.url) return withLobbyImageWidth(hit.url.trim());
  }
  const fallback = images.find((img) => img.url?.trim());
  return fallback?.url ? withLobbyImageWidth(fallback.url.trim()) : undefined;
}

function withLobbyImageWidth(url: string, width = 640): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("width")) {
      parsed.searchParams.set("width", String(width));
    }
    if (parsed.searchParams.get("type") === "banner") {
      parsed.searchParams.set("showIcon", "true");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

async function fetchGameListPage(
  cfg: Awaited<ReturnType<typeof getQTechSettings>>,
  token: string,
  path: string,
): Promise<QTechGameListResponse> {
  const url = path.startsWith("http") ? path : `${cfg.apiBaseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Accept-Language": cfg.lang.includes("_") ? cfg.lang.replace("_", "-") : cfg.lang,
      },
    });
  } catch (e) {
    throw qtechNetworkError(e);
  }

  const body = (await res.json().catch(() => ({}))) as QTechGameListResponse & Record<string, unknown>;
  if (!res.ok) {
    logger.error("QTech game list failed", { status: res.status, body, path });
    throw new Error(String(body.message || body.code || `QTech game list HTTP ${res.status}`));
  }
  return body;
}

export type QTechCatalogGame = {
  id: string;
  name: string;
  category: string;
  providerId: string;
  providerName: string;
};

function parseCatalogItem(item: QTechGameListItem): QTechCatalogGame | null {
  const id = String(item.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    name: String(item.name ?? id).trim(),
    category: String(item.category ?? "").trim(),
    providerId: String(item.provider?.id ?? "").trim(),
    providerName: String(item.provider?.name ?? item.provider?.id ?? "QTech").trim(),
  };
}

/** Paginate QTech /v2/games for specific providers and filter by keyword. */
export async function searchQTechCatalogByProviders(
  providers: string,
  keyword: string,
): Promise<QTechCatalogGame[]> {
  const cfg = await getQTechSettings();
  if (!cfg.apiBaseUrl || !cfg.operatorId || !cfg.apiPassword) {
    throw new Error("QTech API credentials are not configured.");
  }

  const token = await getQTechAccessToken(cfg);
  const needle = keyword.trim().toLowerCase();
  const matches: QTechCatalogGame[] = [];
  const seen = new Set<string>();

  let path = `/v2/games?size=1000&includeFields=id,name,category,provider&providers=${encodeURIComponent(providers)}&sortBy=name&orderBy=ASC`;
  let pages = 0;

  while (path && pages < 50) {
    pages += 1;
    const page = await fetchGameListPage(cfg, token, path);
    for (const raw of page.items ?? []) {
      const item = parseCatalogItem(raw);
      if (!item) continue;
      const hay = `${item.id} ${item.name}`.toLowerCase();
      if (needle && !hay.includes(needle)) continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      matches.push(item);
    }
    const next = (page.links ?? []).find((link) => link.rel === "next" && link.href?.trim());
    path = next?.href?.trim() ?? "";
  }

  matches.sort((a, b) => a.name.localeCompare(b.name));
  return matches;
}

/** Paginate QTech /v2/games and filter by keyword in id or name. */
export async function searchQTechCatalog(keyword: string): Promise<QTechCatalogGame[]> {
  const cfg = await getQTechSettings();
  if (!cfg.apiBaseUrl || !cfg.operatorId || !cfg.apiPassword) {
    throw new Error("QTech API credentials are not configured.");
  }

  const token = await getQTechAccessToken(cfg);
  const needle = keyword.trim().toLowerCase();
  const matches: QTechCatalogGame[] = [];
  const seen = new Set<string>();

  let path =
    "/v2/games?size=1000&includeFields=id,name,category,provider&sortBy=name&orderBy=ASC";
  let pages = 0;

  while (path && pages < 50) {
    pages += 1;
    const page = await fetchGameListPage(cfg, token, path);
    for (const raw of page.items ?? []) {
      const item = parseCatalogItem(raw);
      if (!item) continue;
      const hay = `${item.id} ${item.name}`.toLowerCase();
      if (needle && !hay.includes(needle)) continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      matches.push(item);
    }
    const next = (page.links ?? []).find((link) => link.rel === "next" && link.href?.trim());
    path = next?.href?.trim() ?? "";
  }

  matches.sort((a, b) => a.name.localeCompare(b.name));
  return matches;
}

export function inferLobbyCategory(game: Pick<QTechCatalogGame, "id" | "name" | "category">): "aviator" | "crash" | "instantwin" {
  const cat = game.category.toUpperCase();
  const label = `${game.id} ${game.name}`.toLowerCase();
  if (label.includes("aviator")) return "aviator";
  if (cat.includes("CRASH")) return "crash";
  return "instantwin";
}

export function inferGameType(game: Pick<QTechCatalogGame, "category">): "crash" | "slots" {
  return game.category.toUpperCase().includes("CRASH") ? "crash" : "slots";
}

/** Write QTech catalog matches into Firestore lobby (active, with CDN thumbnail). */
export async function importQTechGamesToLobby(games: QTechCatalogGame[]): Promise<{
  imported: string[];
  skipped: string[];
}> {
  const cfg = await getQTechSettings();
  const imported: string[] = [];
  const skipped: string[] = [];

  for (const game of games) {
    if (!isAllowedLobbyGame({ qtechGameId: game.id, name: game.name })) {
      skipped.push(game.id);
      logger.info("Skipped disallowed lobby game on import", {
        qtechGameId: game.id,
        name: game.name,
        kind: disallowedLobbyGameKind({ qtechGameId: game.id, name: game.name }),
      });
      continue;
    }
    const docId = qtechGameDocId(game.id);
    const ref = db.doc(`games/${docId}`);
    const existing = await ref.get();
    if (existing.exists && String(existing.data()?.qtechGameId ?? "") === game.id) {
      skipped.push(docId);
    }
    await ref.set(
      {
        name: game.name,
        type: inferGameType(game),
        provider: game.providerName || game.providerId || "QTech",
        engine: "qtech",
        lobbyCategory: inferLobbyCategory(game),
        qtechGameId: game.id,
        rtp: 97,
        status: "active",
        imageUrl: qtechCdnLobbyImage(game.id, cfg.lang),
        settings: {},
      },
      { merge: true },
    );
    imported.push(docId);
    logger.info("Imported QTech lobby game", { docId, qtechGameId: game.id, name: game.name });
  }

  return { imported, skipped };
}

/** Debug probe — returns HTTP status for launch (demo) and bet-values per id. */
export async function probeQTechGameIds(ids: string[]): Promise<
  Array<{ id: string; betValuesStatus: number; launchStatus: number; launchUrl?: string }>
> {
  const cfg = await getQTechSettings();
  if (!cfg.apiBaseUrl || !cfg.operatorId || !cfg.apiPassword) {
    throw new Error("QTech API credentials are not configured.");
  }
  const token = await getQTechAccessToken(cfg);

  return Promise.all(
    ids.map(async (raw) => {
      const id = raw.trim();
      let betValuesStatus = 0;
      try {
        const bv = await fetch(`${cfg.apiBaseUrl}/v1/games/${encodeURIComponent(id)}/bet-values`, {
          method: "GET",
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        });
        betValuesStatus = bv.status;
      } catch {
        betValuesStatus = -1;
      }

      let launchStatus = 0;
      let launchUrl: string | undefined;
      try {
        const launch = await fetch(`${cfg.apiBaseUrl}/v1/games/${encodeURIComponent(id)}/launch-url`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            playerId: "catalog-probe",
            currency: cfg.currency,
            country: cfg.country,
            lang: cfg.lang,
            mode: "demo",
            device: "desktop",
            returnUrl: cfg.lobbyUrl,
          }),
        });
        launchStatus = launch.status;
        if (launch.ok) {
          const body = (await launch.json().catch(() => ({}))) as Record<string, unknown>;
          launchUrl = String(body.url ?? "").trim() || undefined;
        }
      } catch {
        launchStatus = -1;
      }

      return { id, betValuesStatus, launchStatus, launchUrl };
    }),
  );
}

/** Import explicit QTech game IDs (e.g. pasted from QTech back office). */
export async function importQTechGamesByIds(ids: string[]): Promise<{
  games: QTechCatalogGame[];
  importResult: { imported: string[]; skipped: string[] };
}> {
  const games: QTechCatalogGame[] = ids
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => ({
      id,
      name: displayNameFromQTechId(id),
      category:
        id.toLowerCase().includes("crash") || id.includes("aviator") || id.includes("pilot")
          ? "CASINO/CRASH"
          : "CASINO/INSTANTWIN",
      providerId: id.split("-")[0] ?? "",
      providerName: providerFromQTechId(id),
    }));
  const importResult = await importQTechGamesToLobby(games);
  return { games, importResult };
}

/** Import all launch-validated InOut (IOG) instant win + crash games. */
export async function importIOGProviderGames(): Promise<{
  ids: string[];
  importResult: { imported: string[]; skipped: string[] };
  imageSync: Awaited<ReturnType<typeof syncQTechLobbyImages>>;
}> {
  const { IOG_LAUNCH_VALID_IDS, isIOGAllowedInLobby } = await import("./iogCatalog");
  const ids = IOG_LAUNCH_VALID_IDS.filter((id) => isIOGAllowedInLobby(id));
  const { games, importResult } = await importQTechGamesByIds(ids);
  const imageSync = await syncQTechLobbyImages();
  logger.info("importIOGProviderGames", { count: games.length, importResult, imageSync });
  return { ids, importResult, imageSync };
}

/** Remove slot, table, and lottery games from the lobby (all providers). */
export async function purgeDisallowedLobbyGames(): Promise<{
  removed: Array<{ docId: string; qtechGameId: string; kind: string }>;
  kept: string[];
}> {
  const snap = await db.collection("games").where("engine", "==", "qtech").get();
  const removed: Array<{ docId: string; qtechGameId: string; kind: string }> = [];
  const kept: string[] = [];

  for (const doc of snap.docs) {
    const qtechGameId = String(doc.data().qtechGameId ?? "").trim();
    const name = String(doc.data().name ?? "");
    const kind = disallowedLobbyGameKind({ qtechGameId, name, id: doc.id });
    if (!kind) {
      kept.push(doc.id);
      continue;
    }
    await permanentlyRemoveLobbyGame(doc.id);
    removed.push({ docId: doc.id, qtechGameId, kind });
    logger.info("Removed disallowed lobby game", { docId: doc.id, qtechGameId, name, kind });
  }

  return { removed, kept };
}

/** Remove games outside the curated catalog (auto-imports with broken provider iframes). */
export async function purgeNonCatalogLobbyGames(): Promise<{
  removed: Array<{ docId: string; qtechGameId: string }>;
  kept: string[];
}> {
  const { isCatalogQTechGameId } = await import("../gameCatalog");
  const snap = await db.collection("games").where("engine", "==", "qtech").get();
  const removed: Array<{ docId: string; qtechGameId: string }> = [];
  const kept: string[] = [];

  for (const doc of snap.docs) {
    const qtechGameId = String(doc.data().qtechGameId ?? "").trim();
    if (qtechGameId && isCatalogQTechGameId(qtechGameId)) {
      kept.push(doc.id);
      continue;
    }
    await permanentlyRemoveLobbyGame(doc.id);
    removed.push({ docId: doc.id, qtechGameId: qtechGameId || doc.id });
    logger.info("Removed non-catalog lobby game", { docId: doc.id, qtechGameId });
  }

  return { removed, kept };
}

/** @deprecated Use purgeDisallowedLobbyGames — IOG-only purge. */
export async function purgeIOGDisallowedGames(): Promise<{
  removed: string[];
  kept: string[];
}> {
  const result = await purgeDisallowedLobbyGames();
  return {
    removed: result.removed.map((r) => r.docId),
    kept: result.kept,
  };
}

export async function discoverChickenGamesViaLaunch(): Promise<QTechCatalogGame[]> {
  const cfg = await getQTechSettings();
  if (!cfg.apiBaseUrl || !cfg.operatorId || !cfg.apiPassword) {
    throw new Error("QTech API credentials are not configured.");
  }

  const candidates = buildChickenGameCandidates();
  const valid: QTechCatalogGame[] = [];
  const seen = new Set<string>();
  const concurrency = 24;

  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    const probes = await probeQTechGameIds(batch);
    for (const probe of probes) {
      const launchOk = probe.launchStatus === 200 && Boolean(probe.launchUrl);
      if (!launchOk) continue;
      if (seen.has(probe.id)) continue;
      seen.add(probe.id);
      const game: QTechCatalogGame = {
        id: probe.id,
        name: displayNameFromQTechId(probe.id),
        category:
          probe.id.toLowerCase().includes("crash") ||
          probe.id.includes("aviator") ||
          probe.id.includes("pilot")
            ? "CASINO/CRASH"
            : "CASINO/INSTANTWIN",
        providerId: probe.id.split("-")[0] ?? "",
        providerName: providerFromQTechId(probe.id),
      };
      valid.push(game);
      logger.info("Discovered chicken game", {
        id: probe.id,
        launchOk,
      });
    }
  }

  valid.sort((a, b) => a.name.localeCompare(b.name));
  return valid;
}

async function fetchFromGameListApi(wantedIds?: Set<string>): Promise<Map<string, string>> {
  const cfg = await getQTechSettings();
  const token = await getQTechAccessToken(cfg);
  const imagesById = new Map<string, string>();
  const wanted = wantedIds ? new Set([...wantedIds].map((id) => id.trim()).filter(Boolean)) : null;

  let path =
    "/v2/games?size=500&includeFields=id,images&providers=SPB&sortBy=name&orderBy=ASC";
  let pages = 0;

  while (path && pages < 20) {
    pages += 1;
    const page = await fetchGameListPage(cfg, token, path);
    for (const item of page.items ?? []) {
      const id = String(item.id ?? "").trim();
      if (!id) continue;
      const imageUrl = pickLobbyImageUrl(item.images);
      if (imageUrl) imagesById.set(id, imageUrl);
    }

    if (wanted && [...wanted].every((id) => imagesById.has(id))) {
      break;
    }

    const next = (page.links ?? []).find((link) => link.rel === "next" && link.href?.trim());
    path = next?.href?.trim() ?? "";
  }

  return imagesById;
}

/** Resolve lobby thumbnails — CDN always; Game List API enriches when available. */
export async function fetchQTechGameImagesById(
  wantedIds?: Set<string>,
): Promise<Map<string, string>> {
  const cfg = await getQTechSettings();
  const imagesById = new Map<string, string>();
  const ids = wantedIds ? [...wantedIds].map((id) => id.trim()).filter(Boolean) : [];

  for (const id of ids) {
    imagesById.set(id, qtechCdnLobbyImage(id, cfg.lang));
  }

  if (cfg.apiBaseUrl && cfg.operatorId && cfg.apiPassword) {
    try {
      const fromApi = await fetchFromGameListApi(wantedIds);
      for (const [id, url] of fromApi) {
        const isBannerOnly = url.includes("type=banner");
        if (!isBannerOnly) {
          imagesById.set(id, url);
        }
      }
    } catch (e) {
      logger.warn("QTech Game List API unavailable — using CDN thumbnails", {
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return imagesById;
}

export type SyncQTechImagesResult = {
  updated: string[];
  skipped: string[];
  missing: string[];
};

function isMissingThumbnail(url: string | undefined): boolean {
  const u = url?.trim() ?? "";
  if (!u || u.startsWith("/promotions/")) return true;
  if (u.includes("client.qtlauncher.com")) {
    if (u.includes("type=logo-square") || u.includes("type=logo-round")) return true;
    if (u.includes("width=640")) return true;
    if (u.includes("type=banner") && !u.includes("showIcon=true")) return true;
  }
  return false;
}

/** Writes QTech CDN thumbnail URLs onto matching Firestore `games/*` docs. */
export async function syncQTechLobbyImages(): Promise<SyncQTechImagesResult> {
  const snap = await db.collection("games").where("engine", "==", "qtech").get();
  const byQtechId = new Map<string, { docId: string; existing?: string }>();

  for (const doc of snap.docs) {
    const qtechGameId = String(doc.data().qtechGameId ?? "").trim();
    if (!qtechGameId) continue;
    byQtechId.set(qtechGameId, {
      docId: doc.id,
      existing: String(doc.data().imageUrl ?? "").trim() || undefined,
    });
  }

  if (byQtechId.size === 0) {
    return { updated: [], skipped: [], missing: [] };
  }

  const catalog = await fetchQTechGameImagesById(new Set(byQtechId.keys()));
  const updated: string[] = [];
  const skipped: string[] = [];
  const missing: string[] = [];

  for (const [qtechGameId, meta] of byQtechId) {
    const imageUrl = catalog.get(qtechGameId);
    if (!imageUrl) {
      missing.push(qtechGameId);
      continue;
    }
    if (meta.existing === imageUrl && !isMissingThumbnail(meta.existing)) {
      skipped.push(meta.docId);
      continue;
    }
    await db.doc(`games/${meta.docId}`).set({ imageUrl }, { merge: true });
    updated.push(meta.docId);
    logger.info("Synced QTech lobby image", { docId: meta.docId, qtechGameId, imageUrl });
  }

  return { updated, skipped, missing };
}

/** Fetch a single game's thumbnail when adding by catalog id. */
export async function fetchQTechImageForGameId(qtechGameId: string): Promise<string | undefined> {
  const id = qtechGameId.trim();
  if (!id) return undefined;
  const cfg = await getQTechSettings();
  const map = await fetchQTechGameImagesById(new Set([id]));
  return map.get(id) ?? qtechCdnLobbyImage(id, cfg.lang);
}

/** Resolve Firestore doc id for a QTech catalog id (used when seeding). */
export function firestoreIdForQTechGame(qtechGameId: string): string {
  return qtechGameDocId(qtechGameId);
}

export type ReconcileLobbyGamesResult = {
  catalogSynced: string[];
  activated: string[];
  removed: string[];
  probed: number;
};

async function permanentlyRemoveLobbyGame(docId: string): Promise<void> {
  await excludeLobbyGameId(docId);
  await removeGameFromLobbyLayout(docId);
  await db.doc(`games/${docId}`).delete();
}

/** Sync catalog seeds, then hide any active game whose QTech ID cannot launch (demo). */
export async function reconcileQTechLobbyGames(): Promise<ReconcileLobbyGamesResult> {
  const { ensureQTechGameDocs } = await import("./games");
  await ensureQTechGameDocs();

  const catalogDocIds = new Set(QTECH_GAME_SEEDS.map((s) => s.id));
  const catalogQtechIds = new Set(
    QTECH_GAME_SEEDS.map((s) => String(s.qtechGameId ?? "").trim()).filter(Boolean),
  );

  const snap = await db.collection("games").where("engine", "==", "qtech").get();
  const activated: string[] = [];
  const removed: string[] = [];
  const catalogSynced = [...catalogDocIds];
  let probed = 0;

  const toProbe: Array<{ docId: string; qtechGameId: string }> = [];
  for (const doc of snap.docs) {
    const qtechGameId = String(doc.data().qtechGameId ?? "").trim();
    const name = String(doc.data().name ?? "");
    const disallowed = disallowedLobbyGameKind({ qtechGameId, name, id: doc.id });
    if (disallowed) {
      await permanentlyRemoveLobbyGame(doc.id);
      removed.push(doc.id);
      logger.warn("Removed disallowed lobby game during reconcile", {
        docId: doc.id,
        qtechGameId,
        kind: disallowed,
      });
      continue;
    }
    if (!qtechGameId) {
      if (!catalogDocIds.has(doc.id)) {
        await permanentlyRemoveLobbyGame(doc.id);
        removed.push(doc.id);
      }
      continue;
    }
    if (catalogDocIds.has(doc.id) || catalogQtechIds.has(qtechGameId)) {
      if (doc.data().status !== "active") {
        await doc.ref.set({ status: "active" }, { merge: true });
        activated.push(doc.id);
      }
      continue;
    }
    toProbe.push({ docId: doc.id, qtechGameId });
  }

  const concurrency = 20;
  for (let i = 0; i < toProbe.length; i += concurrency) {
    const batch = toProbe.slice(i, i + concurrency);
    const probes = await probeQTechGameIds(batch.map((g) => g.qtechGameId));
    probed += probes.length;
    for (const probe of probes) {
      const meta = batch.find((g) => g.qtechGameId === probe.id);
      if (!meta) continue;
      const launchOk = probe.launchStatus === 200 && Boolean(probe.launchUrl);
      if (launchOk) {
        if ((await db.doc(`games/${meta.docId}`).get()).data()?.status !== "active") {
          await db.doc(`games/${meta.docId}`).set({ status: "active" }, { merge: true });
          activated.push(meta.docId);
        }
        continue;
      }
      await permanentlyRemoveLobbyGame(meta.docId);
      removed.push(meta.docId);
      logger.warn("Removed game — QTech launch failed", {
        docId: meta.docId,
        qtechGameId: probe.id,
        launchStatus: probe.launchStatus,
      });
    }
  }

  return { catalogSynced, activated, removed, probed };
}

/** Delete inactive / non-catalog QTech games left over from bad auto-imports. */
export async function purgeBrokenLobbyGames(): Promise<{ deleted: string[]; kept: string[] }> {
  const catalogDocIds = new Set(QTECH_GAME_SEEDS.map((s) => s.id));
  const catalogQtechIds = new Set(
    QTECH_GAME_SEEDS.map((s) => String(s.qtechGameId ?? "").trim()).filter(Boolean),
  );

  const snap = await db.collection("games").where("engine", "==", "qtech").get();
  const deleted: string[] = [];
  const kept: string[] = [];

  for (const doc of snap.docs) {
    const qtechGameId = String(doc.data().qtechGameId ?? "").trim();
    if (catalogDocIds.has(doc.id) || (qtechGameId && catalogQtechIds.has(qtechGameId))) {
      kept.push(doc.id);
      continue;
    }
    await permanentlyRemoveLobbyGame(doc.id);
    deleted.push(doc.id);
  }

  return { deleted, kept };
}
