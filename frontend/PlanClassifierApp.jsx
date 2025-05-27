import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import Papa from "papaparse";

// ----------------------------------------------------------------------
//  Dynamic reference‑data loading
// ----------------------------------------------------------------------
const PARTD_CSV_URL = "/data/partd.csv";  // served by backend
const MEDICAID_CSV_URL = "/data/medicaid.csv";

const COMMERCIAL_BIN_FALLBACK = ["610502", "020099", "003858", "600428"];

const norm = (x) => (x || "").toString().toUpperCase().replace(/\s+/g, "");

const MBI_REGEX = /^\d[A-Z]\d[A-Z]\d\d[A-Z]{2}\d{2}$/;
const ALPHA_PREFIX_REGEX = /^[A-Z]{3}\w{6,14}$/;

export default function PlanClassifierApp() {
  const [inputs, setInputs] = useState({ memberId: "", group: "", bin: "", pcn: "" });
  const [result, setResult] = useState(null);
  const [tables, setTables] = useState({
    loaded: false,
    medicarePairs: new Set(),
    medicaidPairs: new Set(),
    medicareBin: new Set(),
    medicaidBin: new Set(),
    commercialBin: new Set(COMMERCIAL_BIN_FALLBACK),
  });
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        const partdText = await fetch(PARTD_CSV_URL).then(r => {
          if (!r.ok) throw new Error("Part D CSV fetch failed");
          return r.text();
        });
        const partdRows = Papa.parse(partdText, { header: true }).data.filter(row => row.BIN && row.PCN);
        const medicarePairs = new Set(partdRows.map(r => `${norm(r.BIN)}|${norm(r.PCN)}`));
        const medicareBin = new Set(partdRows.map(r => norm(r.BIN)));

        const medicaidText = await fetch(MEDICAID_CSV_URL).then(r => {
          if (!r.ok) throw new Error("Medicaid CSV fetch failed");
          return r.text();
        });
        const medicaidRows = Papa.parse(medicaidText, { header: true }).data.filter(row => row.BIN && row.PCN);
        const medicaidPairs = new Set(medicaidRows.map(r => `${norm(r.BIN)}|${norm(r.PCN)}`));
        const medicaidBin = new Set(medicaidRows.map(r => norm(r.BIN)));

        setTables({
          loaded: true,
          medicarePairs,
          medicaidPairs,
          medicareBin,
          medicaidBin,
          commercialBin: new Set(COMMERCIAL_BIN_FALLBACK),
        });
      } catch (err) {
        console.error(err);
        setLoadError(err.message);
      }
    }
    loadData();
  }, []);

  const deterministic = (memberId, group, bin, pcn) => {
    if (!tables.loaded) return [null, 0];
    const key = `${bin}|${pcn}`;
    if (tables.medicarePairs.has(key)) return ["Medicare Part D / MA-PD", 0.99];
    if (tables.medicaidPairs.has(key)) return ["State Medicaid", 0.99];
    if (tables.medicareBin.has(bin)) return ["Likely Medicare Part D", 0.9];
    if (tables.medicaidBin.has(bin)) return ["Likely Medicaid", 0.9];
    if (tables.commercialBin.has(bin)) return ["Commercial", 0.9];
    return [null, 0];
  };

  const heuristic = (memberId, group, bin, pcn) => {
    let scores = { Medicare: 0, Medicaid: 0, Commercial: 0 };
    if (/MEDD|ADV|MAPD|MSP/.test(pcn)) scores.Medicare += 0.25;
    if (/MCD|MEDICAID/.test(pcn)) scores.Medicaid += 0.25;
    if (/PARTD|RXMAPD/.test(group)) scores.Medicare += 0.15;
    if (MBI_REGEX.test(memberId)) scores.Medicare += 0.35;
    if (/^\d{9,12}$/.test(memberId)) scores.Medicaid += 0.35;
    if (ALPHA_PREFIX_REGEX.test(memberId)) scores.Commercial += 0.35;
    if (tables.medicareBin.has(bin)) scores.Medicare += 0.25;
    if (tables.medicaidBin.has(bin)) scores.Medicaid += 0.25;
    if (tables.commercialBin.has(bin)) scores.Commercial += 0.25;
    const [plan, score] = Object.entries(scores).sort((a,b)=>b[1]-a[1])[0];
    if (score >= 0.6) {
      return [plan === "Medicare" ? "Likely Medicare Part D" : plan === "Medicaid" ? "Likely Medicaid" : "Commercial", score];
    }
    return [null, 0];
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: value }));
  };

  const handleClassify = () => {
    if (!tables.loaded) {
      setResult({ plan: "Reference data still loading…", conf: "" });
      return;
    }
    const { memberId, group, bin, pcn } = Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,norm(v)]));
    let [plan, conf] = deterministic(memberId, group, bin, pcn);
    if (!plan) [plan, conf] = heuristic(memberId, group, bin, pcn);
    setResult({ plan: plan || "Unknown – manual review", conf: conf ? `${(conf*100).toFixed(0)}%` : "" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-2xl shadow-2xl rounded-2xl">
        <CardContent className="p-6 space-y-6">
          <h1 className="text-2xl font-semibold text-center mb-2">Plan Type Detector</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              ["memberId","Member ID"],
              ["group","Group Number"],
              ["bin","BIN"],
              ["pcn","PCN"]
            ].map(([field,label])=>(
              <div key={field} className="flex flex-col">
                <label htmlFor={field} className="text-sm font-medium mb-1">{label}</label>
                <input id={field} name={field} value={inputs[field]} onChange={handleChange}
                  className="border rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder={label}/>
              </div>
            ))}
          </div>
          <Button className="w-full" onClick={handleClassify}>Classify</Button>
          {loadError && <div className="text-red-600 text-center text-sm">Failed to load reference data: {loadError}</div>}
          {result && (
            <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="p-4 bg-indigo-50 rounded-lg text-center">
              <p className="text-lg font-semibold">{result.plan}</p>
              {result.conf && <p className="text-sm">Confidence: {result.conf}</p>}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
