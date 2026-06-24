import crypto from "crypto";
import fs from "fs";
import path from "path";
import XLSX from "xlsx";

const WALLET_URL =
  "https://us-central1-beteseaviator-a05ae.cloudfunctions.net/qtcwApi";
const REWARDS_URL = `${WALLET_URL}/bonus/reward`;

/**
 * Single source of truth for the Pass-Key: the value deployed to the wallet
 * (functions/.env → QT_PASS_KEY). Falls back to a fresh UUID only if unset,
 * so the handover always matches what QTech will actually authenticate with.
 */
function deployedPassKey() {
  try {
    const env = fs.readFileSync(path.join("functions", ".env"), "utf8");
    const m = env.match(/^QT_PASS_KEY=(.+)$/m);
    if (m && m[1].trim()) return m[1].trim();
  } catch {
    /* ignore — fall back to a fresh key */
  }
  return crypto.randomUUID();
}
const PASS_KEY = deployedPassKey();

const VALUES_BY_ROW = {
  4: "BETESE",
  5: "https://www.beteseaviator.com/play",
  6: "BETESE Aviator",
  7: "English (en_GM)",
  8: "GMD",
  9: "Gambia",
  10: "Google Cloud Firebase (us-central1)",
  11: "Common Wallet",
  14: "To be provided if required",
  15: "Serverless (no fixed inbound IP). QTech calls our wallet URL.",
  16: "To be provided if required",
  17: "Serverless (no fixed inbound IP).",
  20: "BETESE IT — care@beteseaviator.com (update if needed)",
  21: "BETESE Finance — care@beteseaviator.com (update if needed)",
  22: "BETESE Operations — care@beteseaviator.com (update if needed)",
  23: "BETESE — care@beteseaviator.com (update if needed)",
  26: WALLET_URL,
  27: PASS_KEY,
  28: "Not implemented",
  29: REWARDS_URL,
  30: WALLET_URL,
  31: PASS_KEY,
  32: "Not implemented",
  33: REWARDS_URL,
  36: "N/A — web integration only",
  37: "N/A",
  38: "N/A",
  39: "N/A",
  40: "N/A",
  41: "N/A",
  42: "N/A",
  43: "N/A",
  44: "N/A",
};

const src =
  process.argv[2] ||
  "docs/qtech/QTech-Games-Handover-List.xlsx";
const outDir = "docs/qtech";
const outFile = path.join(outDir, "QTech-Games-Handover-List-BETESE-filled.xlsx");

const wb = XLSX.readFile(src);
const sheetName = wb.SheetNames[0];
const ws = wb.Sheets[sheetName];

for (const [row, value] of Object.entries(VALUES_BY_ROW)) {
  ws[`D${row}`] = { t: "s", v: value };
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
XLSX.writeFile(wb, outFile);

console.log("Wrote:", outFile);
console.log("Pass-Key (save in Admin → QTech & Games):", PASS_KEY);
console.log("Wallet URL:", WALLET_URL);
