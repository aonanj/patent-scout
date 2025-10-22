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
  focus_shift: "Convergence Toward Focus Area",
  emerging_gap: "Focus Area With Neighbor Underdevelopment",
  crowd_out: "Sharply Rising Density Near Focus Area",
  bridge: "Neighbor Linking Potential Near Focus Area",
};

const SIGNAL_ICONS: Record<SignalKind, string> = {
  focus_shift: "⇉",
  emerging_gap: "☼",
  crowd_out: "☁︎",
  bridge: "⟗",
};

type SignalTone = "opportunity" | "risk";

const SIGNAL_TONES: Record<SignalKind, SignalTone> = {
  focus_shift: "risk",
  crowd_out: "risk",
  emerging_gap: "opportunity",
  bridge: "opportunity",
};

const SIGNAL_TONE_ICONS: Record<SignalTone, string> = {
  opportunity: "✪",
  risk: "⚠︎",
};

const SIGNAL_TONE_LABELS: Record<SignalTone, string> = {
  opportunity: "Opportunity",
  risk: "Risk",
};

type StatusStyle = { background: string; color: string };

const DEFAULT_STATUS_STYLE: StatusStyle = { background: "#e2e8f0", color: "#475569" };

const STATUS_STYLE_PRESETS: Record<SignalTone, Record<SignalStatus, StatusStyle>> = {
  opportunity: {
    none: DEFAULT_STATUS_STYLE,
    weak: { background: "#dcfce7", color: "#166534" },
    medium: { background: "#86efac", color: "#14532d" },
    strong: { background: "#15803d", color: "#ffffff" },
  },
  risk: {
    none: DEFAULT_STATUS_STYLE,
    weak: { background: "#fee2e2", color: "#7f1d1d" },
    medium: { background: "#f87171", color: "#7f1d1d" },
    strong: { background: "#b91c1c", color: "#ffffff" },
  },
};

function statusStyleForSignal(type: SignalKind, status: SignalStatus): StatusStyle {
  const tone = SIGNAL_TONES[type];
  const palette = STATUS_STYLE_PRESETS[tone];
  return palette?.[status] ?? DEFAULT_STATUS_STYLE;
}

type ActiveKey = { assignee: string; type: SignalKind } | null;
type ExampleSortMode = "recent" | "related";

type NodeMeta = {
  pubDateValue: number;
  whitespaceScore: number;
  localDensity: number;
  pubDateLabel: string | null;
};

type ExamplesContext = {
  assignee: string;
  signalType: SignalKind;
  signalStatus: SignalStatus;
  signalConfidence: number;
  mode: ExampleSortMode;
};

const EXAMPLE_LIMIT = 8;

const PDF_PAGE_WIDTH = 612;
const PDF_PAGE_HEIGHT = 792;
const PDF_MARGIN = 72;
const PDF_LINE_HEIGHT = 16;
const PDF_LINES_PER_PAGE = Math.max(
  1,
  Math.floor((PDF_PAGE_HEIGHT - PDF_MARGIN * 2) / PDF_LINE_HEIGHT),
);

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

const exampleBtn: React.CSSProperties = {
  border: "1px solid #0f172a",
  background: "#0f172a",
  color: "#ffffff",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 600,
};

const exportBtn: React.CSSProperties = {
  border: "1px solid #0f172a",
  background: "#ffffff",
  color: "#0f172a",
  borderRadius: 8,
  padding: "6px 14px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid #e5e7eb",
  color: "#334155",
  background: "#eaf6ff",
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderTop: "1px solid #f1f5f9",
  verticalAlign: "top",
};

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  if (n <= 3) return "...".slice(0, Math.max(0, n));
  return `${s.slice(0, Math.max(0, n - 3))}...`;
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

function formatPubDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) {
    const y = Number(raw.slice(0, 4));
    const m = Number(raw.slice(4, 6)) - 1;
    const d = Number(raw.slice(6, 8));
    const dt = new Date(Date.UTC(y, m, d));
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  }
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      const dt = new Date(n);
      if (!Number.isNaN(dt.getTime())) {
        return dt.toISOString().slice(0, 10);
      }
    }
  }
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  return null;
}

