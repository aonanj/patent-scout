"use client";

import { useState } from "react";

export default function HomePage() {
  const [keywords, setKeywords] = useState("");
  const [cpc, setCpc] = useState(""); // e.g., "G06F/16,G06N/20"
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function runSearch() {
    setLoading(true);
    try {
      const cpc_any = cpc
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const body = {
        keywords: keywords || null,
        cpc_any: cpc_any.length ? cpc_any : null,
      };

      const r = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        throw new Error(`Search failed: ${r.status}`);
      }
      setResults(await r.json());
    } catch (err) {
      console.error(err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function saveAlert() {
    try {
      const cpc_any = cpc
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const resp = await fetch("/api/saved-queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "My CPC watch",
          keywords,
          cpc: cpc_any.length ? cpc_any : null,
          date_from: "2024-01-01", // optional filter
        }),
      });

      if (!resp.ok) {
        throw new Error(`Save failed: ${resp.status}`);
      }
      const data = await resp.json();
      console.log("Saved alert:", data);
      alert("Alert saved successfully");
    } catch (err) {
      console.error(err);
      alert("Failed to save alert");
    }
  }

  function clearSearch() {
    setKeywords("");
    setCpc("");
    setResults([]);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">Patent Scout</h1>

      <input
        className="border p-2 w-full"
        placeholder="Keywords (e.g., inference)"
        value={keywords}
        onChange={(e) => setKeywords(e.target.value)}
      />

      <input
        className="border p-2 w-full"
        placeholder="CPC codes (comma-separated, e.g., G06F/16,G06N/20)"
        value={cpc}
        onChange={(e) => setCpc(e.target.value)}
      />

      <div className="flex space-x-3">
        <button
          className="px-4 py-2 border rounded bg-gray-100"
          onClick={runSearch}
          disabled={loading}
        >
          {loading ? "Searching…" : "Search"}
        </button>
        <button
          className="px-4 py-2 border rounded bg-blue-100"
          onClick={saveAlert}
        >
          Save as Alert
        </button>
        <button
          className="px-4 py-2 border rounded bg-red-100"
          onClick={clearSearch}
        >
          Clear
        </button>
      </div>

      <ul className="list-disc pl-6 space-y-1">
        {results.map((r, i) => (
          <li key={i}>
            <a
              href={`https://patents.google.com/patent/${r.id.replace(/-/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-blue-600 hover:underline"
            >
              {r.id}
            </a>{" "}
            — {r.title}
          </li>
        ))}
      </ul>
    </div>
  );
}
