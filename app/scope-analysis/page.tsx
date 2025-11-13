"use client";

import { useAuth0 } from "@auth0/auth0-react";
import jsPDF from "jspdf";
import { useCallback, useMemo, useState } from "react";
import type { CSSProperties } from "react";

type ScopeClaimMatch = {
  pub_id: string;
  claim_number: number;
  claim_text?: string | null;
  title?: string | null;
  assignee_name?: string | null;
  pub_date?: number | null;
  is_independent?: boolean | null;
  distance: number;
  similarity: number;
};

type ScopeAnalysisResponse = {
  query_text: string;
  top_k: number;
  matches: ScopeClaimMatch[];
};

type GraphProps = {
  matches: ScopeClaimMatch[];
  selectedId: string | null;
  onSelect: (rowId: string) => void;
};

function formatPubDate(pubDate?: number | null): string {
  if (!pubDate) return "—";
  const s = String(pubDate);
  if (s.length !== 8) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function formatSimilarity(sim: number | null | undefined): string {
  if (sim == null) return "—";
  const pct = Math.max(0, Math.min(1, sim)) * 100;
  return `${pct.toFixed(1)}%`;
}

const ScopeGraph = ({ matches, selectedId, onSelect }: GraphProps) => {
  const width = 620;
  const height = 360;
  const cx = width / 2;
  const cy = height / 2;
  const [tooltip, setTooltip] = useState<{
    rowId: string;
    title: string;
    snippet: string;
    leftPct: number;
    topPct: number;
  } | null>(null);

  const nodes = useMemo(() => {
    if (!matches.length) return [];
    const limit = Math.min(matches.length, 18);
    return matches.slice(0, limit).map((match, idx) => {
      const proportion = idx / limit;
      const angle = proportion * Math.PI * 2;
      const sim = Math.max(0, Math.min(1, match.similarity ?? 0));
      const minRadius = 70;
      const maxRadius = 220;
      const emphasis = Math.pow(sim, 1.35); // push high-sim nodes closer to center
      const radius = maxRadius - emphasis * (maxRadius - minRadius);
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      const rowId = `${match.pub_id}#${match.claim_number}`;
      const text = (match.claim_text || "").trim();
      const snippet = text
        ? `${text.slice(0, 200)}${text.length > 200 ? "…" : ""}`
        : "No claim text available.";
      return {
        x,
        y,
        rowId,
        similarity: sim,
        title: match.title || match.pub_id,
        snippet,
      };
    });
  }, [matches, cx, cy]);

  if (!matches.length) {
    return (
      <div className="h-[360px] flex items-center justify-center text-sm text-slate-500">
        Run a scope analysis to visualize overlaps with independent claims.
      </div>
    );
  }

  return (
    <div className="relative w-full h-[360px]">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
        {/* Edges */}
        {nodes.map((node) => (
          <line
            key={`${node.rowId}-edge`}
            x1={cx}
            y1={cy}
            x2={node.x}
            y2={node.y}
            stroke="rgba(14,165,233,0.25)"
            strokeWidth={selectedId === node.rowId ? 2.2 : 1.2}
          />
        ))}

        {/* Query node */}
        <g>
          <circle cx={cx} cy={cy} r={28} fill="#0ea5e9" fillOpacity={0.8} />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={12}
            fontWeight={600}
            fill="white"
          >
            Input
          </text>
        </g>

        {/* Claim nodes */}
        {nodes.map((node) => (
          <g
            key={node.rowId}
            className="cursor-pointer"
            onClick={() => onSelect(node.rowId)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(node.rowId);
              }
            }}
            onMouseEnter={() =>
              setTooltip({
                rowId: node.rowId,
                title: node.title,
                snippet: node.snippet,
                leftPct: (node.x / width) * 100,
                topPct: (node.y / height) * 100,
              })
            }
            onMouseLeave={() => setTooltip((prev) => (prev?.rowId === node.rowId ? null : prev))}
            tabIndex={0}
            role="button"
            aria-label={`Highlight ${node.title}`}
          >
            <circle
              cx={node.x}
              cy={node.y}
              r={selectedId === node.rowId ? 16 : 13}
              fill={selectedId === node.rowId ? "#1d4ed8" : "#e0f2fe"}
              stroke={selectedId === node.rowId ? "#1d4ed8" : "#0ea5e9"}
              strokeWidth={selectedId === node.rowId ? 3 : 1.5}
            />
            <text
              x={node.x}
              y={node.y - (selectedId === node.rowId ? 22 : 20)}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="#0f172a"
            >
              {`${Math.round(node.similarity * 100)}%`}
            </text>
          </g>
        ))}
      </svg>
      {tooltip && (
        <div
          className="absolute max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg pointer-events-none"
          style={{
            left: `${tooltip.leftPct}%`,
            top: `${tooltip.topPct}%`,
            transform: "translate(-50%, -100%) translateY(-12px)",
          }}
        >
          <p className="font-semibold text-slate-800 mb-1">{tooltip.title}</p>
          <p className="text-slate-600 leading-snug">{tooltip.snippet}</p>
        </div>
      )}
    </div>
  );
};

