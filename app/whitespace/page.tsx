"use client";

import { useAuth0 } from "@auth0/auth0-react";
import dynamic from "next/dynamic";
import type { ChangeEvent } from "react";
import {
  useCallback,
  useMemo,
  useState,
} from "react";

import type {
  SignalKind,
  WsGraph,
} from "../../components/SigmaWhitespaceGraph";

const SigmaWhitespaceGraph = dynamic(
  () => import("../../components/SigmaWhitespaceGraph"),
  { ssr: false },
);

type OverviewPoint = {
  month: string;
  count: number;
};

type OverviewResponse = {
  crowding: {
    exact: number;
    semantic: number;
    total: number;
    density_per_month: number;
    percentile: number | null;
  };
  density: {
    mean_per_month: number;
    min_per_month: number;
    max_per_month: number;
  };
  momentum: {
    slope: number;
    cagr: number | null;
    bucket: "Up" | "Flat" | "Down";
    series: OverviewPoint[];
  };
  top_cpcs: { cpc: string; count: number }[];
  cpc_breakdown: { cpc: string; count: number }[];
  recency: { m6: number; m12: number; m24: number };
  timeline: OverviewPoint[];
  window_months: number;
};

type PatentHit = {
  pub_id: string;
  title?: string | null;
  abstract?: string | null;
  assignee_name?: string | null;
  pub_date?: number | string | null;
  kind_code?: string | null;
  cpc?: Array<Record<string, string>> | null;
};

type SearchResponse = {
  total: number;
  items: PatentHit[];
};

type SignalStatus = "none" | "weak" | "medium" | "strong";

type SignalInfo = {
  type: SignalKind;
  status: SignalStatus;
  confidence: number;
  why: string;
  node_ids: string[];
};

type AssigneeSignals = {
  assignee: string;
  signals: SignalInfo[];
  summary?: string | null;
  label_terms?: string[] | null;
};

type WhitespaceGraphResponse = {
  k: string;
  assignees: AssigneeSignals[];
  graph: WsGraph | null;
};

type RunQuery = {
  keywords: string;
  cpc: string;
  dateFrom: string;
  dateTo: string;
  semantic: boolean;
};

const numberFmt = new Intl.NumberFormat("en-US");
const percentFmt = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const SIGNAL_LABELS: Record<SignalKind, string> = {
  focus_shift: "Convergence",
  emerging_gap: "Sparse Focus Area",
  crowd_out: "Crowd-out Risk",
  bridge: "Bridge Opportunity",
};

const STATUS_BADGES: Record<SignalStatus, string> = {
  none: "None",
  weak: "Weak",
  medium: "Medium",
  strong: "Strong",
};

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultDateRange(): { from: string; to: string } {
  const today = new Date();
  const end = toISODate(today);
  const startDate = new Date(today);
  startDate.setMonth(startDate.getMonth() - 23);
  startDate.setDate(1);
  return { from: toISODate(startDate), to: end };
}

function formatPubDate(value: unknown): string {
  if (value === null || value === undefined) return "--";
  const raw = String(value).trim();
  if (!raw) return "--";
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return raw;
}

function formatPatentId(pubId: string): string {
  if (!pubId) return "";
  const cleaned = pubId.replace(/[-\s]/g, "");
  const match = cleaned.match(/^(US)(\d{4})(\d{6})([A-Z]\d{1,2})$/);
  if (!match) return cleaned;
  const [, country, year, serial, kindCode] = match;
  return `${country}${year}0${serial}${kindCode}`;
}

function percentileLabel(p: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p)) {
    return "--";
  }
  if (p < 0.4) return "Low";
  if (p < 0.8) return "Medium";
  if (p < 0.95) return "High";
  return "Very High";
}

