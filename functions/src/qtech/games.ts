import { db } from "../helpers";

export type QTechGameTemplate = {
  id: string;
  name: string;
  lobbyCategory: "aviator" | "crash";
  qtechGameId: string;
  rtp: number;
};

/** Default QTech lobby games — admin fills qtechGameId then activates. */
export const QTECH_GAME_TEMPLATES: QTechGameTemplate[] = [
  {
    id: "qtech-aviator",
    name: "Aviator",
    lobbyCategory: "aviator",
    qtechGameId: "",
    rtp: 97,
  },
  {
    id: "qtech-crash",
    name: "Crash",
    lobbyCategory: "crash",
    qtechGameId: "",
    rtp: 97,
  },
];

export async function ensureQTechGameDocs(): Promise<string[]> {
  const touched: string[] = [];
  for (const tpl of QTECH_GAME_TEMPLATES) {
    const ref = db.doc(`games/${tpl.id}`);
    const snap = await ref.get();
    if (snap.exists) {
      await ref.set(
        {
          name: tpl.name,
          type: "crash",
          provider: "QTech",
          engine: "qtech",
          lobbyCategory: tpl.lobbyCategory,
          rtp: tpl.rtp,
        },
        { merge: true }
      );
    } else {
      await ref.set({
        name: tpl.name,
        type: "crash",
        provider: "QTech",
        engine: "qtech",
        lobbyCategory: tpl.lobbyCategory,
        qtechGameId: tpl.qtechGameId,
        rtp: tpl.rtp,
        status: "inactive",
        settings: {},
      });
    }
    touched.push(tpl.id);
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

  // List ALL QTech games (the seeded Aviator/Crash templates plus any added
  // via Admin → QTech & Games), not just the fixed templates.
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
