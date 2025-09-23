"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import forceAtlas2 from "graphology-layout-forceatlas2";

export type WsNode = {
  id: string;
  cluster_id: number;
  score: number; // used for size
  density?: number;
  title?: string;
  x?: number;
  y?: number;
};

export type WsEdge = {
  source: string;
  target: string;
  w?: number; // weight
};

export type WsGraph = { nodes: WsNode[]; edges: WsEdge[] };

export type WhitespaceRunContext = {
  focusKeywords?: string[];
  focusCpcLike?: string[];
  alpha?: number;
  beta?: number;
  neighbors?: number; // K in KNN
  resolution?: number; // community detection granularity
  dateFrom?: string;
  dateTo?: string;
};

export type SigmaWhitespaceGraphProps = {
  data: WsGraph | null;
  height?: number;
  context?: WhitespaceRunContext;
};

function hslToHex(h: number, s: number, l: number): string {
  // h [0,360], s/l [0,1]
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (0 <= hp && hp < 1) { r = c; g = x; b = 0; }
  else if (1 <= hp && hp < 2) { r = x; g = c; b = 0; }
  else if (2 <= hp && hp < 3) { r = 0; g = c; b = x; }
  else if (3 <= hp && hp < 4) { r = 0; g = x; b = c; }
  else if (4 <= hp && hp < 5) { r = x; g = 0; b = c; }
  else if (5 <= hp && hp < 6) { r = c; g = 0; b = x; }
  const m = l - c / 2;
  const rr = Math.round((r + m) * 255);
  const gg = Math.round((g + m) * 255);
  const bb = Math.round((b + m) * 255);
  return `#${rr.toString(16).padStart(2, "0")}${gg.toString(16).padStart(2, "0")}${bb.toString(16).padStart(2, "0")}`;
}