function CPCList(cpc: PatentHit["cpc"]): string {
  if (!cpc || cpc.length === 0) return "--";
  const codes = new Set<string>();
  cpc.forEach((entry) => {
    const section = (entry.section || "").trim();
    const klass = (entry.class || "").trim();
    const subclass = (entry.subclass || "").trim();
    const group = (entry.group || "").trim();
    const subgroup = (entry.subgroup || "").trim();
    const head = `${section}${klass}${subclass}`.trim();
    const tail = group ? `${group}${subgroup ? `/${subgroup}` : ""}` : "";
    const code = `${head}${tail ? ` ${tail}` : ""}`.trim();
    if (code) codes.add(code);
  });
  if (codes.size === 0) return "--";
  return Array.from(codes).slice(0, 4).join(", ");
}

function TimelineSparkline({ points }: { points: OverviewPoint[] }) {
  if (!points.length) {
    return (
      <div style={{ fontSize: 12, color: "#475569" }}>No results in selected window.</div>
    );
  }
  const width = 520;
  const height = 160;
  const padding = 16;
  const maxCount = Math.max(...points.map((pt) => pt.count), 1);
  const step = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;

  const coords = points.map((pt, idx) => {
    const x = padding + idx * step;
    const normalized = maxCount ? pt.count / maxCount : 0;
    const y = height - padding - normalized * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={width} height={height} style={{ borderRadius: 16, background: "rgba(248,250,252,0.8)" }}>
      <polyline
        fill="none"
        stroke="#2563eb"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords.join(" ")}
      />
      {points.map((pt, idx) => {
        const x = padding + idx * step;
        const normalized = maxCount ? pt.count / maxCount : 0;
        const y = height - padding - normalized * (height - padding * 2);
        return (
          <circle key={pt.month} cx={x} cy={y} r={3.5} fill="#1d4ed8" />
        );
      })}
      <text x={padding} y={height - 4} fontSize={11} fill="#475569">
        {points[0]?.month ?? ""}
      </text>
      <text x={width - padding - 8} y={height - 4} fontSize={11} fill="#475569" textAnchor="end">
        {points[points.length - 1]?.month ?? ""}
      </text>
    </svg>
  );
}

