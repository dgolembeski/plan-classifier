import express from "express";
import fetch from "node-fetch";
import Papa from "papaparse";

const CMS_PARTD_URL = "https://download.cms.gov/data-center/partd/cms_partd_binpcn_crosswalk_latest.csv";
const MEDICAID_MASTER_URL = "https://raw.githubusercontent.com/your-org/data/master/state_medicaid_binpcn_current.csv";

// In-memory lookup sets
let medicarePairs = new Set();
let medicareBin = new Set();
let medicaidPairs = new Set();
let medicaidBin = new Set();
const COMMERCIAL_BIN = new Set(["610502", "020099", "003858", "600428"]);

const norm = (x) => (x || "").toString().toUpperCase().replace(/\s+/g, "");
const MBI_REGEX = /^\d[A-Z]\d[A-Z]\d\d[A-Z]{2}\d{2}$/;
const ALPHA_PREFIX_REGEX = /^[A-Z]{3}\w{6,14}$/;

async function downloadCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("failed to fetch " + url);
  return await res.text();
}

function parseCsvToSets(csvText, pairSet, binSet) {
  const rows = Papa.parse(csvText, { header: true }).data.filter(r => r.BIN && r.PCN);
  rows.forEach(r => {
    const bin = norm(r.BIN);
    const pcn = norm(r.PCN);
    pairSet.add(\`\${bin}|\${pcn}\`);
    binSet.add(bin);
  });
}

async function refreshTables() {
  try {
    const partd = await downloadCsv(CMS_PARTD_URL);
    medicarePairs = new Set();
    medicareBin = new Set();
    parseCsvToSets(partd, medicarePairs, medicareBin);
  } catch (err) {
    console.error("Part D fetch failed:", err.message);
  }

  try {
    const medicaid = await downloadCsv(MEDICAID_MASTER_URL);
    medicaidPairs = new Set();
    medicaidBin = new Set();
    parseCsvToSets(medicaid, medicaidPairs, medicaidBin);
  } catch (err) {
    console.error("Medicaid fetch failed:", err.message);
  }
}

function deterministic(bin, pcn) {
  const key = \`\${bin}|\${pcn}\`;
  if (medicarePairs.has(key)) return ["Medicare Part D / MA-PD", 0.99];
  if (medicaidPairs.has(key)) return ["State Medicaid", 0.99];
  if (medicareBin.has(bin)) return ["Likely Medicare Part D", 0.9];
  if (medicaidBin.has(bin)) return ["Likely Medicaid", 0.9];
  if (COMMERCIAL_BIN.has(bin)) return ["Commercial", 0.9];
  return [null, 0];
}

function heuristic(memberId, group, bin, pcn) {
  let scores = { Medicare: 0, Medicaid: 0, Commercial: 0 };
  if (/MEDD|ADV|MAPD|MSP/.test(pcn)) scores.Medicare += 0.25;
  if (/MCD|MEDICAID/.test(pcn)) scores.Medicaid += 0.25;
  if (/PARTD|RXMAPD/.test(group)) scores.Medicare += 0.15;
  if (MBI_REGEX.test(memberId)) scores.Medicare += 0.35;
  if (/^\d{9,12}$/.test(memberId)) scores.Medicaid += 0.35;
  if (ALPHA_PREFIX_REGEX.test(memberId)) scores.Commercial += 0.35;
  if (medicareBin.has(bin)) scores.Medicare += 0.25;
  if (medicaidBin.has(bin)) scores.Medicaid += 0.25;
  if (COMMERCIAL_BIN.has(bin)) scores.Commercial += 0.25;
  const [plan, score] = Object.entries(scores).sort((a, b) => b[1]-a[1])[0];
  if (score >= 0.6) {
    return [plan === "Medicare" ? "Likely Medicare Part D" : plan === "Medicaid" ? "Likely Medicaid" : "Commercial", score];
  }
  return [null, 0];
}

function classifyCard(body) {
  const memberId = norm(body.memberId);
  const group = norm(body.group);
  const bin = norm(body.bin);
  const pcn = norm(body.pcn);
  let [plan, conf] = deterministic(bin, pcn);
  if (!plan) [plan, conf] = heuristic(memberId, group, bin, pcn);
  return { plan: plan || "Unknown – manual review", confidence: conf };
}

const app = express();
app.use(express.json());

app.get("/health", (_, res) => res.json({ ok: true }));
app.post("/api/classify", (req, res) => {
  try {
    const result = classifyCard(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
await refreshTables();
app.listen(port, () => console.log("🚀 Plan Classifier API listening on", port));
