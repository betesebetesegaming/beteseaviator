import crypto from "crypto";
import fs from "fs";
import path from "path";
import XLSX from "xlsx";

const WALLET_URL =
  "https://us-central1-beteseaviator-a05ae.cloudfunctions.net/qtcwApi";
const REWARDS_URL = `${WALLET_URL}/bonus/reward`;
const BRAND_URL = "https://www.beteseaviator.com/play";
const CASHIER_URL = "https://www.beteseaviator.com/play/wallet";
const VERIFY_TOKEN_URL = `${WALLET_URL}/qtplay/verify-token`;
// Operator office/admin public IP (detected). Add office/VPN IPs as needed.
const OFFICE_IP = "197.231.207.198";

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
  14: `${OFFICE_IP} (operator office/admin IP - add any additional office or VPN IPs)`,
  15: "Dynamic Google Cloud egress (serverless, no fixed IP). Please confirm if a static source IP is mandatory; a Cloud NAT static IP can be provisioned on request.",
  16: `${OFFICE_IP} (same office/admin IP as staging)`,
  17: "Dynamic Google Cloud egress (serverless, no fixed IP). Static Cloud NAT IP can be provisioned on request.",
  20: "Gregory — gregory@beteseaviator.com",
  21: "Gregory — gregory@beteseaviator.com",
  22: "Gregory — gregory@beteseaviator.com",
  23: "Gregory — gregory@beteseaviator.com",
  26: WALLET_URL,
  27: PASS_KEY,
  28: "Not implemented",
  29: REWARDS_URL,
  30: WALLET_URL,
  31: PASS_KEY,
  32: "Not implemented",
  33: REWARDS_URL,
  36: "BETESE",
  37: "BETESE Aviator",
  38: BRAND_URL,
  39: BRAND_URL,
  40: `${VERIFY_TOKEN_URL} (enabled on QT Play onboarding)`,
  41: `${VERIFY_TOKEN_URL} (enabled on QT Play onboarding)`,
  42: "Browser",
  43: CASHIER_URL,
  44: CASHIER_URL,
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
