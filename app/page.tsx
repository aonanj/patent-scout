"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SearchHit = {
  pub_id?: string;
  title?: string;
  abstract?: string;
  assignee_name?: string;
  pub_date?: string | number;
  cpc_codes?: string | string[];
  // add other fields as your /search returns them
};

type TrendPoint = { date: string; count: number };

function useDebounced<T>(value: T, delay = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

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

export default function Page() {
  // filters
  const [q, setQ] = useState("");
  const [assignee, setAssignee] = useState("");
  const [cpc, setCpc] = useState("");
  const [dateFrom, setDateFrom] = useState(""); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // data
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // debounced search text to avoid chatty calls
  const qDebounced = useDebounced(q);

  // build shared query params
  const buildParams = useCallback(
    (overrides: Record<string, string | number | undefined> = {}) => {
      const p = new URLSearchParams();
      if (qDebounced) p.set("q", qDebounced);
      if (assignee) p.set("assignee", assignee);
      if (cpc) p.set("cpc", cpc);
      if (dateFrom) p.set("date_from", dateFrom);
      if (dateTo) p.set("date_to", dateTo);
      p.set("page", String(overrides.page ?? page));
      p.set("page_size", String(overrides.page_size ?? pageSize));
      return p;
    },
    [qDebounced, assignee, cpc, dateFrom, dateTo, page]
  );

  const fetchSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = buildParams();
      const res = await fetch(`/search?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // expected shape: { results: SearchHit[], total: number }
      setHits(data.results ?? data.items ?? []);
      setTotal(data.total ?? null);
    } catch (e: any) {
      setError(e?.message ?? "search failed");
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  const fetchTrend = useCallback(async () => {
    setTrendLoading(true);
    try {
      const params = buildParams({ page: 1, page_size: 0 }); // not needed for trend
      const res = await fetch(`/trend/volume?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // expected shape: { points: [{ date, count }]} OR array
      const pts: TrendPoint[] = data.points ?? data ?? [];
      setTrend(pts);
    } catch {
      setTrend([]);
    } finally {
      setTrendLoading(false);
    }
  }, [buildParams]);

  // trigger on filter changes
  useEffect(() => {
    setPage(1);
  }, [qDebounced, assignee, cpc, dateFrom, dateTo]);

  useEffect(() => {
    fetchSearch();
    fetchTrend();
  }, [page, fetchSearch, fetchTrend]);

  // simple pagination controls
  const totalPages = useMemo(() => {
    if (!total) return null;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [total]);

  // simple date helpers
  const today = useRef<string>(new Date().toISOString().slice(0, 10)).current;

  return (
    <div style={{ padding: 20, background: "#f8fafc", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Patent Scout</h1>

        <Card>
          <div style={{ display: "grid", gap: 12 }}>
            <Row>
              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="q">Search</Label>
                <input
                  id="q"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="keywords in title/abstract/claims"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="assignee">Assignee</Label>
                <input
                  id="assignee"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="e.g., Google"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="cpc">CPC</Label>
                <input
                  id="cpc"
                  value={cpc}
                  onChange={(e) => setCpc(e.target.value)}
                  placeholder="e.g., G06N, G06F 17/00"
                  style={inputStyle}
                />
              </div>
            </Row>

            <Row>
              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="date_from">From</Label>
                <input
                  id="date_from"
                  type="date"
                  max={dateTo || today}
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="date_to">To</Label>
                <input
                  id="date_to"
                  type="date"
                  min={dateFrom || "1900-01-01"}
                  max={today}
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <button
                onClick={() => {
                  setPage(1);
                  fetchSearch();
                  fetchTrend();
                }}
                style={primaryBtn}
              >
                Apply
              </button>

              <button
                onClick={() => {
                  setQ("");
                  setAssignee("");
                  setCpc("");
                  setDateFrom("");
                  setDateTo("");
                  setPage(1);
                }}
                style={ghostBtn}
              >
                Reset
              </button>
            </Row>
          </div>
        </Card>

        <Card>
          <h2 style={{ margin: 0, fontSize: 16, marginBottom: 8 }}>Trend</h2>
          {trendLoading ? (
            <div style={{ fontSize: 13, color: "#64748b" }}>Loading…</div>
          ) : trend.length === 0 ? (
            <div style={{ fontSize: 13, color: "#64748b" }}>No data</div>
          ) : (
            <TrendChart data={trend} height={180} />
          )}
        </Card>

        <Card>
          <Row>
            <h2 style={{ margin: 0, fontSize: 16 }}>Results</h2>
            {loading && <span style={{ fontSize: 12, color: "#64748b" }}>Loading…</span>}
            {typeof total === "number" && (
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#334155" }}>
                {total} total
              </span>
            )}
          </Row>

          {error && (
            <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 8 }}>Error: {error}</div>
          )}

          <ul style={{ listStyle: "none", padding: 0, marginTop: 12, display: "grid", gap: 12 }}>
            {hits.map((h, i) => (
              <li key={(h.pub_id ?? "") + i} style={resultItem}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 600 }}>
                    {h.title || "(no title)"}{" "}
                    {h.pub_id && (
                      <span style={{ fontWeight: 400, color: "#64748b" }}>• {h.pub_id}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#475569" }}>
                    {h.assignee_name ? `Assignee: ${h.assignee_name}  ` : ""}
                    {h.pub_date ? `  |  Date: ${formatDate(h.pub_date)}` : ""}
                  </div>
                  {h.cpc_codes && (
                    <div style={{ fontSize: 12, color: "#334155" }}>
                      CPC:{" "}
                      {Array.isArray(h.cpc_codes)
                        ? h.cpc_codes.join(", ")
                        : String(h.cpc_codes)}
                    </div>
                  )}
                  {h.abstract && (
                    <div style={{ fontSize: 13, color: "#334155" }}>
                      {truncate(h.abstract, 420)}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={secondaryBtn}
            >
              Prev
            </button>
            <div style={{ fontSize: 12, alignSelf: "center" }}>
              Page {page}
              {totalPages ? ` / ${totalPages}` : ""}
            </div>
            <button
              onClick={() => {
                if (totalPages && page >= totalPages) return;
                setPage((p) => p + 1);
              }}
              disabled={!!totalPages && page >= totalPages}
              style={secondaryBtn}
            >
              Next
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function TrendChart({ data, height = 180 }: { data: TrendPoint[]; height?: number }) {
  // normalize
  const parsed = useMemo(() => {
    return data
      .map((d) => ({
        x: new Date(d.date).getTime(),
        y: Number(d.count) || 0,
        label: d.date,
      }))
      .sort((a, b) => a.x - b.x);
  }, [data]);

  const padding = 28;
  const width = 900;
  const w = width - padding * 2;
  const h = height - padding * 2;

  const [minX, maxX, minY, maxY] = useMemo(() => {
    const xs = parsed.map((d) => d.x);
    const ys = parsed.map((d) => d.y);
    return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  }, [parsed]);

  const scaleX = (x: number) =>
    padding + ((x - minX) / Math.max(1, maxX - minX)) * w;
  const scaleY = (y: number) =>
    padding + h - ((y - minY) / Math.max(1, maxY - minY)) * h;

  const path = useMemo(() => {
    if (parsed.length === 0) return "";
    return parsed
      .map((d, i) => `${i === 0 ? "M" : "L"} ${scaleX(d.x)} ${scaleY(d.y)}`)
      .join(" ");
  }, [parsed, scaleX, scaleY]);

  const yTicks = 4;
  const yVals = Array.from({ length: yTicks + 1 }, (_, i) =>
    Math.round(minY + (i * (maxY - minY)) / yTicks)
  );

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend">
      {/* axes */}
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e5e7eb" />
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#e5e7eb" />
      {/* y grid + labels */}
      {yVals.map((v, idx) => {
        const y = scaleY(v);
        return (
          <g key={idx}>
            <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#f1f5f9" />
            <text x={6} y={y + 4} fontSize="10" fill="#64748b">
              {v}
            </text>
          </g>
        );
      })}
      {/* line */}
      <path d={path} fill="none" stroke="#0ea5e9" strokeWidth="2" />
      {/* points */}
      {parsed.map((d, i) => (
        <circle key={i} cx={scaleX(d.x)} cy={scaleY(d.y)} r="2.5" fill="#0ea5e9" />
      ))}
      {/* x labels: first, mid, last */}
      {parsed.length > 0 && (
        <>
          <text x={padding} y={height - 6} fontSize="10" fill="#64748b">
            {fmtShortDate(parsed[0].x)}
          </text>
          <text x={width / 2} y={height - 6} fontSize="10" textAnchor="middle" fill="#64748b">
            {fmtShortDate(parsed[Math.floor(parsed.length / 2)].x)}
          </text>
          <text x={width - padding} y={height - 6} fontSize="10" textAnchor="end" fill="#64748b">
            {fmtShortDate(parsed[parsed.length - 1].x)}
          </text>
        </>
      )}
    </svg>
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

const resultItem: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 12,
  background: "white",
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

const secondaryBtn: React.CSSProperties = {
  height: 32,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "white",
  cursor: "pointer",
};

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function formatDate(v: string | number) {
  // accepts "YYYYMMDD", ISO string, or millis
  const s = String(v);
  let d: Date;
  if (/^\d{8}$/.test(s)) {
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(4, 6)) - 1;
    const day = Number(s.slice(6, 8));
    d = new Date(Date.UTC(y, m, day));
  } else if (/^\d+$/.test(s)) {
    d = new Date(Number(s));
  } else {
    d = new Date(s);
  }
  return d.toISOString().slice(0, 10);
}

function fmtShortDate(ms: number) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
