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
  x?: number;
  y?: number;
};

export type WsEdge = {
  source: string;
  target: string;
  w?: number; // weight
};

export type WsGraph = { nodes: WsNode[]; edges: WsEdge[] };

export type SigmaWhitespaceGraphProps = {
  data: WsGraph | null;
  height?: number;
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

export default function SigmaWhitespaceGraph({ data, height = 400 }: SigmaWhitespaceGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<any | null>(null);
  const graphRef = useRef<any | null>(null);
  const selectedRef = useRef<string | null>(null);
  const neighborsRef = useRef<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedAttrs, setSelectedAttrs] = useState<any | null>(null);

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
      if (!g.hasNode(key)) {
        g.addNode(key, { x, y, size, color, score: n.score, cluster_id: n.cluster_id, label: key });
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
      allowInvalidContainer: false,
      zIndex: true,
      defaultEdgeColor: "#cbd5e1",
    });

    rendererRef.current = renderer;
    graphRef.current = g;

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
      tooltip.innerHTML = `<strong>${nodeKey}</strong><br/>score: ${Number(attrs.score).toFixed(3)}<br/>cluster: ${attrs.cluster_id}`;
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
      displayTooltip(node, dd.x, dd.y);
    };

    const handleLeaveNode = () => hideTooltip();

    // reducers for highlighting selection
    const nodeReducer = (node: string, data: any) => {
      const sel = selectedRef.current;
      if (!sel) {
        // ensure original color is applied (avoid default black)
        const orig = (graphRef.current?.getNodeAttribute(node, "color")) || data.color;
        return { ...data, color: orig };
      }
      if (node === sel) return { ...data, size: (data.size || 4) * 1.3, zIndex: 2 };
      if (neighborsRef.current.has(node)) return { ...data, size: (data.size || 4) * 1.1 };
      // Slightly dim non-neighbors instead of fully greying out
      const orig = (graphRef.current?.getNodeAttribute(node, "color")) || data.color;
      return { ...data, color: orig, opacity: 0.35 };
    };
    const edgeReducer = (edge: string, data: any) => {
      const sel = selectedRef.current;
      if (!sel) return data;
      const s = g.source(edge);
      const t = g.target(edge);
      if (s === sel || t === sel) return { ...data, color: "#94a3b8", size: (data.size || 1) };
      return { ...data, color: "#e2e8f0", opacity: 0.3 };
    };
    renderer.setSetting("nodeReducer", nodeReducer as any);
    renderer.setSetting("edgeReducer", edgeReducer as any);

    renderer.on("enterNode", handleEnterNode);
    renderer.on("leaveNode", handleLeaveNode);

    renderer.on("clickNode", ({ node }: any) => {
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
          // Sigma v2: use camera.animate to move the view center to the node
          cam.animate({ x, y }, { duration: 350 });
        }
      } catch {}
      renderer.refresh();
    });
    renderer.on("clickStage", () => {
      selectedRef.current = null;
      neighborsRef.current = new Set();
      setSelectedNode(null);
      setSelectedAttrs(null);
      hideTooltip();
      renderer.refresh();
    });

    // resize observer
    const ro = new ResizeObserver(() => renderer.refresh());
    ro.observe(containerRef.current);

    return () => {
      renderer.off("enterNode", handleEnterNode);
      renderer.off("leaveNode", handleLeaveNode);
      renderer.off("clickNode");
      renderer.off("clickStage");
      try { ro.disconnect(); } catch {}
      try { renderer.kill(); } catch {}
      rendererRef.current = null;
      graphRef.current = null;
    };
  }, [data, sizeScale]);

  // Sidebar details for selected node
  const details = selectedNode && selectedAttrs ? (
    <div style={{ width: 280, padding: 12, borderLeft: "1px solid #e5e7eb", background: "#fff" }}>
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
      <div style={{ fontSize: 12, color: "#0f172a", lineHeight: 1.6 }}>
        <div><span style={{ color: "#64748b" }}>ID:</span> {selectedNode}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#64748b" }}>Cluster:</span>
          <span>{String(selectedAttrs.cluster_id)}</span>
          <span style={{ width: 10, height: 10, background: selectedAttrs.color || "#000", display: "inline-block", borderRadius: 2, border: "1px solid #e2e8f0" }} />
        </div>
        <div><span style={{ color: "#64748b" }}>Score:</span> {Number(selectedAttrs.score).toFixed(3)}</div>
        {selectedAttrs.density !== undefined && (
          <div><span style={{ color: "#64748b" }}>Density:</span> {Number(selectedAttrs.density).toFixed(3)}</div>
        )}
        <div><span style={{ color: "#64748b" }}>Neighbors:</span> {neighborsRef.current.size}</div>
      </div>
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <button
          onClick={() => {
            const g = graphRef.current;
            const r = rendererRef.current;
            if (!g || !r || !selectedNode) return;
            const nodeX = g.getNodeAttribute(selectedNode, "x");
            const nodeY = g.getNodeAttribute(selectedNode, "y");
            if (!Number.isFinite(nodeX) || !Number.isFinite(nodeY)) return;
            try {
              const cam = r.getCamera();
              const currentState = cam.getState();
              
              // In Sigma.js v2, camera coordinates represent the center of the viewport
              // To center a node, we simply move the camera to the node's position
              // while preserving the current zoom ratio
              cam.animate({ 
                x: nodeX, 
                y: nodeY,
                ratio: currentState.ratio 
              }, { duration: 500 });
            } catch (error) {
              console.warn("Error centering on node:", error);
            }
          }}
          style={{ fontSize: 12, justifyContent: "center", border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 10px", background: "white", cursor: "pointer", textDecoration: "underline", alignContent: "center", alignItems: "center", fontWeight: 500 }}
        >
          Center on Node
        </button>
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
      {details}
    </div>
  );
}
