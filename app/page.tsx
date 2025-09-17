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

type TrendPoint = { label: string; count: number };

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
  const [semantic, setSemantic] = useState("");
  const [assignee, setAssignee] = useState("");
  const [cpc, setCpc] = useState("");
  const [dateFrom, setDateFrom] = useState(""); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState("");
  const [trendGroupBy, setTrendGroupBy] = useState<"month" | "cpc" | "assignee">("month");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // data
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

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

  const API = process.env.BACKEND_URL ?? "https://patent-scout.onrender.com";

  const buildFilterPayload = () => {
    const dateToInt = (dateString: string) => {
      if (!dateString) return undefined;
      return parseInt(dateString.replace(/-/g, ""), 10);
    };

    return {
      keywords: qDebounced || undefined,
      semantic_query: semantic || undefined,
      filters: {
        assignee: assignee || undefined,
        cpc: cpc || undefined,
        date_from: dateToInt(dateFrom),
        date_to: dateToInt(dateTo),
      },
      limit: pageSize,
      offset: (page - 1) * pageSize,
    };
  };

  // Save current query as an alert in saved_query table via API route
  const saveAsAlert = useCallback(async () => {
    try {
      const defaultName = qDebounced || assignee || cpc || "My Alert";
      const name = window.prompt("Alert name", defaultName);
      if (!name) return;

      setSaving(true);
      setSaveMsg(null);

      // Stable anonymous owner id for this browser
      function uuidv4(): string {
        try {
          if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
            return (crypto as any).randomUUID();
          }
          if (typeof crypto !== "undefined" && (crypto as any).getRandomValues) {
            const bytes = new Uint8Array(16);
            (crypto as any).getRandomValues(bytes);
            bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
            bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
            const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
            return `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-${hex[4]}${hex[5]}-${hex[6]}${hex[7]}-${hex[8]}${hex[9]}-${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`;
          }
        } catch {}
        // last resort (non-crypto)
        const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
        return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
      }

      let ownerId = localStorage.getItem("ps_owner_id") || "";
      if (!ownerId) {
        ownerId = uuidv4();
        localStorage.setItem("ps_owner_id", ownerId);
      }

      const payload = {
        owner_id: ownerId,
        name,
        filters: {
          keywords: qDebounced || null,
          assignee: assignee || null,
          cpc: cpc || null,
          date_from: dateFrom || null,
          date_to: dateTo || null,
        },
        semantic_query: null,
        schedule_cron: null,
        is_active: true,
      };

      const r = await fetch("/api/saved-queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`Save failed (${r.status}): ${t}`);
      }
      setSaveMsg("Alert saved");
      setTimeout(() => setSaveMsg(null), 3500);
    } catch (e: any) {
      setSaveMsg(e?.message || "Save failed");
      setTimeout(() => setSaveMsg(null), 5000);
    } finally {
      setSaving(false);
    }
  }, [qDebounced, assignee, cpc, dateFrom, dateTo]);

  const fetchSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildFilterPayload()),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHits(data.results ?? data.items ?? []);
      setTotal(data.total ?? null);
    } catch (e: any) {
      setError(e?.message ?? "search failed");
    } finally {
      setLoading(false);
    }
  }, [API, qDebounced, assignee, cpc, dateFrom, dateTo, page, pageSize]);


  const fetchTrend = useCallback(async () => {
    setTrendLoading(true);
    try {
      const p = new URLSearchParams();
      if (qDebounced) p.set("q", qDebounced);
      if (assignee) p.set("assignee", assignee);
      if (cpc) p.set("cpc", cpc);
      if (dateFrom) p.set("date_from", dateFrom);
      if (dateTo) p.set("date_to", dateTo);
      p.set("group_by", trendGroupBy);

      const res = await fetch(`${API}/trend/volume?${p.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw: Array<{ bucket: string | null; count: number }> = (Array.isArray(data)
        ? data
        : data?.points) || [];

      // transform according to groupBy
      if (trendGroupBy === "month") {
        const points = raw
          .filter((r) => !!r.bucket)
          .map((r) => ({ label: String(r.bucket), count: Number(r.count) || 0 }))
          .sort((a, b) => a.label.localeCompare(b.label));
        setTrend(points);
      } else if (trendGroupBy === "cpc") {
        // Aggregate to CPC section+class only: first 3 chars like G06
        const agg = new Map<string, number>();
        for (const r of raw) {
          const bucket = (r.bucket || "").toString();
          const sc = bucket.slice(0, 3).toUpperCase();
          if (!sc) continue;
          agg.set(sc, (agg.get(sc) || 0) + (Number(r.count) || 0));
        }
        const points = Array.from(agg.entries())
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count);
        setTrend(points);
      } else {
        // assignee: top 10, rest grouped under "Other"
        const items = raw
          .map((r) => ({ label: (r.bucket || "(Unknown)").toString(), count: Number(r.count) || 0 }))
          .filter((p) => p.count > 0)
          .sort((a, b) => b.count - a.count);
        const top = items.slice(0, 10);
        const restSum = items.slice(10).reduce((acc, x) => acc + x.count, 0);
        const points = restSum > 0 ? [...top, { label: "Other", count: restSum }] : top;
        setTrend(points);
      }
    } catch {
      setTrend([]);
    } finally {
      setTrendLoading(false);
    }
  }, [API, qDebounced, assignee, cpc, dateFrom, dateTo, trendGroupBy]);


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

  /**
 * Formats a patent publication number for a Google Patents URL,
   * correcting an issue where a leading zero is missing from the serial number.
   * e.g., 'US2025049352A1' becomes 'US20250049352A1'
   *
   * @param {string} pubId The publication number from your database.
   * @returns {string} A URL-safe, formatted publication number.
   */
  interface GooglePatentIdRegexGroups extends RegExpMatchArray {
    0: string;
    1: string; // country
    2: string; // year
    3: string; // serial
    4: string; // kindCode
  }

  const formatGooglePatentId = (pubId: string): string => {
    if (!pubId) return "";
    
    const cleanedId: string = pubId.replace(/[- ]/g, "");
    const regex: RegExp = /^(US)(\d{4})(\d{6})([A-Z]\d{1,2})$/;
    const match: GooglePatentIdRegexGroups | null = cleanedId.match(regex) as GooglePatentIdRegexGroups | null;

    if (match) {
      const [, country, year, serial, kindCode] = match;
      const correctedSerial: string = `0${serial}`;
      return `${country}${year}${correctedSerial}${kindCode}`;
    }
    return cleanedId;
  };

  // simple date helpers
  const today = useRef<string>(new Date().toISOString().slice(0, 10)).current;

  return (
    <div style={{ padding: 20, background: "#f8fafc", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Patent Scout (for AI-related patents & publications)</h1>

        <Card>
          <div style={{ display: "grid", gap: 12 }}>
            <Row>
              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="semantic">Semantic Query</Label>
                <input
                  id="semantic"
                  value={semantic}
                  onChange={(e) => setSemantic(e.target.value)}
                  placeholder="Describe relevant AI tech"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="q">Keywords</Label>
                <input
                  id="q"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Keywords in title/abstract/claims"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <Label htmlFor="assignee">Assignee</Label>
                <input
                  id="assignee"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  placeholder="e.g., Google, Oracle, ..."
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
                  min="2022-01-01"
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
                  min={dateFrom || "2022-01-02"}
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

              <button onClick={saveAsAlert} disabled={saving} style={secondaryBtn} title="Save current filters as an alert">
                {saving ? "Saving…" : "Save as Alert"}
              </button>
              {saveMsg && (
                <span style={{ fontSize: 12, color: "#047857", alignSelf: "center" }}>{saveMsg}</span>
              )}
            </Row>
          </div>
        </Card>

        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Trend</h2>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <Label htmlFor="trend_group_by">Group by</Label>
              <select
                id="trend_group_by"
                value={trendGroupBy}
                onChange={(e) => setTrendGroupBy(e.target.value as any)}
                style={{ height: 28, border: "1px solid #e5e7eb", borderRadius: 6, padding: "0 8px" }}
              >
                <option value="month">Month</option>
                <option value="cpc">CPC (section+class)</option>
                <option value="assignee">Assignee</option>
              </select>
            </div>
          </div>
          {trendLoading ? (
            <div style={{ fontSize: 13, color: "#64748b" }}>Loading…</div>
          ) : trend.length === 0 ? (
            <div style={{ fontSize: 13, color: "#64748b" }}>No data</div>
          ) : (
            <TrendChart data={trend} groupBy={trendGroupBy} height={200} />
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
                      <span style={{ fontWeight: 400, color: "#64748b" }}>• <a href={`https://patents.google.com/patent/${formatGooglePatentId(h.pub_id)}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{h.pub_id}</a></span>
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

function TrendChart({ data, groupBy, height = 180 }: { data: TrendPoint[]; groupBy: "month" | "cpc" | "assignee"; height?: number }) {
  const padding = 28;
  const width = 900;
  const w = width - padding * 2;
  const h = height - padding * 2;

  if (groupBy === "month") {
    // time-series line chart
    const parsed = useMemo(() => {
      return data
        .map((d) => ({
          x: new Date((d.label?.length === 7 ? d.label + "-01" : d.label)).getTime(),
          y: Number(d.count) || 0,
          label: d.label,
        }))
        .filter((d) => !Number.isNaN(d.x))
        .sort((a, b) => a.x - b.x);
    }, [data]);

    const [minX, maxX, minY, maxY] = useMemo(() => {
      const xs = parsed.map((d) => d.x);
      const ys = parsed.map((d) => d.y);
      return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    }, [parsed]);

    const scaleX = (x: number) => padding + ((x - minX) / Math.max(1, maxX - minX)) * w;
    const scaleY = (y: number) => padding + h - ((y - minY) / Math.max(1, maxY - minY)) * h;

    const path = useMemo(() => {
      if (parsed.length === 0) return "";
      return parsed
        .map((d, i) => `${i === 0 ? "M" : "L"} ${scaleX(d.x)} ${scaleY(d.y)}`)
        .join(" ");
    }, [parsed]);

    const yTicks = 4;
    const yVals = Array.from({ length: yTicks + 1 }, (_, i) =>
      Math.round(minY + (i * (maxY - minY)) / yTicks)
    );

    return (
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend (time)">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e5e7eb" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#e5e7eb" />
        {yVals.map((v, idx) => {
          const y = scaleY(v);
          return (
            <g key={idx}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#f1f5f9" />
              <text x={6} y={y + 4} fontSize="10" fill="#64748b">{v}</text>
            </g>
          );
        })}
        <path d={path} fill="none" stroke="#0ea5e9" strokeWidth="2" />
        {parsed.map((d, i) => (
          <circle key={i} cx={scaleX(d.x)} cy={scaleY(d.y)} r="2.5" fill="#0ea5e9" />
        ))}
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

  // categorical bar chart for CPC / Assignee
  const categories = data.map((d) => ({ label: d.label, y: Number(d.count) || 0 }));
  const maxY = Math.max(1, ...categories.map((c) => c.y));
  const yTicks = 4;
  const yVals = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((i * maxY) / yTicks));

  const n = Math.max(1, categories.length);
  const slot = w / n;
  const barWidth = Math.max(18, slot * 0.6);
  const scaleY = (y: number) => padding + h - (y / maxY) * h;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend (categorical)">
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e5e7eb" />
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#e5e7eb" />
      {yVals.map((v, idx) => {
        const y = scaleY(v);
        return (
          <g key={idx}>
            <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#f1f5f9" />
            <text x={6} y={y + 4} fontSize="10" fill="#64748b">{v}</text>
          </g>
        );
      })}
      {categories.map((c, i) => {
        const xCenter = padding + i * slot + slot / 2;
        const x = xCenter - barWidth / 2;
        const y = scaleY(c.y);
        const barH = height - padding - y;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={barH} fill="#0ea5e9" />
            <text
              x={xCenter}
              y={height - padding + 10}
              fontSize="10"
              fill="#64748b"
              textAnchor="end"
              transform={`rotate(-35 ${xCenter} ${height - padding + 10})`}
            >
              {c.label}
            </text>
            <text x={xCenter} y={y - 4} fontSize="10" fill="#334155" textAnchor="middle">
              {c.y}
            </text>
          </g>
        );
      })}
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