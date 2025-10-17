"use client";

import { useAuth0 } from "@auth0/auth0-react";
import dynamic from "next/dynamic";
import type { SignalKind, WsGraph } from "../../components/SigmaWhitespaceGraph";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SigmaWhitespaceGraph = dynamic(() => import("../../components/SigmaWhitespaceGraph"), { ssr: false });

type SignalStatus = "none" | "weak" | "medium" | "strong";

type SignalInfo = {
  type: SignalKind;
  status: SignalStatus;
  confidence: number;
  why: string;
  node_ids: string[];
  debug?: Record<string, number> | null;
};

type AssigneeSignals = {
  assignee: string;
  k: string;
  signals: SignalInfo[];
  summary?: string | null;
  debug?: Record<string, unknown> | null;
};

type WhitespaceResponse = {
  k: string;
  assignees: AssigneeSignals[];
  graph: WsGraph | null;
  debug?: Record<string, unknown> | null;
};

const SIGNAL_LABELS: Record<SignalKind, string> = {
  focus_shift: "Focus Shift",
  emerging_gap: "Sparse Focus Area",
  crowd_out: "Crowd-out Risk",
  bridge: "Bridge Opportunity",
};

const SIGNAL_ICONS: Record<SignalKind, string> = {
  focus_shift: "↑",
  emerging_gap: "◎",
  crowd_out: "↓",
  bridge: "↔",
};

const STATUS_COLORS: Record<SignalStatus, string> = {
  none: "#cbd5f5",
  weak: "#fde68a",
  medium: "#fbbf24",
  strong: "#16a34a",
};

type ActiveKey = { assignee: string; type: SignalKind } | null;

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>
      {children}
    </label>
  );
}

function Row({
  children,
  gap = 12,
  align = "stretch",
}: { children: React.ReactNode; gap?: number; align?: React.CSSProperties["alignItems"] }) {
  return (
    <div style={{ display: "flex", gap, flexWrap: "wrap", alignItems: align }}>{children}</div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: 18,
        boxShadow: "0 4px 12px rgba(15,23,42,0.05)",
      }}
    >
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 38,
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: "0 12px",
  outline: "none",
  minWidth: 220,
  fontSize: 13,
};

