import { logger } from "firebase-functions/v2";
import { db } from "../helpers";
import { qtechGameDocId } from "../gameCatalog";
import { getQTechAccessToken, qtechNetworkError } from "./auth";
import { getQTechSettings } from "./config";
import { qtechCdnLobbyImage } from "./imageUrls";

type QTechGameImage = { type?: string; url?: string };

type QTechGameListItem = {
  id?: string;
  images?: QTechGameImage[];
};

type QTechGameListResponse = {
  items?: QTechGameListItem[];
  links?: Array<{ href?: string; rel?: string }>;
};

/** Prefer wide banner for 4:3 lobby cards; fall back to square/round logos. */
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
        imagesById.set(id, url);
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
  return !u || u.startsWith("/promotions/");
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