function colorForCluster(clusterId: number): string {
  // stable pastel-ish palette in hex
  const hue = (Math.abs(clusterId) * 47) % 360;
  return hslToHex(hue, 0.65, 0.56);
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function formatGooglePatentId(pubId: string): string {
  if (!pubId) return "";
  const cleanedId = pubId.replace(/[- ]/g, "");
  const regex = /^(US)(\d{4})(\d{6})([A-Z]\d{1,2})$/;
  const match = cleanedId.match(regex);
  if (match) {
    const [, country, year, serial, kindCode] = match as any;
    const correctedSerial = `0${serial}`; // ensure leading 0
    return `${country}${year}${correctedSerial}${kindCode}`;
  }
  return cleanedId;
}

export default function SigmaWhitespaceGraph({ data, height = 400, context }: SigmaWhitespaceGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<any | null>(null);
  const graphRef = useRef<any | null>(null);
  const initialCamRef = useRef<any | null>(null);
  const selectedRef = useRef<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const neighborsRef = useRef<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedAttrs, setSelectedAttrs] = useState<any | null>(null);
  const [highlightMatches, setHighlightMatches] = useState<boolean>(true);

  // compute min/max score for sizing
  const sizeScale = useMemo(() => {
    const scores = (data?.nodes ?? []).map((n) => Number(n.score) || 0);
    const min = scores.length ? Math.min(...scores) : 0;
    const max = scores.length ? Math.max(...scores) : 1;
    const denom = max - min || 1;
    return (s: number) => 2 + 10 * ((s - min) / denom); // node size in px
  }, [data]);

  // stable cluster -> color map
  const clusterColor = useMemo(() => {
    const ids = new Set<number>();
    (data?.nodes ?? []).forEach((n) => ids.add(Number(n.cluster_id) || 0));
    const map = new Map<number, string>();
    Array.from(ids).sort((a, b) => a - b).forEach((cid, i) => {
      map.set(cid, colorForCluster(cid));
    });
    return map;
  }, [data]);

  // normalized keywords from context
  const normKeywords = useMemo(() => {
    const kws = Array.isArray(context?.focusKeywords) ? context!.focusKeywords : [];
    return kws.map((k) => k.toLowerCase().trim()).filter(Boolean);
  }, [context?.focusKeywords]);

  // helpers for tooltip highlighting
  function escapeHtml(s: string) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function highlightHtml(text: string, keywords: string[]) {
    let out = escapeHtml(text || "");
    if (!keywords.length || !out) return out;
    // replace longest first to avoid nested marks
    const sorted = [...keywords].sort((a, b) => b.length - a.length);
    for (const kw of sorted) {
      if (!kw) continue;
      const re = new RegExp(`(${escapeRegExp(kw)})`, "ig");
      out = out.replace(re, "<mark>$1</mark>");
    }
    return out;
  }
  function computeHitTerms(text: string, keywords: string[]) {
    const t = (text || "").toLowerCase();
    const set = new Set<string>();
    for (const kw of keywords) if (kw && t.includes(kw)) set.add(kw);
    return Array.from(set);
  }

  useEffect(() => {
    if (!containerRef.current) return;

    // dispose previous renderer
    if (rendererRef.current) {
      rendererRef.current.kill();
      rendererRef.current = null;
    }

    // empty container
    containerRef.current.innerHTML = "";

    if (!data) return;

    // build graphology graph
    const g = new Graph();
    for (const n of data.nodes) {
      const key = n.id;
      const x = Number.isFinite(n.x as number) ? Number(n.x) : Math.random();
      const y = Number.isFinite(n.y as number) ? Number(n.y) : Math.random();
      const size = sizeScale(Number(n.score) || 0);
      const color = clusterColor.get(Number(n.cluster_id)) || colorForCluster(n.cluster_id);
      const title: string = (n as any).title || "";
      const matchTerms = computeHitTerms(title, normKeywords);
      if (!g.hasNode(key)) {
        g.addNode(key, {
          x,
          y,
          size,
          color,
          score: n.score,
          cluster_id: n.cluster_id,
          label: key,
          title,
          hasMatch: matchTerms.length > 0,
          matchTerms,
          // Thin black outline around each node
          borderColor: "#000000",
          borderSize: 1,
        });
      }
    }
    for (const e of data.edges) {
      const key = `${e.source}->${e.target}`;
      if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue;
      if (!g.hasEdge(e.source, e.target)) {
        g.addEdge(e.source, e.target, { weight: e.w ?? 1 });
      }
    }

    // run a short FA2 layout to settle positions if coordinates are missing or rough
    try {
      forceAtlas2.assign(g, { iterations: 200, settings: { slowDown: 10, gravity: 1, scalingRatio: 10 } });
    } catch {}

    // create sigma renderer
    const renderer = new Sigma(g, containerRef.current, {
      renderLabels: false,
      allowInvalidContainer: true,
      zIndex: true,
      defaultEdgeColor: "#cbd5e1",
    });

    rendererRef.current = renderer;
    graphRef.current = g;
    try {
      // Save initial camera state to allow resetting the view later
      initialCamRef.current = renderer.getCamera().getState();
    } catch {}

    // simple hover tooltips
    const el = containerRef.current;
    const tooltip = document.createElement("div");
    Object.assign(tooltip.style as any, {
      position: "absolute",
      background: "white",
      border: "1px solid #e5e7eb",
      padding: "6px 8px",
      fontSize: "12px",
      borderRadius: "6px",
      boxShadow: "0 2px 6px rgba(0,0,0,0.09)",
      pointerEvents: "none",
      zIndex: 10,
      display: "none",
    });
    el!.appendChild(tooltip);

    const displayTooltip = (nodeKey: string, x: number, y: number) => {
      const attrs = g.getNodeAttributes(nodeKey) as any;
      const titleHtml = attrs?.title ? highlightHtml(String(attrs.title), normKeywords) : "";
      const matches = Array.isArray(attrs?.matchTerms) && attrs.matchTerms.length > 0
        ? `<div style=\"margin-top:4px;color:#475569;font-size:11px\">matches: <em>${escapeHtml(attrs.matchTerms.join(", "))}</em></div>`
        : "";
      tooltip.innerHTML = `<div style=\"font-size:12px;max-width:360px\">`
        + `<div style=\"font-weight:700;color:#0f172a\">${escapeHtml(nodeKey)}</div>`
        + (titleHtml ? `<div style=\"margin-top:2px;color:#0f172a\">${titleHtml}</div>` : "")
        + `<div style=\"color:#64748b\">score: ${Number(attrs.score).toFixed(3)} · cluster: ${attrs.cluster_id}</div>`
        + matches
        + `</div>`;
      tooltip.style.left = `${x + 12}px`;
      tooltip.style.top = `${y + 12}px`;
      tooltip.style.display = "block";
    };

    const hideTooltip = () => {
      tooltip.style.display = "none";
    };

    const handleEnterNode = ({ node }: any) => {
      const dd = renderer.getNodeDisplayData(node) as any;
      if (!dd) return;
      hoveredRef.current = node;
      renderer.refresh();
      displayTooltip(node, dd.x, dd.y);
    };

    const handleLeaveNode = () => {
      hoveredRef.current = null;
      hideTooltip();
      renderer.refresh();
    };

    // reducers for highlighting selection
    const nodeReducer = (node: string, data: any) => {
      const sel = selectedRef.current;
      const hov = hoveredRef.current;
      const emphasizeMatches = highlightMatches && normKeywords.length > 0;
      if (!sel) {
        // ensure original color is applied (avoid default black)
        const orig = (graphRef.current?.getNodeAttribute(node, "color")) || data.color;
        const isHovered = hov === node;
        if (emphasizeMatches) {
          const isMatch = !!data.hasMatch;
          if (isMatch) {
            return { ...data, color: orig, borderColor: "#2563eb", borderSize: 3 };
          } else {
            return { ...data, color: orig, opacity: 0.25, borderColor: "#000000", borderSize: isHovered ? 2 : 1 };
          }
        }
        return { ...data, color: orig, borderColor: "#000000", borderSize: isHovered ? 2 : 1 };
      }
      if (node === sel) return { ...data, size: (data.size || 4) * 1.3, zIndex: 2, borderColor: "#000000", borderSize: 2 };
      if (hov === node) return { ...data, borderColor: "#000000", borderSize: 2 };
      if (neighborsRef.current.has(node)) return { ...data, size: (data.size || 4) * 1.1, borderColor: "#000000", borderSize: 1 };
      // Slightly dim non-neighbors instead of fully greying out
      const orig = (graphRef.current?.getNodeAttribute(node, "color")) || data.color;
      return { ...data, color: orig, opacity: 0.35, borderColor: "#000000", borderSize: 1 };
    };
    const edgeReducer = (edge: string, data: any) => {
      const sel = selectedRef.current;
      if (!sel) {
        if (highlightMatches && normKeywords.length > 0) {
          try {
            const s = g.source(edge);
            const t = g.target(edge);
            const sMatch = g.getNodeAttribute(s, "hasMatch");
            const tMatch = g.getNodeAttribute(t, "hasMatch");
            if (!sMatch && !tMatch) return { ...data, color: "#e2e8f0", opacity: 0.2 };
          } catch {}
        }
        return data;
      }
      const s = g.source(edge);
      const t = g.target(edge);
      if (s === sel || t === sel) return { ...data, color: "#94a3b8", size: (data.size || 1) };
      return { ...data, color: "#e2e8f0", opacity: 0.3 };
    };
    renderer.setSetting("nodeReducer", nodeReducer as any);
    renderer.setSetting("edgeReducer", edgeReducer as any);

    renderer.on("enterNode", handleEnterNode);
    renderer.on("leaveNode", handleLeaveNode);

    const onClickNode = ({ node }: any) => {
      selectedRef.current = node;
      neighborsRef.current = new Set(g.neighbors(node));
      setSelectedNode(node);
      setSelectedAttrs(g.getNodeAttributes(node));
      // Soft-center on selection without altering zoom level
      try {
        const cam = renderer.getCamera();
        const x = g.getNodeAttribute(node, "x");
        const y = g.getNodeAttribute(node, "y");
        if (Number.isFinite(x) && Number.isFinite(y)) {
          cam.goto({ x, y });
        }
      } catch {}
      renderer.refresh();
    };
    const onClickStage = () => {
      selectedRef.current = null;
      neighborsRef.current = new Set();
      setSelectedNode(null);
      setSelectedAttrs(null);
      hideTooltip();
      renderer.refresh();
    };

    renderer.on("clickNode", onClickNode);
    renderer.on("clickStage", onClickStage);

    // resize observer
    const ro = new ResizeObserver(() => renderer.refresh());
    ro.observe(containerRef.current);

    return () => {
  try { renderer.off("enterNode", handleEnterNode); } catch {}
  try { renderer.off("leaveNode", handleLeaveNode); } catch {}
  try { renderer.off("clickNode", onClickNode); } catch {}
  try { renderer.off("clickStage", onClickStage); } catch {}
      try { ro.disconnect(); } catch {}
      try { renderer.kill(); } catch {}
      rendererRef.current = null;
      graphRef.current = null;
    };
  }, [data, sizeScale, highlightMatches, normKeywords]);

  // Sidebar details for selected node
  const details = selectedNode && selectedAttrs ? (
    <div style={{ width: 320, padding: 12, borderLeft: "1px solid #e5e7eb", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <strong style={{ fontSize: 13 }}>Details</strong>
        <button
          onClick={() => {
            selectedRef.current = null;
            neighborsRef.current = new Set();
            setSelectedNode(null);
            setSelectedAttrs(null);
            rendererRef.current?.refresh();
          }}
          style={{ fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 6, padding: "2px 8px", background: "white", cursor: "pointer" }}
        >
          Clear
        </button>
      </div>
      <div style={{ fontSize: 12, color: "#0f172a", lineHeight: 1.6, display: "grid", gap: 8 }}>
        <div><span style={{ color: "#64748b" }}>ID:</span> {selectedNode}</div>
        {selectedAttrs?.title && (
          <div style={{ color: "#334155" }}>
            {String(selectedAttrs.title)}
          </div>
        )}
        {Array.isArray(selectedAttrs?.matchTerms) && selectedAttrs.matchTerms.length > 0 && (
          <div style={{ color: "#475569" }}>
            <span style={{ color: "#64748b" }}>Matches:</span> {selectedAttrs.matchTerms.join(", ")}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#64748b" }}>Cluster:</span>
          <span>{String(selectedAttrs.cluster_id)}</span>
          <span style={{ width: 10, height: 10, background: selectedAttrs.color || "#000", display: "inline-block", borderRadius: 2, border: "1px solid #e2e8f0" }} />
        </div>
        <div>
          <div><span style={{ color: "#64748b" }}>Score:</span> {Number(selectedAttrs.score).toFixed(3)}</div>
          <div style={{ color: "#475569", marginTop: 4 }}>
            Score estimates how promising this publication is as whitespace relative to your focus. Larger = farther from your focus (weighted by recent momentum in its cluster).
          </div>
          {context && (
            <div style={{ color: "#64748b", marginTop: 4 }}>
              α (distance weight) = <strong style={{ color: "#0f172a" }}>{Number(context.alpha ?? 0).toFixed(2)}</strong>,
              {' '}β (momentum weight) = <strong style={{ color: "#0f172a" }}>{Number(context.beta ?? 0).toFixed(2)}</strong>. Node size is a normalized view of this score.
            </div>
          )}
        </div>
        {selectedAttrs.density !== undefined && (
          <div><span style={{ color: "#64748b" }}>Density:</span> {Number(selectedAttrs.density).toFixed(3)}</div>
        )}
        <div>
          <span style={{ color: "#64748b" }}>Neighbors:</span> {neighborsRef.current.size}
          {context?.neighbors !== undefined && (
            <span style={{ color: "#64748b" }}> (K = {context.neighbors})</span>
          )}
        </div>

        {context && (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontWeight: 600, fontSize: 12 }}>Relation to your search</div>
            <div style={{ color: "#475569" }}>
              The graph is built from publications filtered by focus: 
              {Array.isArray(context.focusKeywords) && context.focusKeywords.length > 0 && (
                <>
                  {" "}keywords: <em>{context.focusKeywords.join(", ")}</em>
                </>
              )}
              {Array.isArray(context.focusCpcLike) && context.focusCpcLike.length > 0 && (
                <>
                  {context.focusKeywords && context.focusKeywords.length > 0 ? "; " : " "}
                  CPC like: <em>{context.focusCpcLike.join(", ")}</em>
                </>
              )}
              {(context.dateFrom || context.dateTo) && (
                <>
                  {"; window: "}
                  <em>{context.dateFrom || "…"}</em>
                  {" → "}
                  <em>{context.dateTo || "…"}</em>
                </>
              )}.
              This node is connected within that similarity network. A higher score indicates a sparsely explored area adjacent to your focus.
            </div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <a
          href={`https://patents.google.com/patent/${encodeURIComponent(formatGooglePatentId(selectedNode))}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12, border: "1px solid #e5e7eb", justifyContent: "center", borderRadius: 6, padding: "6px 10px", background: "white", textDecoration: "underline", color: "#0f172a", alignContent: "center", alignItems: "center", fontWeight: 500 }}
        >
          View Publication
        </a>
      </div>
    </div>
  ) : null;

  return (
    <div style={{ height, display: "flex", position: "relative", background: "#f8fafc", borderRadius: 8 }}>
      <div style={{ flex: 1, position: "relative" }} ref={containerRef} />
      {/* Overlay controls */}
      {normKeywords.length > 0 && (
        <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(255,255,255,0.95)", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 8px", fontSize: 12, color: "#0f172a", display: "flex", gap: 8, alignItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={highlightMatches} onChange={(e) => setHighlightMatches(e.target.checked)} />
            Highlight keyword matches
          </label>
        </div>
      )}
      {details}
    </div>
  );
}
