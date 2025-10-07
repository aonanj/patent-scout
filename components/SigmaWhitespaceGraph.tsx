"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import forceAtlas2 from "graphology-layout-forceatlas2";

export type SignalKind = "focus_shift" | "emerging_gap" | "crowd_out" | "bridge";

export type WsNode = {
  id: string;
  cluster_id: number;
  assignee?: string | null;
  x?: number;
  y?: number;
  signals?: SignalKind[];
  relevance?: number;
  title?: string | null;
  tooltip?: string | null;
};

export type WsEdge = {
  source: string;
  target: string;
  weight?: number;
};

export type WsGraph = {
  nodes: WsNode[];
  edges: WsEdge[];
};

export type SigmaWhitespaceGraphProps = {
  data: WsGraph | null;
  height?: number;
  selectedSignal?: SignalKind | null;
  highlightedNodeIds?: string[];
};

const SIGNAL_LABELS: Record<SignalKind, string> = {
  focus_shift: "Focus Shift",
  emerging_gap: "Emerging Gap",
  crowd_out: "Crowd-out Risk",
  bridge: "Bridge Opportunity",
};

function hslToHex(h: number, s: number, l: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  s = clamp(s);
  l = clamp(l);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) {
    r = c;
    g = x;
  } else if (hp >= 1 && hp < 2) {
    r = x;
    g = c;
  } else if (hp >= 2 && hp < 3) {
    g = c;
    b = x;
  } else if (hp >= 3 && hp < 4) {
    g = x;
    b = c;
  } else if (hp >= 4 && hp < 5) {
    r = x;
    b = c;
  } else if (hp >= 5 && hp < 6) {
    r = c;
    b = x;
  }
  const m = l - c / 2;
  const toHex = (v: number) => Math.round((v + m) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function colorForCluster(clusterId: number): string {
  const hue = (Math.abs(clusterId) * 47) % 360;
  return hslToHex(hue, 0.62, 0.6);
}

function normalizeRelevance(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0.2;
  const v = Number(value);
  if (Number.isNaN(v)) return 0.2;
  return Math.max(0, Math.min(1, v));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatGooglePatentId(pubId: string): string {
  if (!pubId) return "";
  const cleanedId = pubId.replace(/[- ]/g, "");
  const regex = /^(US)(\d{4})(\d{6})([A-Z]\d{1,2})$/;
  const match = cleanedId.match(regex);
  if (match) {
    const [, country, year, serial, kindCode] = match;
    const correctedSerial = `0${serial}`;
    return `${country}${year}${correctedSerial}${kindCode}`;
  }
  return cleanedId;
}

export default function SigmaWhitespaceGraph({
  data,
  height = 400,
  selectedSignal = null,
  highlightedNodeIds,
}: SigmaWhitespaceGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<any>(null);
  const graphRef = useRef<any>(null);
  const selectedRef = useRef<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const neighborsRef = useRef<Set<string>>(new Set());
  const signalRef = useRef<SignalKind | null>(selectedSignal ?? null);
  const highlightedRef = useRef<Set<string>>(new Set(highlightedNodeIds ?? []));
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedAttrs, setSelectedAttrs] = useState<any | null>(null);

  const clusterColor = useMemo(() => {
    const map = new Map<number, string>();
    (data?.nodes ?? []).forEach((node) => {
      if (!map.has(node.cluster_id)) {
        map.set(node.cluster_id, colorForCluster(node.cluster_id));
      }
    });
    return map;
  }, [data]);

  const sizeForNode = useCallback((node: WsNode) => {
    const rel = normalizeRelevance(node.relevance);
    return 4 + 10 * rel;
  }, []);

  useEffect(() => {
    signalRef.current = selectedSignal ?? null;
    if (rendererRef.current) {
      rendererRef.current.refresh();
    }
  }, [selectedSignal]);

  useEffect(() => {
    highlightedRef.current = new Set(highlightedNodeIds ?? []);
    if (rendererRef.current) {
      rendererRef.current.refresh();
    }
    if (highlightedNodeIds && highlightedNodeIds.length > 0 && rendererRef.current && graphRef.current) {
      const renderer = rendererRef.current;
      const g = graphRef.current;
      const coords = highlightedNodeIds
        .map((id) => {
          if (!g.hasNode(id)) return null;
          try {
            return renderer.getNodeDisplayData(id);
          } catch {
            return null;
          }
        })
        .filter((v): v is { x: number; y: number } => Boolean(v));
      if (coords.length > 0) {
        const xs = coords.map((c) => c.x);
        const ys = coords.map((c) => c.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const dx = maxX - minX;
        const dy = maxY - minY;
        const radius = Math.max(dx, dy) || 1;
        try {
          renderer.getCamera().animate({ x: cx, y: cy, ratio: Math.min(2.5, Math.max(0.3, 1.2 / radius)) }, { duration: 400 });
        } catch {}
      }
    }
  }, [highlightedNodeIds]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (rendererRef.current) {
      rendererRef.current.kill();
      rendererRef.current = null;
    }
    const container = containerRef.current;
    container.innerHTML = "";

    if (!data) {
      graphRef.current = null;
      setSelectedNode(null);
      setSelectedAttrs(null);
      return;
    }

    const g = new Graph();
    for (const node of data.nodes) {
      if (!node?.id) continue;
      const x = Number.isFinite(node.x) ? Number(node.x) : Math.random();
      const y = Number.isFinite(node.y) ? Number(node.y) : Math.random();
      const color = clusterColor.get(node.cluster_id) || colorForCluster(node.cluster_id);
      g.addNode(node.id, {
        x,
        y,
        size: sizeForNode(node),
        color,
        baseColor: color,
        cluster_id: node.cluster_id,
        assignee: node.assignee ?? "Unknown assignee",
        signals: Array.isArray(node.signals) ? node.signals : [],
        tooltip: node.tooltip ?? "",
        title: node.title ?? "",
        relevance: normalizeRelevance(node.relevance),
      });
    }
    for (const edge of data.edges) {
      const src = edge.source;
      const dst = edge.target;
      if (!g.hasNode(src) || !g.hasNode(dst)) continue;
      if (g.hasEdge(src, dst)) continue;
      g.addEdge(src, dst, { weight: edge.weight ?? 1 });
    }

    try {
      forceAtlas2.assign(g, {
        iterations: 120,
        settings: { slowDown: 8, gravity: 1.5, scalingRatio: 8 },
      });
    } catch {}

    const renderer = new Sigma(g, container, {
      allowInvalidContainer: true,
      renderLabels: false,
      defaultEdgeColor: "#cbd5e1",
      zIndex: true,
    });

    rendererRef.current = renderer;
    graphRef.current = g;
    selectedRef.current = null;
    hoveredRef.current = null;
    neighborsRef.current = new Set();

    const tooltip = document.createElement("div");
    const tooltipStyle: Partial<CSSStyleDeclaration> = {
      position: "absolute",
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      padding: "6px 8px",
      fontSize: "12px",
      borderRadius: "6px",
      boxShadow: "0 4px 10px rgba(15,23,42,0.12)",
      pointerEvents: "none",
      zIndex: "20",
      display: "none",
      maxWidth: "320px",
      color: "#0f172a",
    };
    Object.assign(tooltip.style, tooltipStyle);
    container.appendChild(tooltip);

    const showTooltip = (nodeKey: string, xPos: number, yPos: number) => {
      if (!graphRef.current) return;
      const attrs = graphRef.current.getNodeAttributes(nodeKey) as any;
      const title = attrs?.title ? escapeHtml(String(attrs.title)) : escapeHtml(nodeKey);
      const assignee = attrs?.assignee ? `<div style="color:#475569;margin-top:2px">${escapeHtml(String(attrs.assignee))}</div>` : "";
      const signals = Array.isArray(attrs?.signals) && attrs.signals.length > 0
        ? `<div style="color:#64748b;margin-top:4px">${attrs.signals.map((s: SignalKind) => SIGNAL_LABELS[s]).join(" · ")}</div>`
        : "";
      const rationale = attrs?.tooltip
        ? `<div style="color:#475569;margin-top:6px">${escapeHtml(String(attrs.tooltip))}</div>`
        : "";
      tooltip.innerHTML = `<div style="font-weight:600">${title}</div>${assignee}${signals}${rationale}`;
      tooltip.style.left = `${xPos + 12}px`;
      tooltip.style.top = `${yPos + 12}px`;
      tooltip.style.display = "block";
    };

    const hideTooltip = () => {
      tooltip.style.display = "none";
    };

    const nodeReducer = (key: string, attributes: any) => {
      const highlightSet = highlightedRef.current;
      const selected = selectedRef.current;
      const hovered = hoveredRef.current;
      const neighbors = neighborsRef.current;
      const signal = signalRef.current;
      const baseColor = attributes.baseColor || attributes.color;
      let opacity = 1;
      let size = attributes.size;
      let borderColor = "#000000";
      let borderSize = 1;
      let zIndex = 1;

      const matchesSignal = signal ? Array.isArray(attributes.signals) && attributes.signals.includes(signal) : true;

      if (highlightSet.size > 0) {
        const isHighlight = highlightSet.has(key);
        if (isHighlight) {
          size = size * 1.3;
          borderColor = "#0f172a";
          borderSize = 2;
          zIndex = 3;
        } else {
          opacity = 0.08;
        }
      } else if (selected) {
        if (key === selected) {
          size = size * 1.35;
          borderColor = "#0f172a";
          borderSize = 2;
          zIndex = 3;
        } else if (neighbors.has(key)) {
          size = size * 1.18;
          borderColor = "#1e293b";
          borderSize = 1.5;
          opacity = 0.9;
          zIndex = 2;
        } else {
          opacity = 0.12;
        }
      } else if (signal) {
        if (matchesSignal) {
          size = size * 1.15;
          zIndex = 2;
        } else {
          opacity = 0.12;
        }
      }

      if (hovered === key) {
        borderColor = "#0f172a";
        borderSize = 2;
        zIndex = 4;
      }

      return {
        ...attributes,
        color: baseColor,
        opacity,
        size,
        borderColor,
        borderSize,
        zIndex,
      };
    };

    const edgeReducer = (edgeKey: string, attributes: any) => {
      const highlightSet = highlightedRef.current;
      const selected = selectedRef.current;
      const signal = signalRef.current;

      if (!graphRef.current) return attributes;
      const src = graphRef.current.source(edgeKey);
      const dst = graphRef.current.target(edgeKey);

      if (highlightSet.size > 0) {
        if (highlightSet.has(src) && highlightSet.has(dst)) {
          return { ...attributes, color: "#94a3b8", opacity: 0.9 };
        }
        return { ...attributes, opacity: 0.05 };
      }
      if (selected) {
        if (src === selected || dst === selected) {
          return { ...attributes, color: "#94a3b8", opacity: 0.9 };
        }
        return { ...attributes, opacity: 0.08 };
      }
      if (signal) {
        const srcSignals = graphRef.current.getNodeAttribute(src, "signals");
        const dstSignals = graphRef.current.getNodeAttribute(dst, "signals");
        const srcHas = Array.isArray(srcSignals) && srcSignals.includes(signal);
        const dstHas = Array.isArray(dstSignals) && dstSignals.includes(signal);
        if (srcHas && dstHas) {
          return { ...attributes, opacity: 0.8, color: "#cbd5f5" };
        }
        return { ...attributes, opacity: 0.08 };
      }
      return { ...attributes, opacity: 0.35 };
    };

    renderer.setSetting("nodeReducer", nodeReducer as any);
    renderer.setSetting("edgeReducer", edgeReducer as any);

    const handleEnterNode = ({ node }: { node: string }) => {
      hoveredRef.current = node;
      try {
        const display = renderer.getNodeDisplayData(node);
        if (display) {
          showTooltip(node, display.x, display.y);
        }
      } catch {}
      renderer.refresh();
    };

    const handleLeaveNode = () => {
      hoveredRef.current = null;
      hideTooltip();
      renderer.refresh();
    };

    const handleClickNode = ({ node }: { node: string }) => {
      selectedRef.current = node;
      hoveredRef.current = null;
      hideTooltip();
      setSelectedNode(node);
      const attrs = graphRef.current?.getNodeAttributes(node);
      setSelectedAttrs(attrs ?? null);
      if (graphRef.current) {
        neighborsRef.current = new Set(graphRef.current.neighbors(node));
      }
      renderer.refresh();
    };

    const handleClickStage = () => {
      selectedRef.current = null;
      neighborsRef.current = new Set();
      setSelectedNode(null);
      setSelectedAttrs(null);
      renderer.refresh();
    };

    renderer.on("enterNode", handleEnterNode);
    renderer.on("leaveNode", handleLeaveNode);
    renderer.on("clickNode", handleClickNode);
    renderer.on("clickStage", handleClickStage);

    return () => {
      renderer.off("enterNode", handleEnterNode);
      renderer.off("leaveNode", handleLeaveNode);
      renderer.off("clickNode", handleClickNode);
      renderer.off("clickStage", handleClickStage);
      renderer.kill();
      rendererRef.current = null;
      graphRef.current = null;
      container.removeChild(tooltip);
    };
  }, [data, clusterColor, sizeForNode]);

  const details = selectedNode && selectedAttrs ? (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 280,
        maxHeight: height - 24,
        overflowY: "auto",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: 14,
        boxShadow: "0 12px 40px rgba(15,23,42,0.15)",
        fontSize: 12,
        color: "#0f172a",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Selected filing</div>
        <button
          onClick={() => {
            selectedRef.current = null;
            neighborsRef.current = new Set();
            setSelectedNode(null);
            setSelectedAttrs(null);
            rendererRef.current?.refresh();
          }}
          style={{
            fontSize: 11,
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            padding: "2px 8px",
            background: "#ffffff",
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{selectedAttrs?.title || selectedNode}</div>
        {selectedAttrs?.assignee && (
          <div style={{ marginTop: 2, color: "#475569" }}>{selectedAttrs.assignee}</div>
        )}
      </div>
      {Array.isArray(selectedAttrs?.signals) && selectedAttrs.signals.length > 0 && (
        <div style={{ color: "#64748b" }}>
          {selectedAttrs.signals.map((s: SignalKind) => SIGNAL_LABELS[s]).join(" · ")}
        </div>
      )}
      {selectedAttrs?.tooltip && (
        <div style={{ color: "#475569", lineHeight: 1.5 }}>{selectedAttrs.tooltip}</div>
      )}
      <div>
        <a
          href={`https://patents.google.com/patent/${encodeURIComponent(formatGooglePatentId(selectedNode))}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "#0f172a",
            border: "1px solid #0f172a",
            borderRadius: 8,
            padding: "6px 10px",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          View on Google Patents
        </a>
      </div>
    </div>
  ) : null;

  return (
    <div style={{ height, position: "relative", background: "#f8fafc", borderRadius: 12, overflow: "hidden" }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {details}
    </div>
  );
}
