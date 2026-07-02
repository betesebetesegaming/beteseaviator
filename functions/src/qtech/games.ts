import { db } from "../helpers";
import { getExcludedLobbyGameIds } from "../lobbyExclusions";
import { QTECH_GAME_SEEDS, type GameSeed } from "../gameCatalog";

export type QTechGameTemplate = Pick<
  GameSeed,
  "id" | "name" | "lobbyCategory" | "qtechGameId" | "rtp"
>;

/** @deprecated Use QTECH_GAME_SEEDS from gameCatalog.ts */
export const QTECH_GAME_TEMPLATES: QTechGameTemplate[] = QTECH_GAME_SEEDS.map((g) => ({
  id: g.id,
  name: g.name,
  lobbyCategory: g.lobbyCategory,
  qtechGameId: g.qtechGameId ?? "",
  rtp: g.rtp,
}));

function seedDocFromCatalog(seed: GameSeed): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    name: seed.name,
    type: seed.type,
    provider: seed.provider,
    engine: seed.engine,
    lobbyCategory: seed.lobbyCategory,
    rtp: seed.rtp,
    settings: seed.settings ?? {},
    qtechGameId: seed.qtechGameId ?? "",
    status: seed.status,
  };
  if (seed.imageUrl) doc.imageUrl = seed.imageUrl;
  return doc;
}

/** Backfill catalog fields — catalog seed is source of truth for lobby metadata. */
function backfillPatch(existing: FirebaseFirestore.DocumentData, seed: GameSeed): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const seedQtechId = String(seed.qtechGameId ?? "").trim();
  const existingQtechId = String(existing.qtechGameId ?? "").trim();
  if (seedQtechId && existingQtechId !== seedQtechId) {
    patch.qtechGameId = seedQtechId;
  }
  if (!String(existing.imageUrl ?? "").trim() && seed.imageUrl) {
    patch.imageUrl = seed.imageUrl;
  }
  if (!existing.engine) patch.engine = seed.engine;
  if (seed.lobbyCategory && existing.lobbyCategory !== seed.lobbyCategory) {
    patch.lobbyCategory = seed.lobbyCategory;
  }
  if (seed.provider && existing.provider !== seed.provider) patch.provider = seed.provider;
  if (seed.type && existing.type !== seed.type) patch.type = seed.type;
  if (seed.name && existing.name !== seed.name) patch.name = seed.name;
  if (seed.status === "active" && existing.status !== "active") {
    patch.status = "active";
  }
  return patch;
}

export async function ensureQTechGameDocs(): Promise<string[]> {
  const excluded = await getExcludedLobbyGameIds();
  const touched: string[] = [];
  for (const seed of QTECH_GAME_SEEDS) {
    const ref = db.doc(`games/${seed.id}`);
    if (excluded.has(seed.id)) {
      if ((await ref.get()).exists) await ref.delete();
      continue;
    }
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set(seedDocFromCatalog(seed));
      touched.push(seed.id);
      continue;
    }
    const patch = backfillPatch(snap.data()!, seed);
    if (Object.keys(patch).length > 0) {
      await ref.set(patch, { merge: true });
    }
    touched.push(seed.id);
  }
  return touched;
}

export async function getQTechSetupStatus(): Promise<{
  walletUrl: string;
  walletReady: boolean;
  launchReady: boolean;
  integrationEnabled: boolean;
  missing: string[];
  games: Array<{
    id: string;
    name: string;
    status: string;
    qtechGameId: string;
    lobbyCategory: string;
    imageUrl: string;
    ready: boolean;
  }>;
}> {
  const { getQTechSettings } = await import("./config");
  const cfg = await getQTechSettings();
  const missing: string[] = [];

  if (!cfg.passKey) missing.push("Wallet Pass-Key");
  if (!cfg.apiBaseUrl) missing.push("QTech API base URL");
  if (!cfg.operatorId) missing.push("Operator ID");
  if (!cfg.apiPassword) missing.push("API password");

  const walletReady = Boolean(cfg.passKey);
  const launchReady = Boolean(cfg.enabled && cfg.apiBaseUrl && cfg.operatorId && cfg.apiPassword);
  if (cfg.enabled && !launchReady) {
    if (!cfg.apiBaseUrl) missing.push("API base URL (required when launch is enabled)");
    if (!cfg.operatorId) missing.push("Operator ID (required when launch is enabled)");
    if (!cfg.apiPassword) missing.push("API password (required when launch is enabled)");
  }

  const qtechSnap = await db.collection("games").where("engine", "==", "qtech").get();
  const games = qtechSnap.docs
    .map((d) => {
      const data = d.data();
      const qtechGameId = String(data.qtechGameId ?? "").trim();
      const status = String(data.status ?? "inactive");
      return {
        id: d.id,
        name: String(data.name ?? d.id),
        status,
        qtechGameId,
        lobbyCategory: String(data.lobbyCategory ?? ""),
        imageUrl: String(data.imageUrl ?? ""),
        ready: status === "active" && qtechGameId.length > 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "beteseaviator-a05ae";
  const walletUrl = `https://us-central1-${projectId}.cloudfunctions.net/qtcwApi`;

  return {
    walletUrl,
    walletReady,
    launchReady,
    integrationEnabled: cfg.enabled,
    missing: [...new Set(missing)],
    games,
  };
}
