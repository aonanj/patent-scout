"use client";
import React, { useEffect, useMemo, useRef } from "react";
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

function colorForCluster(clusterId: number): string {
  // simple pastel color palette based on cluster id
  const hue = (clusterId * 47) % 360;
  return `hsl(${hue} 70% 55%)`;
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

export default function SigmaWhitespaceGraph({ data, height = 400 }: SigmaWhitespaceGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<any | null>(null);
  const graphRef = useRef<any | null>(null);

  // compute min/max score for sizing
  const sizeScale = useMemo(() => {
    const scores = (data?.nodes ?? []).map((n) => Number(n.score) || 0);
    const min = scores.length ? Math.min(...scores) : 0;
    const max = scores.length ? Math.max(...scores) : 1;
    const denom = max - min || 1;
    return (s: number) => 2 + 10 * ((s - min) / denom); // node size in px
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
      const color = colorForCluster(n.cluster_id);
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
      const cam = renderer.getCamera();
      const { x, y } = renderer.camera.graphToViewport(g.getNodeAttribute(node, "x"), g.getNodeAttribute(node, "y"));
      displayTooltip(node, x, y);
    };

    const handleLeaveNode = () => hideTooltip();

    renderer.on("enterNode", handleEnterNode);
    renderer.on("leaveNode", handleLeaveNode);

    // resize observer
    const ro = new ResizeObserver(() => renderer.refresh());
    ro.observe(containerRef.current);

    return () => {
      renderer.off("enterNode", handleEnterNode);
      renderer.off("leaveNode", handleLeaveNode);
      try { ro.disconnect(); } catch {}
      try { renderer.kill(); } catch {}
      rendererRef.current = null;
      graphRef.current = null;
    };
  }, [data, sizeScale]);

  return (
    <div style={{ height }} ref={containerRef} />
  );
}
