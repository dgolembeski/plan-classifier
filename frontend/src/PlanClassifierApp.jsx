import { useState } from "react";

export default function PlanClassifierApp() {
  const [inputs, setInputs] = useState({
    memberId: "",
    group: "",
    bin: "",
    pcn: ""
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = e =>
    setInputs({ ...inputs, [e.target.name]: e.target.value });

  async function classify() {
    setLoading(true);
    setResult(null);

    const res = await fetch(
      "https://plan-classifier.vercel.app/api/classify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputs)
      }
    ).then(r => r.json());

    setResult(res);
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: 480, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h2>Plan Type Detector</h2>

      {["memberId", "group", "bin", "pcn"].map(field => (
        <div key={field} style={{ marginBottom: 12 }}>
          <label>
            {field.toUpperCase()}{" "}
            <input
              name={field}
              value={inputs[field]}
              onChange={handleChange}
              style={{ width: "100%" }}
            />
          </label>
        </div>
      ))}

      <button disabled={loading} onClick={classify}>
        {loading ? "Classifying…" : "Classify"}
      </button>

      {result && (
        <pre style={{ background: "#f5f5f5", padding: 12, marginTop: 20 }}>
{JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