function CpcBarChart({ items }: { items: { cpc: string; count: number }[] }) {
  if (!items.length) {
    return (
      <div style={{ fontSize: 12, color: "#475569" }}>No CPC signals for this scope.</div>
    );
  }
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((item) => {
        const width = `${Math.max(4, Math.round((item.count / max) * 100))}%`;
        return (
          <div key={item.cpc} style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, color: "#1f2937" }}>
              <span>{item.cpc || "Unknown"}</span>
              <span>{numberFmt.format(item.count)}</span>
            </div>
            <div style={{ background: "rgba(148,163,184,0.25)", borderRadius: 999, height: 8 }}>
              <div
                style={{
                  width,
                  height: "100%",
                  borderRadius: 999,
                  background: "linear-gradient(90deg, #38bdf8 0%, #0f172a 100%)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const tileStyle: React.CSSProperties = {
  padding: 20,
  borderRadius: 18,
  background: "rgba(255,255,255,0.88)",
  boxShadow: "0 18px 36px rgba(15,23,42,0.16)",
  display: "grid",
  gap: 8,
};

const sectionCardStyle: React.CSSProperties = {
  padding: 22,
  borderRadius: 22,
  background: "rgba(255,255,255,0.92)",
  boxShadow: "0 18px 44px rgba(15,23,42,0.18)",
};

const inputStyle: React.CSSProperties = {
  height: 40,
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.5)",
  padding: "0 14px",
  fontSize: 13,
  color: "#1f2937",
  background: "rgba(255,255,255,0.8)",
  minWidth: 220,
  boxShadow: "0 12px 24px rgba(15,23,42,0.12)",
};

const toggleLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 13,
  color: "#1f2937",
};

export default function WhitespacePage() {
  const { isAuthenticated, isLoading: authLoading, loginWithRedirect, getAccessTokenSilently } = useAuth0();
  const defaults = useMemo(defaultDateRange, []);

  const [keywords, setKeywords] = useState("");
  const [cpcFilter, setCpcFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [showSemantic, setShowSemantic] = useState(true);
  const [groupByAssignee, setGroupByAssignee] = useState(false);

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [results, setResults] = useState<PatentHit[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [assigneeData, setAssigneeData] = useState<WhitespaceGraphResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [assigneeLoading, setAssigneeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<RunQuery | null>(null);

  const handleInput =
    (setter: (value: string) => void) =>
    (event: ChangeEvent<HTMLInputElement>) =>
      setter(event.target.value);

  const runAssigneeFetch = useCallback(
    async (query: RunQuery, token?: string) => {
      try {
        setAssigneeLoading(true);
        const authHeader = token ?? (await getAccessTokenSilently());
        const focusKeywords = query.keywords
          ? query.keywords.split(",").map((item) => item.trim()).filter(Boolean)
          : [];
        const focusCpc = query.cpc
          ? query.cpc.split(",").map((item) => item.trim()).filter(Boolean)
          : [];
        const payload = {
          date_from: query.dateFrom || undefined,
          date_to: query.dateTo || undefined,
          neighbors: 15,
          resolution: 0.5,
          alpha: 0.8,
          beta: 0.5,
          limit: 1000,
          layout: true,
          debug: false,
          focus_keywords: focusKeywords,
          focus_cpc_like: focusCpc,
          search_mode: "keywords" as const,
          assignee_query: null,
        };
        const response = await fetch("/api/whitespace/graph", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authHeader}`,
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({} as Record<string, unknown>));
          throw new Error((detail as { detail?: string }).detail || `HTTP ${response.status}`);
        }
        const data = (await response.json()) as WhitespaceGraphResponse;
        setAssigneeData(data);
      } finally {
        setAssigneeLoading(false);
      }
    },
    [getAccessTokenSilently],
  );

  const runAnalysis = useCallback(async () => {
    if (!isAuthenticated) {
      await loginWithRedirect();
      return;
    }
    if (!keywords.trim() && !cpcFilter.trim()) {
      setError("Enter focus keywords or a CPC filter to run the overview.");
      return;
    }

    const currentQuery: RunQuery = {
      keywords: keywords.trim(),
      cpc: cpcFilter.trim(),
      dateFrom,
      dateTo,
      semantic: showSemantic,
    };

    setLoading(true);
    setError(null);
    setAssigneeData(null);

    try {
      const token = await getAccessTokenSilently();
      const params = new URLSearchParams();
      if (currentQuery.keywords) params.set("keywords", currentQuery.keywords);
      if (currentQuery.cpc) params.set("cpc", currentQuery.cpc);
      if (currentQuery.dateFrom) params.set("date_from", currentQuery.dateFrom);
      if (currentQuery.dateTo) params.set("date_to", currentQuery.dateTo);
      if (currentQuery.semantic) params.set("semantic", "1");

      const overviewPromise = fetch(`/api/whitespace/overview?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const payload = {
        keywords: currentQuery.keywords || null,
        semantic_query: currentQuery.semantic ? currentQuery.keywords || null : null,
        limit: 100,
        offset: 0,
        filters: {
          cpc: currentQuery.cpc || null,
          date_from: currentQuery.dateFrom || null,
          date_to: currentQuery.dateTo || null,
        },
      };

      const searchPromise = fetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const [overviewRes, searchRes] = await Promise.all([overviewPromise, searchPromise]);
      if (!overviewRes.ok) {
        const detail = await overviewRes.json().catch(() => ({}));
        throw new Error(detail.detail || `Overview failed (${overviewRes.status})`);
      }
      if (!searchRes.ok) {
        const detail = await searchRes.json().catch(() => ({}));
        throw new Error(detail.detail || `Search failed (${searchRes.status})`);
      }

      const overviewJson = (await overviewRes.json()) as OverviewResponse;
      const searchJson = (await searchRes.json()) as SearchResponse;
      setOverview(overviewJson);
      setResults(searchJson.items || []);
      setTotalResults(searchJson.total || 0);
      setLastQuery(currentQuery);

      if (groupByAssignee) {
        await runAssigneeFetch(currentQuery, token);
      } else {
        setAssigneeData(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to run whitespace overview.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [
    cpcFilter,
    dateFrom,
    dateTo,
    getAccessTokenSilently,
    groupByAssignee,
    isAuthenticated,
    keywords,
    loginWithRedirect,
    runAssigneeFetch,
    showSemantic,
  ]);

  const handleToggleGroup = useCallback(
    async (checked: boolean) => {
      setGroupByAssignee(checked);
      if (!checked) {
        setAssigneeData(null);
        return;
      }
      if (lastQuery) {
        try {
          await runAssigneeFetch(lastQuery);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to load assignee view.";
          setError(message);
        }
      }
    },
    [lastQuery, runAssigneeFetch],
  );

  const summaryLine = useMemo(() => {
    if (!overview) return null;
    const percentile = overview.crowding.percentile;
    const percentileLabelText = percentile !== null && percentile !== undefined ? percentileLabel(percentile) : "--";
    return `Crowding: ${numberFmt.format(overview.crowding.total)} total (${percentileLabelText}) | Density: ${overview.crowding.density_per_month.toFixed(1)}/mo | Momentum: ${overview.momentum.bucket}`;
  }, [overview]);

  const topCpcTile = useMemo(() => {
    if (!overview) return [];
    return overview.top_cpcs.slice(0, 5);
  }, [overview]);

  return (
    <div style={{ padding: "48px 24px 64px", display: "grid", gap: 28, background: "linear-gradient(180deg,#f8fafc 0%, #e2e8f0 60%, #cbd5f5 100%)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", width: "100%", display: "grid", gap: 24 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#0f172a" }}>Whitespace Overview</h1>
            <p style={{ margin: 0, fontSize: 14, color: "#475569" }}>
              Break down whitespace into crowding, momentum, and CPC placement. Group by assignee only when you need deeper context.
            </p>
          </div>
          {!isAuthenticated && !authLoading && (
            <button
              type="button"
              onClick={() => loginWithRedirect()}
              style={{
                borderRadius: 999,
                padding: "10px 18px",
                border: "1px solid rgba(37,99,235,0.4)",
                background: "rgba(37,99,235,0.08)",
                fontWeight: 600,
                fontSize: 13,
                color: "#1d4ed8",
              }}
            >
              Log in to Run
            </button>
          )}
        </header>

        <div style={{ ...sectionCardStyle }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label htmlFor="ws-keywords" style={{ fontSize: 12, fontWeight: 600, color: "#1f2937" }}>Focus Keywords</label>
              <input
                id="ws-keywords"
                placeholder="e.g., foundation models, multimodal reasoning"
                value={keywords}
                onChange={handleInput(setKeywords)}
                style={{ ...inputStyle, minWidth: 280 }}
              />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label htmlFor="ws-cpc" style={{ fontSize: 12, fontWeight: 600, color: "#1f2937" }}>CPC Filter</label>
              <input
                id="ws-cpc"
                placeholder="e.g., G06N20/00, A61B5/00"
                value={cpcFilter}
                onChange={handleInput(setCpcFilter)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label htmlFor="ws-from" style={{ fontSize: 12, fontWeight: 600, color: "#1f2937" }}>From</label>
              <input
                id="ws-from"
                type="date"
                value={dateFrom}
                onChange={handleInput(setDateFrom)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label htmlFor="ws-to" style={{ fontSize: 12, fontWeight: 600, color: "#1f2937" }}>To</label>
              <input
                id="ws-to"
                type="date"
                value={dateTo}
                onChange={handleInput(setDateTo)}
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ marginTop: 18, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18 }}>
            <label style={toggleLabelStyle}>
              <input
                type="checkbox"
                checked={showSemantic}
                onChange={(event) => setShowSemantic(event.target.checked)}
              />
              Show Semantic Neighbors
            </label>
            <label style={toggleLabelStyle}>
              <input
                type="checkbox"
                checked={groupByAssignee}
                onChange={(event) => handleToggleGroup(event.target.checked)}
              />
              Group by Assignee (legacy signals)
            </label>
            <button
              type="button"
              onClick={runAnalysis}
              disabled={loading || authLoading}
              style={{
                borderRadius: 999,
                padding: "10px 24px",
                background: "linear-gradient(105deg, #5FA8D2 0%, #39506B 100%)",
                color: "#ffffff",
                border: "1px solid rgba(107, 174, 219, 0.55)",
                fontWeight: 600,
                letterSpacing: "0.01em",
                boxShadow: "0 16px 30px rgba(37,99,235,0.25)",
                cursor: "pointer",
                opacity: loading ? 0.75 : 1,
              }}
            >
              {loading ? "Calculating…" : "Run Overview"}
            </button>
          </div>
          {error && (
            <div style={{ marginTop: 16, fontSize: 13, color: "#b91c1c", fontWeight: 600 }}>{error}</div>
          )}
          {summaryLine && (
            <div style={{ marginTop: 18, fontSize: 12, color: "#475569", fontWeight: 600 }}>
              {summaryLine}
            </div>
          )}
        </div>

        {overview && (
          <>
            <section style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              <div style={tileStyle}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>Crowding (24-mo)</span>
                <span style={{ fontSize: 28, fontWeight: 700, color: "#0f172a" }}>
                  {numberFmt.format(overview.crowding.total)}
                </span>
                <div style={{ fontSize: 13, color: "#475569", display: "grid", gap: 2 }}>
                  <span>Exact: {numberFmt.format(overview.crowding.exact)}</span>
                  {showSemantic && (
                    <span>Semantic: {numberFmt.format(overview.crowding.semantic)}</span>
                  )}
                  <span>Percentile: {overview.crowding.percentile !== null && overview.crowding.percentile !== undefined ? percentFmt.format(overview.crowding.percentile) : "--"}</span>
                </div>
              </div>
              <div style={tileStyle}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>Density</span>
                <span style={{ fontSize: 28, fontWeight: 700, color: "#0f172a" }}>
                  {overview.crowding.density_per_month.toFixed(1)} / mo
                </span>
                <div style={{ fontSize: 13, color: "#475569", display: "grid", gap: 2 }}>
                  <span>Mean: {overview.density.mean_per_month.toFixed(1)}</span>
                  <span>Band: {overview.density.min_per_month} – {overview.density.max_per_month}</span>
                </div>
              </div>
              <div style={tileStyle}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>Momentum</span>
                <span style={{ fontSize: 28, fontWeight: 700, color: overview.momentum.bucket === "Up" ? "#15803d" : overview.momentum.bucket === "Down" ? "#b91c1c" : "#0f172a" }}>
                  {overview.momentum.bucket}
                </span>
                <div style={{ fontSize: 13, color: "#475569", display: "grid", gap: 2 }}>
                  <span>Slope: {overview.momentum.slope.toFixed(2)}</span>
                  <span>CAGR: {overview.momentum.cagr !== null && overview.momentum.cagr !== undefined ? percentFmt.format(overview.momentum.cagr) : "--"}</span>
                </div>
              </div>
              <div style={tileStyle}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>Top CPCs</span>
                <div style={{ display: "grid", gap: 6 }}>
                  {topCpcTile.length === 0 && <span style={{ fontSize: 12, color: "#475569" }}>No CPCs in window.</span>}
                  {topCpcTile.map((item) => (
                    <div key={item.cpc} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#1f2937" }}>
                      <span>{item.cpc || "Unknown"}</span>
                      <span>{numberFmt.format(item.count)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section style={{ display: "grid", gap: 24, gridTemplateColumns: "minmax(320px, 1fr) minmax(320px, 1fr)" }}>
              <div style={sectionCardStyle}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937", marginBottom: 12 }}>Timeline</div>
                <TimelineSparkline points={overview.timeline} />
              </div>
              <div style={sectionCardStyle}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1f2937", marginBottom: 12 }}>CPC Density</div>
                <CpcBarChart items={overview.cpc_breakdown.slice(0, 8)} />
              </div>
            </section>
          </>
        )}

        <section style={{ ...sectionCardStyle, display: "grid", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Result Set</div>
            <div style={{ fontSize: 12, color: "#475569" }}>
              {totalResults ? `${numberFmt.format(totalResults)} filings` : "No filings yet"}
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 640 }}>
              <thead>
                <tr style={{ background: "rgba(226,232,240,0.6)" }}>
                  <th style={{ textAlign: "left", padding: "10px 12px", color: "#0f172a" }}>Title</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", color: "#0f172a" }}>Publication</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", color: "#0f172a" }}>Assignee</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", color: "#0f172a" }}>Date</th>
                  <th style={{ textAlign: "left", padding: "10px 12px", color: "#0f172a" }}>CPC</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: "12px", color: "#475569" }}>Run the overview to populate filings.</td>
                  </tr>
                )}
                {results.map((row) => (
                  <tr key={row.pub_id} style={{ borderTop: "1px solid rgba(148,163,184,0.25)" }}>
                    <td style={{ padding: "10px 12px", color: "#0f172a", fontWeight: 600 }}>
                      {row.title || row.pub_id}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <a
                        href={`https://patents.google.com/patent/${formatPatentId(row.pub_id)}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#1d4ed8", textDecoration: "none" }}
                      >
                        {row.pub_id}
                      </a>
                      {row.kind_code ? ` (${row.kind_code})` : ""}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#475569" }}>
                      {row.assignee_name ? row.assignee_name : "Unknown"}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#475569" }}>
                      {formatPubDate(row.pub_date)}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#475569" }}>
                      {CPCList(row.cpc)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {groupByAssignee && (
          <section style={{ ...sectionCardStyle, display: "grid", gap: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Assignee Signals</h2>
              {assigneeLoading && <span style={{ fontSize: 12, color: "#475569" }}>Loading…</span>}
            </div>
            {assigneeData?.graph && (
              <div style={{ borderRadius: 20, overflow: "hidden", border: "1px solid rgba(148,163,184,0.25)" }}>
                <SigmaWhitespaceGraph data={assigneeData.graph} height={420} selectedSignal={null} highlightedNodeIds={[]} />
              </div>
            )}
            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
              {(assigneeData?.assignees ?? []).map((assignee) => (
                <div
                  key={assignee.assignee}
                  style={{
                    padding: 18,
                    borderRadius: 18,
                    background: "rgba(248,250,252,0.9)",
                    border: "1px solid rgba(148,163,184,0.2)",
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{assignee.assignee}</div>
                  {assignee.summary && (
                    <div style={{ fontSize: 12, color: "#475569" }}>{assignee.summary}</div>
                  )}
                  <div style={{ display: "grid", gap: 6 }}>
                    {assignee.signals.map((signal) => (
                      <div
                        key={signal.type}
                        style={{
                          display: "grid",
                          gap: 4,
                          padding: "8px 10px",
                          borderRadius: 12,
                          background: "rgba(226,232,240,0.6)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600 }}>
                          <span>{SIGNAL_LABELS[signal.type]}</span>
                          <span>{STATUS_BADGES[signal.status]}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#475569" }}>{signal.why}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!assigneeLoading && (assigneeData?.assignees?.length ?? 0) === 0 && (
                <div style={{ fontSize: 12, color: "#475569" }}>
                  Run the overview or adjust filters to surface assignee-level signals.
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

