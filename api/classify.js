import classifier from "../lib/classifier.js";   // move your classifyCard code into /lib

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const result = classifier(req.body || {});
  return res.json(result);
}