const surfaceStyle: CSSProperties = {
  maxWidth: 960,
  width: "100%",
  margin: "0 auto",
  display: "grid",
  gap: 24,
  padding: 32,
  borderRadius: 28,
};



export default function ScopeAnalysisPage() {
  const { isAuthenticated, isLoading, loginWithRedirect, getAccessTokenSilently } = useAuth0();
  const [text, setText] = useState("");
  const [topK, setTopK] = useState(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ScopeClaimMatch[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [expandedClaims, setExpandedClaims] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState(false);

  const primaryRisk = useMemo(() => {
    if (!results.length) return null;
    const top = results[0];
    if (!top) return null;
    const sim = top.similarity ?? 0;
    if (sim >= 0.75) {
      return { label: "High overlap", level: "high", message: "Top claim vector is very close to your input. Consider immediate counsel review." };
    }
    if (sim >= 0.55) {
      return { label: "Moderate overlap", level: "medium", message: "One or more existing claims are directionally similar. Evaluate design-arounds." };
    }
    return { label: "Low overlap", level: "low", message: "Closest claims remain relatively distant. Filing or launch risk appears low." };
  }, [results]);

  const runAnalysis = useCallback(async () => {
    if (!text.trim()) {
      setError("Please describe the product or claim set to analyze.");
      return;
    }
    if (!isAuthenticated) {
      loginWithRedirect();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const payload = { text, top_k: topK };
      const resp = await fetch("/api/scope-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}));
        throw new Error(detail?.detail || `HTTP ${resp.status}`);
      }
      const data: ScopeAnalysisResponse = await resp.json();
      const matches = Array.isArray(data.matches) ? data.matches : [];
      setResults(matches);
      setLastQuery(data.query_text || text);
      setSelectedId(matches.length ? `${matches[0].pub_id}#${matches[0].claim_number}` : null);
    } catch (err: any) {
      setError(err?.message ?? "Scope analysis failed");
    } finally {
      setLoading(false);
    }
  }, [text, topK, isAuthenticated, loginWithRedirect, getAccessTokenSilently]);

  const highRiskCount = useMemo(() => {
    return results.filter((r) => (r.similarity ?? 0) >= 0.7).length;
  }, [results]);

  const lowRiskCount = useMemo(() => {
    return results.filter((r) => (r.similarity ?? 0) < 0.5).length;
  }, [results]);

  const handleRowSelect = (rowId: string) => {
    setSelectedId(rowId);
  };

  const toggleClaimExpansion = (rowId: string) => {
    setExpandedClaims((prev) => {
      const next = { ...prev };
      if (next[rowId]) {
        delete next[rowId];
      } else {
        next[rowId] = true;
      }
      return next;
    });
  };

  const exportTableToPdf = useCallback(() => {
    if (!results.length || exporting) {
      return;
    }
    try {
      setExporting(true);
      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const marginX = 48;
      let y = 60;

      doc.setFontSize(18);
      doc.text("Scope Analysis Results", marginX, y);
      y += 20;
      doc.setFontSize(11);
      doc.text(`Generated: ${new Date().toLocaleString()}`, marginX, y);
      y += 14;
      if (lastQuery) {
        const snippet = lastQuery.length > 140 ? `${lastQuery.slice(0, 140)}…` : lastQuery;
        const queryLines = doc.splitTextToSize(`Input: ${snippet}`, 520);
        doc.text(queryLines, marginX, y);
        y += queryLines.length * 12 + 6;
      }

      results.forEach((match, idx) => {
        if (y > 720) {
          doc.addPage();
          y = 60;
        }
        const heading = `${idx + 1}. ${match.title || "Untitled patent"} (${match.pub_id})`;
        doc.setFontSize(12);
        doc.text(heading, marginX, y);
        y += 14;

        doc.setFontSize(10);
        const meta = [
          `Assignee: ${match.assignee_name || "Unknown"}`,
          `Pub Date: ${formatPubDate(match.pub_date)}`,
          `Claim #: ${match.claim_number}`,
          `Similarity: ${formatSimilarity(match.similarity)}`,
          `Distance: ${typeof match.distance === "number" ? match.distance.toFixed(3) : "—"}`,
        ].join(" | ");
        doc.text(doc.splitTextToSize(meta, 520), marginX, y);
        y += 14;

        const claimText = match.claim_text ? match.claim_text : "No claim text available.";
        const claimLines = doc.splitTextToSize(claimText, 520);
        doc.text(claimLines, marginX + 12, y);
        y += claimLines.length * 12 + 16;
      });

      const filename = `scope-analysis-${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);
    } finally {
      setExporting(false);
    }
  }, [results, lastQuery, exporting]);


  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="glass-surface" style={surfaceStyle}>
        <header className="glass-card p-6" style={{ ...cardBaseStyle }}>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600 mb-2">
            Scope Analysis
          </p>
          <h1 className="text-3xl font-bold text-slate-900 mb-3">Preliminary FTO / Infringement Radar</h1>
          <p className="text-base text-slate-600 max-w-3xl">
            Input subject matter to search for comparison against independent claims of patents in the SynapseIP database. 
            A semantic search is executed over available independent claim, and semantically similar claims are returned with similarity scores and risk analysis.
          </p>
        </header>

        <section className="glass-card p-6 space-y-4" style={{ ...cardBaseStyle }}>
          <div className="flex flex-col gap-2">
            <label htmlFor="scope-text" className="text-sm font-semibold text-slate-700">
              Input subject matter to search (e.g., product description, invention disclosure, draft claim, etc.)
            </label>
            <textarea
              id="scope-text"
              className="w-full min-h-[160px] rounded-xl border border-slate-200 p-4 focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white/80"
              placeholder="Example: A device using a multi-modal transformer that fuses radar and camera signals..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="topk" className="text-sm font-semibold text-slate-700">
                # of claim comparisons
              </label>
              <input
                id="topk"
                type="number"
                min={5}
                max={50}
                value={topK}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (Number.isFinite(next)) {
                    setTopK(Math.max(5, Math.min(50, Math.trunc(next))));
                  }
                }}
                className="mt-1 w-28 rounded-lg border border-slate-200 px-3 py-2"
              />
            </div>
            <div className="flex-1" />
            <button
              type="button"
              onClick={runAnalysis}
              disabled={loading}
              className="btn-modern h-11 px-6 text-sm font-semibold disabled:opacity-60"
            >
              {loading ? "Analyzing…" : isAuthenticated ? "Run scope analysis" : "Log in to analyze"}
            </button>
          </div>
          {!isAuthenticated && !isLoading && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Sign in to access this feature.
            </div>
          )}
        </section>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {results.length > 0 && (
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="glass-card p-6" style={{ ...cardBaseStyle }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs tracking-wide uppercase text-slate-500">Risk snapshot</p>
                  <h2 className="text-xl font-semibold text-slate-900">Similarity map</h2>
                </div>
                {primaryRisk && (
                  <div
                    className={`px-3 py-1 text-sm font-semibold rounded-full ${
                      primaryRisk.level === "high"
                        ? "bg-red-100 text-red-700"
                        : primaryRisk.level === "medium"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {primaryRisk.label}
                  </div>
                )}
              </div>
              <ScopeGraph matches={results} selectedId={selectedId} onSelect={handleRowSelect} />
              {primaryRisk && (
                <p className="mt-4 text-sm text-slate-600">{primaryRisk.message}</p>
              )}
            </div>

            <div className="glass-card p-6 space-y-4" style={{ ...cardBaseStyle }}>
              <p className="text-xs tracking-wide uppercase text-slate-500">Impact summary</p>
              <h2 className="text-xl font-semibold text-slate-900">Claim proximity breakdown</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <p className="text-sm text-slate-500">Top match similarity</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {formatSimilarity(results[0]?.similarity)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Pub {results[0]?.pub_id} / Claim {results[0]?.claim_number}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <p className="text-sm text-slate-500">High-risk cluster</p>
                  <p className="text-2xl font-bold text-slate-900">{highRiskCount}</p>
                  <p className="text-xs text-slate-500 mt-1">claims ≥ 0.70 similarity</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <p className="text-sm text-slate-500">Lower-risk set</p>
                  <p className="text-2xl font-bold text-slate-900">{lowRiskCount}</p>
                  <p className="text-xs text-slate-500 mt-1">claims &lt; 0.50 similarity</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <p className="text-sm text-slate-500">Scope sampled</p>
                  <p className="text-2xl font-bold text-slate-900">{results.length}</p>
                  <p className="text-xs text-slate-500 mt-1">independent claims inspected</p>
                </div>
              </div>
              {lastQuery && (
                <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-500">
                  Last analyzed snippet: {lastQuery.slice(0, 160)}
                  {lastQuery.length > 160 ? "…" : ""}
                </div>
              )}
            </div>
          </section>
        )}

      <section className="glass-card p-6" style={{ ...cardBaseStyle }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs tracking-wide uppercase text-slate-500">Independent claim matches</p>
            <h2 className="text-xl font-semibold text-slate-900">Closest patent claims</h2>
          </div>
          <div className="flex items-center gap-3">
            {results.length > 0 && (
              <span className="text-xs font-semibold text-slate-500">
                Click a row to highlight the graph node.
              </span>
            )}
            <button
              type="button"
              onClick={exportTableToPdf}
              disabled={!results.length || exporting}
              className="btn-outline h-9 px-4 text-xs font-semibold disabled:opacity-50"
            >
              {exporting ? "Preparing PDF…" : "Export PDF"}
            </button>
          </div>
        </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2 pr-4">Patent</th>
                  <th className="py-2 pr-4">Claim #</th>
                  <th className="py-2 pr-4">Similarity</th>
                  <th className="py-2 pr-4">Distance</th>
                  <th className="py-2">Claim text</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      Run a scope analysis to populate this table.
                    </td>
                  </tr>
                ) : (
                  results.map((match) => {
                    const rowId = `${match.pub_id}#${match.claim_number}`;
                    const isSelected = selectedId === rowId;
                    return (
                      <tr
                        key={rowId}
                        className={`align-top transition-colors cursor-pointer ${
                          isSelected ? "bg-sky-50/80" : "hover:bg-slate-50"
                        }`}
                        onClick={() => handleRowSelect(rowId)}
                      >
                        <td className="py-3 pr-4 min-w-[180px]">
                          <div className="font-semibold text-slate-900">{match.title || "Untitled patent"}</div>
                          <div className="text-xs text-slate-500">
                            <a
                              href={`https://patents.google.com/patent/${match.pub_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sky-600 hover:underline"
                            >
                              {match.pub_id}
                            </a>{" "}
                            · {match.assignee_name || "Unknown assignee"} · {formatPubDate(match.pub_date)}
                          </div>
                        </td>
                        <td className="py-3 pr-4">{match.claim_number}</td>
                        <td className="py-3 pr-4 font-semibold text-slate-900">
                          {formatSimilarity(match.similarity)}
                        </td>
                        <td className="py-3 pr-4 text-slate-600">
                          {typeof match.distance === "number" ? match.distance.toFixed(3) : "—"}
                        </td>
                        <td
                          className="py-3 text-slate-700"
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowSelect(rowId);
                            toggleClaimExpansion(rowId);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              handleRowSelect(rowId);
                              toggleClaimExpansion(rowId);
                            }
                          }}
                        >
                          {match.claim_text
                            ? expandedClaims[rowId]
                              ? match.claim_text
                              : match.claim_text.slice(0, 280) + (match.claim_text.length > 280 ? "…" : "")
                            : "—"}
                          {match.claim_text && (
                            <span className="block text-xs text-slate-500 mt-1">
                              {expandedClaims[rowId] ? "Click to collapse" : "Click to read full claim"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <div className="glass-surface" style={surfaceStyle}>
        {/* Footer */}
        <footer style={footerStyle}>
          2025 © Phaethon Order LLC | <a href="mailto:support@phaethon.llc" target="_blank" rel="noopener noreferrer" className="text-[#312f2f] hover:underline hover:text-blue-400">support@phaethon.llc</a> | <a href="https://phaethonorder.com" target="_blank" rel="noopener noreferrer" className="text-[#312f2f] hover:underline hover:text-blue-400">phaethonorder.com</a> | <a href="/help" className="text-[#312f2f] hover:underline hover:text-blue-400">Help</a> | <a href="/docs" className="text-[#312f2f] hover:underline hover:text-blue-400">Legal</a>
        </footer>
      </div>
    </main>
  );
};

const TEXT_COLOR = "#102A43";
const LINK_COLOR = "#5FA8D2";
const CARD_BG = "rgba(255, 255, 255, 0.8)";
const CARD_BORDER = "rgba(255, 255, 255, 0.45)";
const CARD_SHADOW = "0 26px 54px rgba(15, 23, 42, 0.28)";

const footerStyle: React.CSSProperties = {
  alignSelf: "center",
  padding: "16px 24px",
  borderRadius: 999,
  background: "rgba(255, 255, 255, 0.22)",
  border: "1px solid rgba(255, 255, 255, 0.35)",
  boxShadow: "0 16px 36px rgba(15, 23, 42, 0.26)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  color: "#102a43",
  textAlign: "center",
  fontSize: 13,
  fontWeight: 500,
  gap: 4
};

const cardBaseStyle: CSSProperties = {
  background: CARD_BG,
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 20,
  padding: 32,
  boxShadow: CARD_SHADOW,
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
};