function sanitizePdfText(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, " ");
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapPdfLine(line: string, maxChars: number): string[] {
  if (line.length === 0) return [""];
  if (line.length <= maxChars) return [line];

  const leadingMatch = line.match(/^\s*/);
  const leadingSpaces = leadingMatch ? leadingMatch[0] : "";
  const available = Math.max(8, maxChars - leadingSpaces.length);
  const words = line.trim().split(/\s+/);
  const wrapped: string[] = [];
  let current = "";

  const pushCurrent = () => {
    wrapped.push(`${leadingSpaces}${current}`.trimEnd());
    current = "";
  };

  for (const word of words) {
    if (word.length > available) {
      if (current) pushCurrent();
      let remainder = word;
      while (remainder.length > available) {
        wrapped.push(`${leadingSpaces}${remainder.slice(0, available)}`);
        remainder = remainder.slice(available);
      }
      current = remainder;
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > available) {
      pushCurrent();
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    pushCurrent();
  } else if (!wrapped.length) {
    wrapped.push(leadingSpaces.trimEnd());
  }
  return wrapped;
}

function buildSimplePdf(lines: string[]): Blob {
  const sanitizedLines = lines.map((line) => sanitizePdfText(line));
  const wrappedLines = sanitizedLines.flatMap((line) => wrapPdfLine(line, 92));
  const escapedLines = wrappedLines.map((line) => escapePdfText(line));
  const effectiveLines = escapedLines.length > 0 ? escapedLines : [""];

  const pageChunks: string[][] = [];
  for (let i = 0; i < effectiveLines.length; i += PDF_LINES_PER_PAGE) {
    pageChunks.push(effectiveLines.slice(i, i + PDF_LINES_PER_PAGE));
  }

  const pageContents = pageChunks.map((pageLines) => {
    let content = "BT\n/F1 12 Tf\n16 TL\n";
    content += `1 0 0 1 ${PDF_MARGIN} ${PDF_PAGE_HEIGHT - PDF_MARGIN} Tm\n`;
    pageLines.forEach((line, index) => {
      if (index > 0) {
        content += "T*\n";
      }
      content += `(${line}) Tj\n`;
    });
    content += "ET";
    return content;
  });

  const encoder = new TextEncoder();
  const pageContentBytes = pageContents.map((content) => encoder.encode(content));

  const pageCount = pageContents.length;
  const fontObjNumber = 3 + pageCount * 2;

  const objects: string[] = [];

  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");

  const pageObjectNumbers = pageContents.map((_, idx) => 3 + idx * 2);
  const kids = pageObjectNumbers.map((num) => `${num} 0 R`).join(" ");
  objects.push(`2 0 obj << /Type /Pages /Kids [${kids}] /Count ${pageCount} >> endobj`);

  pageContents.forEach((content, idx) => {
    const pageObjNumber = pageObjectNumbers[idx];
    const contentObjNumber = pageObjNumber + 1;
    const length = pageContentBytes[idx].length;
    objects.push(
      `${pageObjNumber} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontObjNumber} 0 R >> >> /Contents ${contentObjNumber} 0 R >> endobj`,
    );
    objects.push(
      `${contentObjNumber} 0 obj << /Length ${length} >>\nstream\n${content}\nendstream\nendobj`,
    );
  });

  objects.push(
    `${fontObjNumber} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`,
  );

  const header = "%PDF-1.3\n";
  let body = "";
  const offsets: number[] = [];
  let currentOffset = header.length;

  objects.forEach((obj) => {
    offsets.push(currentOffset);
    body += `${obj}\n`;
    currentOffset = header.length + body.length;
  });

  const xrefPosition = header.length + body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    xref += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });

  const trailer = `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF`;
  const pdfString = `${header}${body}${xref}${trailer}`;

  return new Blob([pdfString], { type: "application/pdf" });
}

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
  const [lastExamplesContext, setLastExamplesContext] = useState<ExamplesContext | null>(null);

  const selectedSignal = activeKey?.type ?? null;

  const runWhitespaceAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHighlightedNodes([]);
    setActiveKey(null);
    setLastExamplesContext(null);
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
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${res.status}`);
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
    setLastExamplesContext(null);
    setActiveKey((current) => {
      if (current && current.assignee === assignee && current.type === signal.type) {
        return null;
      }
      return { assignee, type: signal.type };
    });
  }, []);

  const nodeMetaLookup = useMemo(() => {
    const map = new Map<string, NodeMeta>();
    const nodes = result?.graph?.nodes ?? [];

    const parseMetric = (raw: unknown): number => {
      if (typeof raw === "number" && Number.isFinite(raw)) return raw;
      if (typeof raw === "string" && raw.trim() !== "") {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) return parsed;
      }
      return Number.NEGATIVE_INFINITY;
    };

    const toDateValue = (label: string | null): number => {
      if (!label) return Number.NEGATIVE_INFINITY;
      const parsed = Date.parse(label);
      return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
    };

    nodes.forEach((node) => {
      const pubDateRaw = (node as any).pub_date ?? (node as any).pubDate ?? null;
      const formattedDate = formatPubDate(pubDateRaw);
      const whitespaceScoreRaw = (node as any).whitespace_score ?? (node as any).whitespaceScore ?? null;
      const localDensityRaw = (node as any).local_density ?? (node as any).localDensity ?? null;
      map.set(node.id, {
        pubDateLabel: formattedDate,
        pubDateValue: toDateValue(formattedDate),
        whitespaceScore: parseMetric(whitespaceScoreRaw),
        localDensity: parseMetric(localDensityRaw),
      });
    });
    return map;
  }, [result?.graph?.nodes]);

  const sortNodeIds = useCallback(
    (nodeIds: string[], mode: ExampleSortMode) => {
      if (!nodeIds || nodeIds.length <= 1) {
        return nodeIds;
      }
      const enriched = nodeIds.map((id, index) => {
        const meta = nodeMetaLookup.get(id);
        return {
          id,
          index,
          pubDateValue: meta?.pubDateValue ?? Number.NEGATIVE_INFINITY,
          whitespaceScore: meta?.whitespaceScore ?? Number.NEGATIVE_INFINITY,
          localDensity: meta?.localDensity ?? Number.NEGATIVE_INFINITY,
        };
      });

      const compare = (
        a: typeof enriched[number],
        b: typeof enriched[number],
        key: "pubDateValue" | "whitespaceScore" | "localDensity",
      ) => {
        const diff = (b[key] ?? Number.NEGATIVE_INFINITY) - (a[key] ?? Number.NEGATIVE_INFINITY);
        if (diff > 0) return 1;
        if (diff < 0) return -1;
        return 0;
      };

      const sorted = [...enriched].sort((a, b) => {
        if (mode === "recent") {
          return (
            compare(a, b, "pubDateValue") ||
            compare(a, b, "whitespaceScore") ||
            compare(a, b, "localDensity") ||
            a.index - b.index
          );
        }
        return (
          compare(a, b, "whitespaceScore") ||
          compare(a, b, "localDensity") ||
          compare(a, b, "pubDateValue") ||
          a.index - b.index
        );
      });
      return sorted.map((item) => item.id);
    },
    [nodeMetaLookup],
  );

  const handleViewExamples = useCallback(
    (assigneeName: string, signal: SignalInfo, mode: ExampleSortMode) => {
      const nodeIds = signal.node_ids ?? [];
      if (!nodeIds || nodeIds.length === 0) {
        setHighlightedNodes([]);
        setLastExamplesContext(null);
        return;
      }
      const sorted = sortNodeIds(nodeIds, mode);
      const limited = sorted.slice(0, EXAMPLE_LIMIT);
      setHighlightedNodes(limited);
      setLastExamplesContext({
        assignee: assigneeName,
        signalType: signal.type,
        signalStatus: signal.status,
        signalConfidence: signal.confidence,
        mode,
      });
    },
    [sortNodeIds],
  );

  const handleClearExamples = useCallback(() => {
    setHighlightedNodes([]);
    setActiveKey(null);
    setLastExamplesContext(null);
  }, []);

  const graphNodeLookup = useMemo(() => {
    const map = new Map<string, WsGraph["nodes"][number]>();
    (result?.graph?.nodes ?? []).forEach((node) => {
      map.set(node.id, node);
    });
    return map;
  }, [result?.graph?.nodes]);

  const highlightedRows = useMemo(() => {
    if (!highlightedNodes || highlightedNodes.length === 0) return [];
    return highlightedNodes.map((id) => {
      const node = graphNodeLookup.get(id);
      const meta = nodeMetaLookup.get(id);
      const title = node?.title && node.title.trim().length > 0 ? node.title : id;
      const assigneeDisplay = node?.assignee && node.assignee.trim().length > 0 ? node.assignee : "Unknown";
      const tooltip = node?.tooltip ? node.tooltip : "";
      const pubDate = meta?.pubDateLabel ?? null;
      return {
        id,
        title,
        assignee: assigneeDisplay,
        pubId: id,
        pubDate: pubDate ?? "--",
        tooltip,
        abstract: node?.abstract ?? null,
        linkId: formatGooglePatentId(id),
      };
    });
  }, [graphNodeLookup, highlightedNodes, nodeMetaLookup]);

  const examplesCardInfo = useMemo(() => {
    if (!lastExamplesContext) return null;
    const modeLabel = lastExamplesContext.mode === "recent" ? "Recent" : "Related";
    const signalLabel = SIGNAL_LABELS[lastExamplesContext.signalType];
    const signalStrength = formatStatus(lastExamplesContext.signalStatus, lastExamplesContext.signalConfidence);
    const uniqueNotes = Array.from(
      new Set(
        highlightedRows
          .map((row) => (row.tooltip ? row.tooltip.replace(/\s+/g, " ").trim() : ""))
          .filter((note) => note.length > 0),
      ),
    );
    const noteSummary = uniqueNotes.join(" • ");
    return {
      title: `${lastExamplesContext.assignee} - ${signalLabel}: ${signalStrength} (${modeLabel} Examples)`,
      modeLabel,
      note: noteSummary,
    };
  }, [highlightedRows, lastExamplesContext]);

  const handleExportExamplesPdf = useCallback(() => {
    if (!lastExamplesContext || highlightedRows.length === 0) {
      return;
    }
    const modeLabel = lastExamplesContext.mode === "recent" ? "Recent" : "Related";
    const signalLabel = SIGNAL_LABELS[lastExamplesContext.signalType];
    const signalStrength = formatStatus(lastExamplesContext.signalStatus, lastExamplesContext.signalConfidence);

    const lines: string[] = [];
    lines.push(`${lastExamplesContext.assignee} - ${signalLabel}: ${signalStrength} (${modeLabel} Examples)`);
    if (examplesCardInfo?.note) {
      lines.push(`(${examplesCardInfo.note})`);
    }
    lines.push(`Focus Keywords: ${focusKeywords || "--"}`);
    lines.push(`Focus CPC: ${focusCpcLike || "--"}`);
    lines.push(`From: ${dateFrom || "--"}`);
    lines.push(`To: ${dateTo || "--"}`);
    lines.push("");

    highlightedRows.forEach((row, index) => {
      lines.push("----------------------------------------");
      lines.push(`${index + 1}. ${row.title}`);
      lines.push(`   Patent/Pub No: ${row.pubId} | Assignee: ${row.assignee} | Date: ${row.pubDate}`);
      if (row.tooltip) {
        const cleanTooltip = row.tooltip.replace(/\s+/g, " ").trim();
        if (cleanTooltip) {
          lines.push(`   Note: ${cleanTooltip}`);
        }
      }
      if (row.abstract) {
        lines.push(`   Abstract: ${row.abstract.replace(/\\s+/g, " ").trim()}`);
      }
      lines.push("");
    });
    lines.push("----------------------------------------");

    const pdfBlob = buildSimplePdf(lines);
    const url = URL.createObjectURL(pdfBlob);
    const modeSlug = modeLabel.toLowerCase();
    const safeAssignee = lastExamplesContext.assignee.replace(/[^A-Za-z0-9_-]+/g, "_") || "assignee";
    const filename = `${safeAssignee}_${lastExamplesContext.signalType}_${modeSlug}_examples.pdf`;
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }, [dateFrom, dateTo, examplesCardInfo, focusCpcLike, focusKeywords, highlightedRows, lastExamplesContext]);

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
    <div style={{ padding: 20, background: "#eaf6ff", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Whitespace Signals</h1>
            <span style={{ fontSize: 12, color: "#64748b", alignItems: "baseline" }}>Confidence-first alerts for whitespace opportunities</span>
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
                {loading ? "Identifying..." : !isAuthenticated ? "Log in to run" : "Identify signals"}
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
                            const tone = SIGNAL_TONES[signal.type];
                            const toneIcon = SIGNAL_TONE_ICONS[tone];
                            const toneLabel = SIGNAL_TONE_LABELS[tone];
                            const statusStyle = statusStyleForSignal(signal.type, signal.status);
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
                                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                                          {SIGNAL_ICONS[signal.type]} {SIGNAL_LABELS[signal.type]}
                                        </span>
                                        <span
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 4,
                                            padding: "2px 8px",
                                            borderRadius: 999,
                                            background: tone === "risk" ? "#fee2e2" : "#dcfce7",
                                            color: tone === "risk" ? "#7f1d1d" : "#166534",
                                            fontSize: 11,
                                            fontWeight: 600,
                                            textTransform: "uppercase",
                                            letterSpacing: 0.4,
                                          }}
                                        >
                                          <span>{toneIcon}</span>
                                          <span>{toneLabel}</span>
                                        </span>
                                      </div>
                                      <span style={{ fontSize: 12, color: "#475569" }}>
                                        {isActive ? "Tap to collapse" : "Tap to view rationale"}
                                      </span>
                                    </div>
                                    <span
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: statusStyle.color,
                                        background: statusStyle.background,
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
                                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                        <button
                                          onClick={() => handleViewExamples(assignee.assignee, signal, "recent")}
                                          style={{
                                            ...exampleBtn,
                                            cursor: hasExamples ? "pointer" : "not-allowed",
                                            opacity: hasExamples ? 1 : 0.5,
                                          }}
                                          disabled={!hasExamples}
                                        >
                                          View Examples (Recent)
                                        </button>
                                        <button
                                          onClick={() => handleViewExamples(assignee.assignee, signal, "related")}
                                          style={{
                                            ...exampleBtn,
                                            background: "#1e293b",
                                            borderColor: "#1e293b",
                                            cursor: hasExamples ? "pointer" : "not-allowed",
                                            opacity: hasExamples ? 1 : 0.5,
                                          }}
                                          disabled={!hasExamples}
                                        >
                                          View Examples (Related)
                                        </button>
                                        {!hasExamples && (
                                          <span style={{ fontSize: 12, color: "#94a3b8" }}>
                                            No examples for this signal yet.
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

            {highlightedRows.length > 0 && lastExamplesContext && examplesCardInfo && (
              <Card>
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{examplesCardInfo.title}</h2>
                      {examplesCardInfo.note && (
                        <div style={{ fontSize: 12, color: "#64748b", fontStyle: "italic" }}>
                          ({examplesCardInfo.note})
                        </div>
                      )}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: "#475569" }}>
                        <span><strong>Focus Keywords:</strong> {focusKeywords || "--"}</span>
                        <span><strong>Focus CPC:</strong> {focusCpcLike || "--"}</span>
                        <span><strong>From:</strong> {dateFrom || "--"}</span>
                        <span><strong>To:</strong> {dateTo || "--"}</span>
                      </div>
                    </div>
                    <button
                      onClick={handleExportExamplesPdf}
                      style={{
                        ...exportBtn,
                        cursor: highlightedRows.length > 0 ? "pointer" : "not-allowed",
                        opacity: highlightedRows.length > 0 ? 1 : 0.5,
                      }}
                      disabled={highlightedRows.length === 0}
                    >
                      Export PDF
                    </button>
                  </div>
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ maxHeight: 360, overflow: "auto" }}>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={{ ...thStyle, width: 48 }}>#</th>
                            <th style={thStyle}>Title</th>
                            <th style={thStyle}>Patent/Pub No</th>
                            <th style={thStyle}>Assignee</th>
                            <th style={thStyle}>Publication Date</th>
                            <th style={thStyle}>Abstract</th>
                          </tr>
                        </thead>
                        <tbody>
                          {highlightedRows.map((row, index) => {
                            const abstractPreview = row.abstract
                              ? truncate(row.abstract.replace(/\s+/g, " "), 280)
                              : "--";
                            return (
                              <tr key={row.id}>
                                <td style={{ ...tdStyle, fontWeight: 600, color: "#0f172a" }}>{index + 1}</td>
                                <td style={tdStyle}>
                                  <div style={{ fontWeight: 600, color: "#0f172a" }}>{row.title}</div>
                                </td>
                                <td style={tdStyle}>
                                  <a
                                    href={`https://patents.google.com/patent/${encodeURIComponent(row.linkId)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}
                                  >
                                    {row.pubId}
                                  </a>
                                </td>
                                <td style={tdStyle}>{row.assignee}</td>
                                <td style={tdStyle}>{row.pubDate}</td>
                                <td style={tdStyle}>{abstractPreview}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </Card>
            )}

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
          2025 © Phaethon Order LLC | <a href="mailto:support@phaethon.llc" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">support@phaethon.llc</a> | <a href="https://phaethonorder.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">phaethonorder.com</a> | <a href="/help" className="text-blue-400 hover:underline">Help</a> | <a href="/docs" className="text-blue-400 hover:underline">Legal</a>
        </footer>
      </div>
    </div>
  );
}
