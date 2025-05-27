export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { memberId = "", group = "", bin = "", pcn = "" } = req.body || {};

  // --- very small demo rule ---------------------------------
  // Replace this block with your full deterministic + heuristic logic
  let plan = "Commercial";
  let confidence = 0.8;
  if (bin === "004336" && pcn.toUpperCase() === "MEDDADV") {
    plan = "Medicare Part D / MA‑PD";
    confidence = 0.99;
  }
  // -----------------------------------------------------------

  return res.json({ plan, confidence });
}