const primaryBtn: React.CSSProperties = {
  height: 38,
  padding: "0 16px",
  borderRadius: 10,
  border: "1px solid #0ea5e9",
  background: "#0284c7",
  color: "#ffffff",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

const ghostBtn: React.CSSProperties = {
  height: 38,
  padding: "0 16px",
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  color: "#0f172a",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

function formatConfidence(conf: number): string {
  if (!Number.isFinite(conf)) return "0.00";
  return conf.toFixed(2);
}

function formatStatus(status: SignalStatus, confidence: number): string {
  if (status === "none") return "None";
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return `${label} (${formatConfidence(confidence)})`;
}

function scopeSummary(resp: WhitespaceResponse | null): string {
  if (!resp) return "Focus scope";
  return resp.k || "Focus scope";
}

export default function WhitespacePage() {
  const { isAuthenticated, isLoading, getAccessTokenSilently, loginWithRedirect } = useAuth0();
  const today = useRef<string>(new Date().toISOString().slice(0, 10)).current;

  const [focusKeywords, setFocusKeywords] = useState("");
  const [focusCpcLike, setFocusCpcLike] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [neighbors, setNeighbors] = useState(15);
  const [resolution, setResolution] = useState(0.5);
  const [alpha, setAlpha] = useState(0.8);
  const [beta, setBeta] = useState(0.5);
  const [limit, setLimit] = useState(1000);
  const [layout, setLayout] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WhitespaceResponse | null>(null);

  const [openAssignees, setOpenAssignees] = useState<Record<string, boolean>>({});
  const [activeKey, setActiveKey] = useState<ActiveKey>(null);
  const [highlightedNodes, setHighlightedNodes] = useState<string[]>([]);

  const selectedSignal = activeKey?.type ?? null;

  const runWhitespaceAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHighlightedNodes([]);
    setActiveKey(null);
    try {
      const token = await getAccessTokenSilently();
      const payload = {
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        neighbors,
        resolution,
        alpha,
        beta,
        limit,
        layout,
        debug: debugMode,
        focus_keywords: focusKeywords
          ? focusKeywords.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        focus_cpc_like: focusCpcLike
          ? focusCpcLike.split(",").map((s) => s.trim()).filter(Boolean)
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
      const data = (await res.json()) as WhitespaceResponse;
      setResult(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Whitespace analysis failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [
    alpha,
    beta,
    dateFrom,
    dateTo,
    debugMode,
    focusCpcLike,
    focusKeywords,
    getAccessTokenSilently,
    layout,
    limit,
    neighbors,
    resolution,
  ]);

  const handleToggleSignal = useCallback((assignee: string, signal: SignalInfo) => {
    setHighlightedNodes([]);
    setActiveKey((current) => {
      if (current && current.assignee === assignee && current.type === signal.type) {
        return null;
      }
      return { assignee, type: signal.type };
    });
  }, []);

  const handleViewExamples = useCallback((nodeIds: string[]) => {
    setHighlightedNodes(nodeIds);
  }, []);

  const handleClearExamples = useCallback(() => {
    setHighlightedNodes([]);
    setActiveKey(null);
  }, []);

  const formattedAssignees = useMemo(() => {
    if (!result) return [];
    return result.assignees ?? [];
  }, [result]);

  useEffect(() => {
    setOpenAssignees((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const entry of formattedAssignees) {
        const key = entry.assignee;
        const current = prev[key];
        next[key] = current ?? true;
        if (current === undefined) {
          changed = true;
        }
      }
      for (const key of Object.keys(prev)) {
        if (!(key in next)) {
          changed = true;
          break;
        }
      }
      if (!changed && Object.keys(prev).length === Object.keys(next).length) {
        return prev;
      }
      return next;
    });
  }, [formattedAssignees]);

  const debugSummary = useMemo(() => {
    if (!debugMode || !result?.debug) return null;
    return JSON.stringify(result.debug, null, 2);
  }, [debugMode, result?.debug]);

  const handleToggleAssignee = useCallback((assigneeName: string) => {
    let nextIsOpen = true;
    setOpenAssignees((prev) => {
      const currentOpen = prev[assigneeName] ?? true;
      const updated = { ...prev, [assigneeName]: !currentOpen };
      nextIsOpen = !currentOpen;
      return updated;
    });
    if (!nextIsOpen) {
      setActiveKey((current) => (current?.assignee === assigneeName ? null : current));
    }
  }, []);

  return (
    <div style={{ padding: 20, background: "#f8fafc", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Whitespace Signals</h1>
            <span style={{ fontSize: 12, color: "#64748b" }}>Confidence-first alerts for whitespace opportunities</span>
          </div>
          {!isLoading && !isAuthenticated && (
            <button onClick={() => loginWithRedirect()} style={ghostBtn}>Log in</button>
          )}
        </div>

        <Card>
          <div style={{ display: "grid", gap: 16 }}>
            <Row gap={16} align="flex-end">
              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="ws-focus-keywords">Focus Keywords</Label>
                <input
                  id="ws-focus-keywords"
                  value={focusKeywords}
                  onChange={(e) => setFocusKeywords(e.target.value)}
                  placeholder="e.g., LIDAR, perception, autonomous driving"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="ws-focus-cpc">Focus CPC (LIKE)</Label>
                <input
                  id="ws-focus-cpc"
                  value={focusCpcLike}
                  onChange={(e) => setFocusCpcLike(e.target.value)}
                  placeholder="e.g., G06N%, H04L%"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="ws-date-from">From</Label>
                <input
                  id="ws-date-from"
                  type="date"
                  min="2022-01-01"
                  max={dateTo || today}
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="ws-date-to">To</Label>
                <input
                  id="ws-date-to"
                  type="date"
                  min={dateFrom || "2022-01-02"}
                  max={today}
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <button
                onClick={runWhitespaceAnalysis}
                style={primaryBtn}
                disabled={loading || !isAuthenticated}
              >
                {loading ? "Computing..." : !isAuthenticated ? "Log in to run" : "Identify signals"}
              </button>
            </Row>
            <div>
              <button
                onClick={() => setAdvancedOpen((open) => !open)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#0284c7",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {advancedOpen ? "Hide advanced settings" : "Show advanced settings"}
              </button>
              {advancedOpen && (
                <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                  <Row gap={16}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <Label htmlFor="ws-limit">Sample Limit</Label>
                      <input
                        id="ws-limit"
                        type="number"
                        value={limit}
                        onChange={(e) => setLimit(Number(e.target.value))}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <Label htmlFor="ws-neighbors">Neighbors (K)</Label>
                      <input
                        id="ws-neighbors"
                        type="number"
                        value={neighbors}
                        onChange={(e) => setNeighbors(Number(e.target.value))}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <Label htmlFor="ws-resolution">Resolution</Label>
                      <input
                        id="ws-resolution"
                        type="number"
                        step="0.1"
                        value={resolution}
                        onChange={(e) => setResolution(Number(e.target.value))}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <Label htmlFor="ws-alpha">Alpha (distance)</Label>
                      <input
                        id="ws-alpha"
                        type="number"
                        step="0.1"
                        value={alpha}
                        onChange={(e) => setAlpha(Number(e.target.value))}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <Label htmlFor="ws-beta">Beta (momentum)</Label>
                      <input
                        id="ws-beta"
                        type="number"
                        step="0.1"
                        value={beta}
                        onChange={(e) => setBeta(Number(e.target.value))}
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        id="ws-layout"
                        type="checkbox"
                        checked={layout}
                        onChange={(e) => setLayout(e.target.checked)}
                      />
                      <Label htmlFor="ws-layout">Compute layout</Label>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        id="ws-debug"
                        type="checkbox"
                        checked={debugMode}
                        onChange={(e) => setDebugMode(e.target.checked)}
                      />
                      <Label htmlFor="ws-debug">Debug mode</Label>
                    </div>
                  </Row>
                </div>
              )}
            </div>
            {loading && <span style={{ fontSize: 12, color: "#64748b" }}>Loading...</span>}
            {error && <div style={{ color: "#b91c1c", fontSize: 12 }}>Error: {error}</div>}
          </div>
        </Card>

        {result && (
          <>
            <Card>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Signals</h2>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{scopeSummary(result)}</div>
                  </div>
                  {highlightedNodes.length > 0 && (
                    <button onClick={handleClearExamples} style={{ ...ghostBtn, height: 32 }}>Clear highlights</button>
                  )}
                </div>

                <div style={{ display: "grid", gap: 16 }}>
                  {formattedAssignees.map((assignee) => {
                    const active = activeKey && activeKey.assignee === assignee.assignee ? activeKey.type : null;
                    const isOpen = openAssignees[assignee.assignee] ?? true;
                    const arrow = isOpen ? "▼" : "▶︎";
                    return (
                      <div key={assignee.assignee} style={{ display: "grid", gap: 12 }}>
                        <button
                          type="button"
                          onClick={() => handleToggleAssignee(assignee.assignee)}
                          aria-expanded={isOpen}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            border: "none",
                            background: "transparent",
                            padding: 0,
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: 700,
                            color: "#0f172a",
                            textAlign: "left",
                          }}
                        >
                          <span style={{ fontSize: 12 }}>{arrow}</span>
                          <span>{assignee.assignee}</span>
                        </button>
                        {isOpen && (
                          <div style={{ display: "grid", gap: 12 }}>
                            {assignee.summary && (
                              <div style={{ fontSize: 13, color: "#475569" }}>{assignee.summary}</div>
                            )}
                            {assignee.signals.map((signal) => {
                              const isActive = active === signal.type;
                              const key = `${assignee.assignee}:${signal.type}`;
                              const hasExamples = signal.node_ids.length > 0;
                              return (
                                <div key={key} style={{ display: "grid", gap: 8 }}>
                                  <button
                                    onClick={() => handleToggleSignal(assignee.assignee, signal)}
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      border: "1px solid #e2e8f0",
                                      borderRadius: 12,
                                      padding: "10px 14px",
                                      background: "#ffffff",
                                      cursor: "pointer",
                                      boxShadow: isActive ? "0 4px 12px rgba(15,23,42,0.08)" : "none",
                                      transition: "box-shadow 0.2s ease",
                                    }}
                                  >
                                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                                      <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                                        {SIGNAL_ICONS[signal.type]} {SIGNAL_LABELS[signal.type]}
                                      </span>
                                      <span style={{ fontSize: 12, color: "#475569" }}>
                                        {isActive ? "Tap to collapse" : "Tap to view rationale"}
                                      </span>
                                    </div>
                                    <span
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: signal.status === "none" ? "#475569" : "#ffffff",
                                        background: STATUS_COLORS[signal.status],
                                        padding: "4px 10px",
                                        borderRadius: 999,
                                      }}
                                    >
                                      {formatStatus(signal.status, signal.confidence)}
                                    </span>
                                  </button>
                                  {isActive && (
                                    <div
                                      style={{
                                        marginLeft: 8,
                                        borderLeft: "2px solid #e2e8f0",
                                        paddingLeft: 12,
                                        color: "#475569",
                                        fontSize: 13,
                                        lineHeight: 1.5,
                                        display: "grid",
                                        gap: 12,
                                      }}
                                    >
                                      <div>{signal.why}</div>
                                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                        <button
                                          onClick={() => handleViewExamples(signal.node_ids)}
                                          style={{
                                            border: "1px solid #0f172a",
                                            background: "#0f172a",
                                            color: "#ffffff",
                                            borderRadius: 8,
                                            padding: "6px 12px",
                                            fontSize: 12,
                                            fontWeight: 600,
                                            cursor: hasExamples ? "pointer" : "not-allowed",
                                            opacity: hasExamples ? 1 : 0.5,
                                          }}
                                          disabled={!hasExamples}
                                        >
                                          View examples
                                        </button>
                                        {!hasExamples && (
                                          <span style={{ fontSize: 12, color: "#94a3b8" }}>
                                            No exemplars yet for this signal.
                                          </span>
                                        )}
                                      </div>
                                      {debugMode && signal.debug && (
                                        <pre
                                          style={{
                                            background: "#0f172a",
                                            color: "#e2e8f0",
                                            fontSize: 11,
                                            padding: 12,
                                            borderRadius: 8,
                                            overflowX: "auto",
                                          }}
                                        >
                                          {JSON.stringify(signal.debug, null, 2)}
                                        </pre>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {debugMode && assignee.debug && (
                              <pre
                                style={{
                                  background: "#0f172a",
                                  color: "#e2e8f0",
                                  fontSize: 11,
                                  padding: 12,
                                  borderRadius: 8,
                                  overflowX: "auto",
                                }}
                              >
                                {JSON.stringify(assignee.debug, null, 2)}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Graph Context</h2>
                    <div style={{ fontSize: 12, color: "#64748b", maxWidth: 420 }}>
                      Graph is a visual guide to illustrate signals indicated by patent filings. Nodes correspond to patent filings: size indicates signal relevance; color (cluster) indicates semantically similar patent filings; edges connect the most similar patent filings.
                    </div>
                  </div>
                  {selectedSignal && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#0f172a",
                        border: "1px solid #0284c7",
                        outline: "2px solid rgba(2,132,199,0.35)",
                        outlineOffset: 2,
                        borderRadius: 999,
                        padding: "6px 14px",
                        background: "#e0f2fe",
                      }}
                    >
                      Hightlight {SIGNAL_LABELS[selectedSignal]}
                    </span>
                  )}
                </div>
                <div style={{ height: 520, border: "1px solid #e2e8f0", borderRadius: 12, background: "#ffffff" }}>
                  <SigmaWhitespaceGraph
                    data={result.graph}
                    height={520}
                    selectedSignal={selectedSignal}
                    highlightedNodeIds={highlightedNodes}
                  />
                </div>
              </div>
            </Card>

            {debugSummary && (
              <Card>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Debug payload</div>
                <pre
                  style={{
                    background: "#0f172a",
                    color: "#e2e8f0",
                    fontSize: 11,
                    padding: 12,
                    borderRadius: 8,
                    overflowX: "auto",
                  }}
                >
                  {debugSummary}
                </pre>
              </Card>
            )}
          </>
        )}

        <footer style={{ marginTop: 24, textAlign: "center", color: "#64748b", fontSize: 12, fontWeight: 500 }}>
          2025 © Phaethon Order LLC | <a href="mailto:support@phaethon.llc" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">support@phaethon.llc</a> | <a href="https://phaethonorder.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">phaethonorder.com</a> | <a href="/docs" className="text-blue-400 hover:underline">Legal</a>
        </footer>
      </div>
    </div>
  );
}
