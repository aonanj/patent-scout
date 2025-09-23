"use client";
import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

const SigmaWhitespaceGraph = dynamic(() => import("../../components/SigmaWhitespaceGraph"), { ssr: false });

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>
      {children}
    </label>
  );
}

function Row({ children, gap = 12 }: { children: React.ReactNode; gap?: number }) {
  return (
    <div style={{ display: "flex", gap, alignItems: "end", flexWrap: "wrap" }}>{children}</div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 16,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 36,
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "0 10px",
  outline: "none",
  minWidth: 220,
};

const primaryBtn: React.CSSProperties = {
  height: 36,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid #0284c7",
  background: "#0ea5e9",
  color: "white",
  cursor: "pointer",
  fontWeight: 600,
};

const ghostBtn: React.CSSProperties = {
  height: 36,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "white",
  color: "#0f172a",
  cursor: "pointer",
  fontWeight: 600,
};

export default function WhitespacePage() {
  const { isAuthenticated, isLoading, getAccessTokenSilently, loginWithRedirect } = useAuth0();
  const today = useRef<string>(new Date().toISOString().slice(0, 10)).current;

  // form state
  const [whitespaceDateFrom, setWhitespaceDateFrom] = useState("");
  const [whitespaceDateTo, setWhitespaceDateTo] = useState("");
  const [whitespaceNeighbors, setWhitespaceNeighbors] = useState(15);
  const [whitespaceResolution, setWhitespaceResolution] = useState(0.5);
  const [whitespaceAlpha, setWhitespaceAlpha] = useState(0.8);
  const [whitespaceBeta, setWhitespaceBeta] = useState(0.5);
  const [whitespaceLimit, setWhitespaceLimit] = useState(1000);
  const [whitespaceLayout, setWhitespaceLayout] = useState(true);
  const [whitespaceFocusKeywords, setWhitespaceFocusKeywords] = useState("");
  const [whitespaceFocusCpcLike, setWhitespaceFocusCpcLike] = useState("");
  const [whitespaceLoading, setWhitespaceLoading] = useState(false);
  const [whitespaceError, setWhitespaceError] = useState<string | null>(null);
  const [whitespaceGraph, setWhitespaceGraph] = useState<{ nodes: any[]; edges: any } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const runWhitespaceAnalysis = useCallback(async () => {
    setWhitespaceLoading(true);
    setWhitespaceError(null);
    try {
      const token = await getAccessTokenSilently();
      const payload = {
        date_from: whitespaceDateFrom || undefined,
        date_to: whitespaceDateTo || undefined,
        neighbors: whitespaceNeighbors,
        resolution: whitespaceResolution,
        alpha: whitespaceAlpha,
        beta: whitespaceBeta,
        limit: whitespaceLimit,
        layout: whitespaceLayout,
        focus_keywords: whitespaceFocusKeywords
          ? whitespaceFocusKeywords.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        focus_cpc_like: whitespaceFocusCpcLike
          ? whitespaceFocusCpcLike.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
      };

      const res = await fetch(`/api/whitespace/graph`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const data = await res.json();
      setWhitespaceGraph(data);
    } catch (e: any) {
      setWhitespaceError(e?.message ?? "Whitespace analysis failed");
    } finally {
      setWhitespaceLoading(false);
    }
  }, [
    getAccessTokenSilently,
    whitespaceDateFrom,
    whitespaceDateTo,
    whitespaceNeighbors,
    whitespaceResolution,
    whitespaceAlpha,
    whitespaceBeta,
    whitespaceLimit,
    whitespaceLayout,
    whitespaceFocusKeywords,
    whitespaceFocusCpcLike,
  ]);

  return (
    <div style={{ padding: 20, background: "#f8fafc", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Whitespace Analysis</h1>
            <button
              aria-label="How this works"
              title="How this works"
              onClick={() => setShowHelp(true)}
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "white",
                color: "#0f172a",
                cursor: "pointer",
                fontWeight: 700,
                lineHeight: "20px",
              }}
            >
              ?
            </button>
          </div>
          {!isLoading && !isAuthenticated && (
            <button onClick={() => loginWithRedirect()} style={ghostBtn}>Log in</button>
          )}
        </div>

        <Card>
          <div style={{ display: "grid", gap: 12 }}>
            <Row>
              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="ws-focus-keywords">Focus Keywords</Label>
                <input
                  id="ws-focus-keywords"
                  value={whitespaceFocusKeywords}
                  onChange={(e) => setWhitespaceFocusKeywords(e.target.value)}
                  placeholder="e.g., battery management, graphene, LLM agents"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="ws-focus-cpc">Focus CPC (LIKE)</Label>
                <input
                  id="ws-focus-cpc"
                  value={whitespaceFocusCpcLike}
                  onChange={(e) => setWhitespaceFocusCpcLike(e.target.value)}
                  placeholder="e.g., G06N%, H04L%"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="ws-limit">Limit</Label>
                <input
                  id="ws-limit"
                  type="number"
                  value={whitespaceLimit}
                  onChange={(e) => setWhitespaceLimit(Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="ws-date_from">From</Label>
                <input
                  id="ws-date_from"
                  type="date"
                  min="2022-01-01"
                  max={whitespaceDateTo || today}
                  value={whitespaceDateFrom}
                  onChange={(e) => setWhitespaceDateFrom(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="ws-date_to">To</Label>
                <input
                  id="ws-date_to"
                  type="date"
                  min={whitespaceDateFrom || "2022-01-02"}
                  max={today}
                  value={whitespaceDateTo}
                  onChange={(e) => setWhitespaceDateTo(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </Row>
            <Row>
              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="ws-neighbors">Neighbors</Label>
                <input
                  id="ws-neighbors"
                  type="number"
                  value={whitespaceNeighbors}
                  onChange={(e) => setWhitespaceNeighbors(Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="ws-resolution">Resolution</Label>
                <input
                  id="ws-resolution"
                  type="number"
                  step="0.1"
                  value={whitespaceResolution}
                  onChange={(e) => setWhitespaceResolution(Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="ws-alpha">Alpha</Label>
                <input
                  id="ws-alpha"
                  type="number"
                  step="0.1"
                  value={whitespaceAlpha}
                  onChange={(e) => setWhitespaceAlpha(Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="ws-beta">Beta</Label>
                <input
                  id="ws-beta"
                  type="number"
                  step="0.1"
                  value={whitespaceBeta}
                  onChange={(e) => setWhitespaceBeta(Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  id="ws-layout"
                  type="checkbox"
                  checked={whitespaceLayout}
                  onChange={(e) => setWhitespaceLayout(e.target.checked)}
                />
                <Label htmlFor="ws-layout">Compute Layout</Label>
              </div>
              <button onClick={runWhitespaceAnalysis} style={primaryBtn} disabled={whitespaceLoading || !isAuthenticated}>
                {whitespaceLoading ? "Running..." : !isAuthenticated ? "Log in to run" : "Run Analysis"}
              </button>
            </Row>
          </div>
        </Card>

        <Card>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 'bold', textDecoration: 'underline' }}>Whitespace Graph</h2>
          {whitespaceLoading && <span style={{ fontSize: 12, color: "#64748b" }}>Loading...</span>}
          {whitespaceError && <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 8 }}>Error: {whitespaceError}</div>}
          <div style={{ height: 520, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, marginTop: 12 }}>
            <SigmaWhitespaceGraph data={whitespaceGraph as any} height={520} />
          </div>
        </Card>

        {showHelp && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ws-help-title"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: 16,
            }}
            onClick={() => setShowHelp(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: 760,
                width: "100%",
                background: "white",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
                padding: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h3 id="ws-help-title" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>How to use Whitespace Analysis</h3>
                <button onClick={() => setShowHelp(false)} style={{ ...ghostBtn, height: 28 }}>Close</button>
              </div>
              <div style={{ fontSize: 13, color: "#0f172a", lineHeight: 1.6, display: "grid", gap: 8 }}>
                <div>
                  This tool highlights potential whitespace in the patent landscape by scoring publications that are distant from your focus while still connected in the similarity graph.
                </div>
                <div style={{ fontWeight: 600 }}>Inputs</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li><strong>Focus Keywords</strong>: comma-separated phrases you care about (searches title/abstract/claims). The algorithm finds areas related to these but under-explored.</li>
                  <li><strong>Focus CPC (LIKE)</strong>: optional CPC wildcards (e.g., G06N%, H04L%).</li>
                  <li><strong>Date From/To</strong>: restrict the publication window.</li>
                  <li><strong>Limit</strong>: max number of recent patents to sample for the graph.</li>
                </ul>
                <div style={{ fontWeight: 600 }}>Algorithm knobs</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li><strong>Neighbors</strong>: K in the KNN graph (higher = denser graph).</li>
                  <li><strong>Resolution</strong>: community detection granularity (higher = more clusters).</li>
                  <li><strong>Alpha</strong>: how strongly distance from the focus increases whitespace score.</li>
                  <li><strong>Beta</strong>: how much recent momentum in a cluster boosts score.</li>
                  <li><strong>Compute Layout</strong>: runs a 2D layout for nicer graph positions.</li>
                </ul>
                <div style={{ fontWeight: 600 }}>Graph tips</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Node size encodes whitespace score; color encodes detected cluster.</li>
                  <li>Click a node to highlight its neighbors and open details; click background to clear.</li>
                  <li>Use your browser zoom or trackpad to zoom/pan; the camera will soft-center on selection.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer style={{ marginTop: 24, textAlign: "center", color: "#64748b", fontSize: 12, fontWeight: 500 }}>
        2025 © Phaethon Order LLC | <a href="mailto:support@phaethon.llc" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">support@phaethon.llc</a> | <a href="https://phaethonorder.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">phaethonorder.com</a> | <a href="https://github.com/aonanj/patent-scout" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">github</a>
      </footer>
    </div>
  );
}