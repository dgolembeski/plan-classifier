// backend/server.js
import express from "express";
import fetch from "node-fetch";
import Papa from "papaparse";
import fs from "fs/promises";
import path from "path";

const CMS_PARTD_URL = "https://download.cms.gov/data-center/partd/cms_partd_binpcn_crosswalk_latest.csv";
const MEDICAID_MASTER_URL = "https://raw.githubusercontent.com/your-org/data/master/state_medicaid_binpcn_current.csv";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const DATA_DIR = path.join(__dirname, "data");
const PARTD_CSV = path.join(DATA_DIR, "partd.csv");
const MEDICAID_CSV = path.join(DATA_DIR, "medicaid.csv");

let medicarePairs = new Set();
let medicareBin = new Set();
let medicaidPairs = new Set();
let medicaidBin = new Set();
const COMMERCIAL_BIN = new Set(["610502","020099","003858","600428"]);

const norm = (x)=> (x||"").toString().trim().toUpperCase();
const MBI_REGEX = /^\d[A-Z]\d[A-Z]\d\d[A-Z]{2}\d{2}$/;
const ALPHA_PREFIX_REGEX = /^[A-Z]{3}\w{6,14}$/;

async function ensureDataDir(){ await fs.mkdir(DATA_DIR,{recursive:true});}

async function download(url, dest){
  const res = await fetch(url);
  if(!res.ok) throw new Error("Download failed "+url);
  const txt = await res.text();
  await fs.writeFile(dest, txt,"utf8");
  return txt;
}
function parseCsv(txt,setPair,setBin){
  const rows = Papa.parse(txt,{header:true}).data.filter(r=>r.BIN && r.PCN);
  rows.forEach(r=>{
    const bin = norm(r.BIN);
    const pcn = norm(r.PCN);
    setPair.add(`${bin}|${pcn}`);
    setBin.add(bin);
  });
}
export async function refreshReferenceData(){
  await ensureDataDir();
  try{
    const partd= await download(CMS_PARTD_URL, PARTD_CSV);
    medicarePairs=new Set(); medicareBin=new Set();
    parseCsv(partd, medicarePairs, medicareBin);
    console.log("Loaded Part D pairs:", medicarePairs.size);
  }catch(e){console.error("Part D error",e.message);}
  try{
    const med= await download(MEDICAID_MASTER_URL, MEDICAID_CSV);
    medicaidPairs=new Set(); medicaidBin=new Set();
    parseCsv(med, medicaidPairs, medicaidBin);
    console.log("Loaded Medicaid pairs:", medicaidPairs.size);
  }catch(e){console.error("Medicaid error",e.message);}
}
function deterministic(bin,pcn){
  const key = `${bin}|${pcn}`;
  if(medicarePairs.has(key)) return ["Medicare Part D / MA-PD",0.99];
  if(medicaidPairs.has(key)) return ["State Medicaid",0.99];
  if(medicareBin.has(bin)) return ["Likely Medicare Part D",0.9];
  if(medicaidBin.has(bin)) return ["Likely Medicaid",0.9];
  if(COMMERCIAL_BIN.has(bin)) return ["Commercial",0.9];
  return [null,0];
}
function heuristic(memberId,group,bin,pcn){
  let scores={Medicare:0,Medicaid:0,Commercial:0};
  if(/MEDD|ADV|MAPD|MSP/.test(pcn)) scores.Medicare+=0.25;
  if(/MCD|MEDICAID/.test(pcn)) scores.Medicaid+=0.25;
  if(/PARTD|RXMAPD/.test(group)) scores.Medicare+=0.15;
  if(MBI_REGEX.test(memberId)) scores.Medicare+=0.35;
  if(/^\d{9,12}$/.test(memberId)) scores.Medicaid+=0.35;
  if(ALPHA_PREFIX_REGEX.test(memberId)) scores.Commercial+=0.35;
  if(medicareBin.has(bin)) scores.Medicare+=0.25;
  if(medicaidBin.has(bin)) scores.Medicaid+=0.25;
  if(COMMERCIAL_BIN.has(bin)) scores.Commercial+=0.25;
  const [plan,score]=Object.entries(scores).sort((a,b)=>b[1]-a[1])[0];
  if(score>=0.6){
    return [plan==="Medicare"?"Likely Medicare Part D":plan==="Medicaid"?"Likely Medicaid":"Commercial",score];
  }
  return [null,0];
}
function classify({memberId='',group='',bin='',pcn=''}){
  memberId=norm(memberId);group=norm(group);bin=norm(bin);pcn=norm(pcn);
  let [plan,conf]=deterministic(bin,pcn);
  if(!plan)[plan,conf]=heuristic(memberId,group,bin,pcn);
  return {plan:plan||"Unknown – manual review",confidence:conf};
}

const app=express();
app.use(express.json());
app.get("/health",(_,res)=>res.json({ok:true}));
app.use("/data", express.static(DATA_DIR));
app.post("/api/classify",(req,res)=>{
  try{res.json(classify(req.body||{}));}
  catch(e){res.status(400).json({error:e.message});}
});

const PORT=process.env.PORT||3000;
refreshReferenceData().then(()=>app.listen(PORT,()=>console.log("API on",PORT)));
