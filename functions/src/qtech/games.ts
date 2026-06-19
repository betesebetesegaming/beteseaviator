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

  const gameSnaps = await Promise.all(
    QTECH_GAME_TEMPLATES.map((t) => db.doc(`games/${t.id}`).get())
  );

  const games = QTECH_GAME_TEMPLATES.map((tpl, i) => {
    const snap = gameSnaps[i];
    const data = snap.exists ? snap.data()! : {};
    const qtechGameId = String(data.qtechGameId ?? tpl.qtechGameId ?? "").trim();
    const status = String(data.status ?? "inactive");
    return {
      id: tpl.id,
      name: String(data.name ?? tpl.name),
      status,
      qtechGameId,
      lobbyCategory: String(data.lobbyCategory ?? tpl.lobbyCategory),
      ready: status === "active" && qtechGameId.length > 0,
    };
  });

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
