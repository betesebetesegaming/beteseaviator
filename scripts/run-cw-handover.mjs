#!/usr/bin/env node
/**
 * Run QTech Common Wallet certification on production, write:
 *   docs/qtech/cw_qtcw_tester.cfg
 *   docs/qtech/CW-TEST-RESULTS.txt
 * Optionally runs the official Python tester (cw_qtcw_tester.py all).
 *
 * Usage:
 *   node scripts/run-cw-handover.mjs
 *   node scripts/run-cw-handover.mjs --playerUid=ABC123
 *   node scripts/run-cw-handover.mjs --python
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DOCS = path.join(ROOT, "docs", "qtech");
const BOOTSTRAP_KEY = "beteseaviator-reset-2026";
const WALLET_BASE =
  "https://us-central1-beteseaviator-a05ae.cloudfunctions.net/qtcwApi";

const playerArg = process.argv.find((a) => a.startsWith("--playerUid="));
const playerUid = playerArg ? playerArg.split("=")[1] : "";
const runPython = process.argv.includes("--python");

const url = new URL(`${WALLET_BASE}/bootstrap/run-cw-certification`);
url.searchParams.set("key", BOOTSTRAP_KEY);
if (playerUid) url.searchParams.set("playerUid", playerUid);

console.log("Running Common Wallet certification…");
console.log(url.toString().replace(BOOTSTRAP_KEY, "***"));

const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
const body = await res.json();

if (!res.ok) {
  console.error("Certification request failed:", body);
  process.exit(1);
}

const { testResult, cfg, endpoints } = body;
const cfgPath = path.join(DOCS, "cw_qtcw_tester.cfg");
const resultsPath = path.join(DOCS, "CW-TEST-RESULTS.txt");

fs.mkdirSync(DOCS, { recursive: true });
fs.writeFileSync(cfgPath, cfg, "utf8");

const lines = [
  "BETESE Aviator — QTech Common Wallet Certification",
  `Date: ${new Date().toISOString()}`,
  `Wallet URL: ${testResult.walletUrl}`,
  `Player ID: ${testResult.playerId}`,
  `Active session: ${testResult.sessions?.active ?? "n/a"}`,
  `Expired session: ${testResult.sessions?.expired ?? "n/a"}`,
  `Duration: ${Math.round((testResult.durationMs ?? 0) / 1000)}s`,
  `Overall: ${testResult.ok ? "PASSED" : "FAILED"}`,
  "",
  "Implemented endpoints:",
  ...endpoints.map((e) => `  ${e.method.padEnd(6)} ${e.path} — ${e.purpose}`),
  "",
  "Test steps:",
  ...(testResult.steps ?? []).map((s) => `  ${s.ok ? "PASS" : "FAIL"} — ${s.name}${s.detail ? ` (${s.detail})` : ""}`),
];

if (testResult.error) {
  lines.push("", `Error: ${testResult.error}`);
}

fs.writeFileSync(resultsPath, lines.join("\n") + "\n", "utf8");

console.log("\nWrote:", cfgPath);
console.log("Wrote:", resultsPath);
console.log("\n" + lines.join("\n"));

if (!testResult.ok) {
  process.exit(1);
}

if (runPython) {
  console.log("\nRunning official QTech Python tester (all)…");
  const py = spawnSync("python", ["cw_qtcw_tester.py", "all"], {
    cwd: DOCS,
    encoding: "utf8",
    timeout: 300_000,
  });
  if (py.stdout) process.stdout.write(py.stdout);
  if (py.stderr) process.stderr.write(py.stderr);
  fs.appendFileSync(resultsPath, "\n--- Python cw_qtcw_tester.py all ---\n" + (py.stdout || "") + (py.stderr || ""));
  if (py.status !== 0) {
    console.error("Python tester exited with code", py.status);
    process.exit(py.status ?? 1);
  }
}

console.log("\nHandover ready — send docs/qtech/cw_qtcw_tester.cfg and docs/qtech/CW-TEST-RESULTS.txt to QTech.");
