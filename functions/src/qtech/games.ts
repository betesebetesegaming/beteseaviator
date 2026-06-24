import { db } from "../helpers";
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

export async function ensureQTechGameDocs(): Promise<string[]> {
  const touched: string[] = [];
  for (const seed of QTECH_GAME_SEEDS) {
    const ref = db.doc(`games/${seed.id}`);
    const patch: Record<string, unknown> = {
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
    if (seed.imageUrl) patch.imageUrl = seed.imageUrl;
    await ref.set(patch, { merge: true });
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
