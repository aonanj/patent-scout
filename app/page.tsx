// File: app/page.tsx

"use client";
import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type SearchHit = {
  pub_id?: string;
  title?: string;
  abstract?: string;
  assignee_name?: string;
  pub_date?: string | number;
  cpc_codes?: string | string[];
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

// Styles for the new login overlay
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.6)', // Semi-transparent background
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000, // Ensure it's on top of other content
};

const overlayContentStyle: React.CSSProperties = {
  background: 'white',
  padding: '40px',
  borderRadius: '12px',
  textAlign: 'center',
  boxShadow: '0 5px 15px rgba(0, 0, 0, 0.1)',
  maxWidth: '400px',
  width: '90%',
};

export default function Page() {
  // auth
  const { loginWithRedirect, logout, user, isAuthenticated, isLoading, getAccessTokenSilently } = useAuth0();
  
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

  // Sigma component handles its own container; no external ref needed.

  // Debounce all free-text inputs to prevent API spam and race conditions
  const qDebounced = useDebounced(q);
  const semanticDebounced = useDebounced(semantic);
  const assigneeDebounced = useDebounced(assignee);
  const cpcDebounced = useDebounced(cpc);

  const [dateBounds, setDateBounds] = useState<{ min: string; max: string} | null>(null);
  const [downloading, setDownloading] = useState<null | "csv" | "pdf">(null);

  // Save current query as an alert in saved_query table via API route
  const saveAsAlert = useCallback(async () => {
    try {
      const defaultName = qDebounced || assigneeDebounced || cpcDebounced || "My Alert";
      const name = window.prompt("Alert name", defaultName);
      if (!name) return;

      const token = await getAccessTokenSilently();

      setSaving(true);
      setSaveMsg(null);

      const payload = {
        name,
        filters: {
          keywords: qDebounced || null,
          assignee: assigneeDebounced || null,
          cpc: cpcDebounced || null,
          date_from: dateFrom || null,
          date_to: dateTo || null,
        },
        semantic_query: semanticDebounced || null, 
        schedule_cron: null,
        is_active: true,
      };

      const r = await fetch("/api/saved-queries", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, 
        },
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
  }, [qDebounced, semanticDebounced, assigneeDebounced, cpcDebounced, dateFrom, dateTo, getAccessTokenSilently]);


  const fetchSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const dateToInt = (d: string) => d ? parseInt(d.replace(/-/g, ""), 10) : undefined;

      const payload = {
        keywords: qDebounced || undefined,
        semantic_query: semanticDebounced || undefined,
        filters: {
          assignee: assigneeDebounced || undefined,
          cpc: cpcDebounced || undefined,
          date_from: dateToInt(dateFrom),
          date_to: dateToInt(dateTo),
        },
        limit: pageSize,
        offset: (page - 1) * pageSize,
      };

      const res = await fetch(`/api/search`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHits(data.items ?? []);
      setTotal(data.total ?? null);
    } catch (e: any) {
      setError(e?.message ?? "search failed");
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently, page, pageSize, qDebounced, semanticDebounced, assigneeDebounced, cpcDebounced, dateFrom, dateTo]);

  const fetchTrend = useCallback(async () => {
    setTrendLoading(true);
    try {
      const token = await getAccessTokenSilently();
      const dateToInt = (d: string) => (d ? parseInt(d.replace(/-/g, ""), 10) : undefined);

      const p = new URLSearchParams();
      if (qDebounced) p.set("q", qDebounced);
      if (semanticDebounced) p.set("semantic_query", semanticDebounced);
      if (assigneeDebounced) p.set("assignee", assigneeDebounced);
      if (cpcDebounced) p.set("cpc", cpcDebounced);
      if (dateFrom) p.set("date_from", dateToInt(dateFrom)!.toString());
      if (dateTo) p.set("date_to", dateToInt(dateTo)!.toString());
      p.set("group_by", trendGroupBy);

      const res = await fetch(`/api/trend/volume?${p.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw: Array<Record<string, any>> = (Array.isArray(data) ? data : data?.points) || [];

      const getKey = (r: Record<string, any>): string => {
        const k = r.bucket ?? r.date ?? r.label ?? r.key ?? r.cpc ?? r.assignee ?? r.name ?? null;
        return k == null ? "" : String(k);
      };

      if (trendGroupBy === "month") {
        const points = raw
          .map((r) => ({ label: getKey(r), count: Number(r.count) || 0 }))
          .filter((r) => !!r.label)
          .sort((a, b) => a.label.localeCompare(b.label));
        setTrend(points);
      } else if (trendGroupBy === "cpc") {
        const agg = new Map<string, number>();
        for (const r of raw) {
          const bucket = getKey(r);
          if (!bucket) continue;
          agg.set(bucket, (agg.get(bucket) || 0) + (Number(r.count) || 0));
        }
        const sorted = Array.from(agg.entries())
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count);
        const top = sorted.slice(0, 10);
        const restSum = sorted.slice(10).reduce((acc, x) => acc + x.count, 0);
        const finalPoints = restSum > 0 ? [...top, { label: "Other", count: restSum }] : top;
        setTrend(finalPoints);
      } else {
        const itemsAll = raw.map((r) => ({ key: getKey(r), count: Number(r.count) || 0 }));
        const known = itemsAll.filter((i) => i.key).map((i) => ({ label: i.key as string, count: i.count }));
        const sorted = known.filter((p) => p.count > 0).sort((a, b) => b.count - a.count);
        const top = sorted.slice(0, 15);
        setTrend(top);
      }
    } catch {
      setTrend([]);
    } finally {
      setTrendLoading(false);
    }
  }, [getAccessTokenSilently, qDebounced, semanticDebounced, assigneeDebounced, cpcDebounced, dateFrom, dateTo, trendGroupBy]);

  // whitespace analysis moved to /whitespace page

  // NOTE: rendering is now handled by SigmaWhitespaceGraph component below.

  useEffect(() => {
    setPage(1);
  }, [qDebounced, semanticDebounced, assigneeDebounced, cpcDebounced, dateFrom, dateTo]);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
        fetchSearch();
        fetchTrend();
    }
  }, [page, fetchSearch, fetchTrend, isAuthenticated, isLoading]);

  useEffect(() => {
    if(!isAuthenticated || isLoading) return;
    const fetchDateBounds = async () => {
      try {
        const token = await getAccessTokenSilently();
        const res = await fetch(`/api/patent-date-range`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.min_date && data.max_date) {
          setDateBounds({ 
            min: formatDate(data.min_date), 
            max: formatDate(data.max_date) 
          });
        }
      } catch (err: any) {
        console.error("API proxy error for /patent-date-range:", err);
      }
    };
    fetchDateBounds();
  }, [getAccessTokenSilently, isAuthenticated, isLoading]);

  const displayedDateFrom = dateFrom || (dateBounds?.min ?? '');
  const displayedDateTo = dateTo || (dateBounds?.max ?? '');

  const totalPages = useMemo(() => {
    if (total === null) return null;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [total, pageSize]);

  interface GooglePatentIdRegexGroups extends RegExpMatchArray {
    0: string;
    1: string;
    2: string;
    3: string;
    4: string;
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

  const today = useRef<string>(new Date().toISOString().slice(0, 10)).current;

  const buildExportUrl = useCallback((fmt: "csv" | "pdf") => {
    const dateToInt = (d: string) => (d ? parseInt(d.replace(/-/g, ""), 10) : undefined);
    const p = new URLSearchParams();
    p.set("format", fmt);
    if (qDebounced) p.set("q", qDebounced);
    if (semanticDebounced) p.set("semantic_query", semanticDebounced);
    if (assigneeDebounced) p.set("assignee", assigneeDebounced);
    if (cpcDebounced) p.set("cpc", cpcDebounced);
    if (dateFrom) p.set("date_from", String(dateToInt(dateFrom)));
    if (dateTo) p.set("date_to", String(dateToInt(dateTo)));
    p.set("limit", "1000");
    return `/api/export?${p.toString()}`;
  }, [qDebounced, semanticDebounced, assigneeDebounced, cpcDebounced, dateFrom, dateTo]);

  const triggerDownload = useCallback(async (fmt: "csv" | "pdf") => {
    try {
      setDownloading(fmt);
      const token = await getAccessTokenSilently();
      const url = buildExportUrl(fmt);
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`Export failed (${r.status}) ${t}`);
      }
      const blob = await r.blob();
      const a = document.createElement('a');
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl;
      a.download = `patent_scout_export.${fmt}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
    } catch (e: any) {
      alert(e?.message ?? "Export failed");
    } finally {
      setDownloading(null);
    }
  }, [buildExportUrl, getAccessTokenSilently]);

  return (
    <div style={{ padding: 20, background: "#f8fafc", minHeight: "100vh" }}>
      
      {/* Login Overlay */}
      {!isLoading && !isAuthenticated && (
        <div style={overlayStyle}>
          <div style={overlayContentStyle}>
            <h2 style={{ marginTop: 0, fontSize: 20, fontWeight: 600 }}>Patent Scout</h2>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 400 }}>presented by Phaethon Order LLC</h3>
            <p style={{ color: '#475569', marginBottom: 24 }}>Please log in or sign up to continue.</p>
            <button 
              onClick={() => loginWithRedirect()} 
              style={{ ...primaryBtn, padding: '0 24px', height: 44, fontSize: 16 }}
            >
              Log In / Sign Up
            </button>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gap: 16 }}>
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
                  style={{ ...inputStyle, minWidth: 380, width: 420, maxWidth: 500 }}
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
                <Label htmlFor="cpc">
                  <a href="https://www.uspto.gov/web/patents/classification/cpc/html/cpc.html" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">CPC</a>
                </Label>
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
                  setSemantic("");
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

              <button onClick={saveAsAlert} disabled={saving || !isAuthenticated} style={secondaryBtn} title="Save current filters as an alert">
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
            <h2 style={{ margin: 0, fontSize: 16 }}>
              <span style={{ fontWeight: 'bold', textDecoration: 'underline' }}>Trend</span>
              {displayedDateFrom && displayedDateTo && (
                <span style={{ fontWeight: 'normal', fontSize: 14, color: '#475569', marginLeft: 8 }}>
                  (From: {displayedDateFrom}, To: {displayedDateTo})
                </span>
              )}
            </h2>
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
            <TrendChart data={trend} groupBy={trendGroupBy} height={260} />
          )}
        </Card>

        {/* Whitespace Analysis moved to its own page at /whitespace */}

        <Card>
          <Row>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 'bold', textDecoration: 'underline' }}>Results</h2>
            {loading && <span style={{ fontSize: 12, color: "#64748b" }}>Loading…</span>}
            {total !== null && (
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#334155" }}>
                {total.toLocaleString()} total
              </span>
            )}
            {total !== null && total > 0 && (
              <div style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
                <button onClick={() => triggerDownload('csv')} disabled={downloading !== null} style={secondaryBtn} title="Download top 1000 as CSV">
                  {downloading === 'csv' ? 'Generating…' : 'Download CSV'}
                </button>
                <button onClick={() => triggerDownload('pdf')} disabled={downloading !== null} style={secondaryBtn} title="Download top 1000 as PDF">
                  {downloading === 'pdf' ? 'Generating…' : 'Download PDF'}
                </button>
              </div>
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

      {/* Footer */}
      <footer style={{ marginTop: 24, textAlign: "center", color: "#64748b", fontSize: 12, fontWeight: 500 }}>
        2025 © Phaethon Order LLC | <a href="mailto:support@phaethon.llc" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">support@phaethon.llc</a> | <a href="https://phaethonorder.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">phaethonorder.com</a> | <a href="https://github.com/aonanj/patent-scout" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">github</a>
      </footer>
    </div>
  );
}

function TrendChart({ data, groupBy, height = 180 }: { data: TrendPoint[]; groupBy: "month" | "cpc" | "assignee"; height?: number }) {
  const padding = { left: 60, right: 28, top: 28, bottom: 28 };
  const width = 900;
  const w = width - padding.left - padding.right;
  const h = height - padding.top - padding.bottom;

  if (groupBy === "month") {
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
      if (parsed.length === 0) return [0, 0, 0, 0];
      const xs = parsed.map((d) => d.x);
      const ys = parsed.map((d) => d.y);
      return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    }, [parsed]);

    const scaleX = (x: number) => padding.left + ((x - minX) / Math.max(1, maxX - minX)) * w;
    const scaleY = (y: number) => padding.top + h - ((y - minY) / Math.max(1, maxY - minY)) * h;

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
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend (time)">
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#e5e7eb" />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#e5e7eb" />
        {yVals.map((v, idx) => {
          const y = scaleY(v);
          return (
            <g key={idx}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#f1f5f9" />
              <text x={padding.left - 8} y={y + 4} fontSize="10" fill="#64748b" textAnchor="end">{v}</text>
            </g>
          );
        })}
        <path d={path} fill="none" stroke="#0ea5e9" strokeWidth="2" />
        {parsed.map((d, i) => (
          <circle key={i} cx={scaleX(d.x)} cy={scaleY(d.y)} r="2.5" fill="#0ea5e9" />
        ))}
        {parsed.length > 0 && (
          <>
            <text x={padding.left} y={height - 6} fontSize="10" fill="#64748b">
              {fmtShortDate(parsed[0].x)}
            </text>
            <text x={padding.left + w / 2} y={height - 6} fontSize="10" textAnchor="middle" fill="#64748b">
              {fmtShortDate(parsed[Math.floor(parsed.length / 2)].x)}
            </text>
            <text x={width - padding.right} y={height - 6} fontSize="10" textAnchor="end" fill="#64748b">
              {fmtShortDate(parsed[parsed.length - 1].x)}
            </text>
          </>
        )}
      </svg>
    );
  }

  const categories = data.map((d) => ({ label: d.label, y: Number(d.count) || 0 }));
  const maxY = Math.max(1, ...categories.map((c) => c.y));
  const yTicks = 4;
  const yVals = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((i * maxY) / yTicks));

  const n = Math.max(1, categories.length);
  const slot = w / n;
  const barWidth = Math.max(18, slot * 0.6);
  const scaleY = (y: number) => padding.top + h - (y / maxY) * h;
  const extraBottom = 60;
  const viewH = height + extraBottom;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${viewH}`} role="img" aria-label="Trend (categorical)">
      <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#e5e7eb" />
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#e5e7eb" />
      {yVals.map((v, idx) => {
        const y = scaleY(v);
        return (
          <g key={idx}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#f1f5f9" />
            <text x={padding.left - 8} y={y + 4} fontSize="10" fill="#64748b" textAnchor="end">{v.toLocaleString()}</text>
          </g>
        );
      })}
      {categories.map((c, i) => {
        const xCenter = padding.left + i * slot + slot / 2;
        const x = xCenter - barWidth / 2;
        const y = scaleY(c.y);
        const barH = height - padding.bottom - y;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={barH} fill="#0ea5e9" />
            <text
              x={xCenter}
              y={height - padding.bottom + 25}
              fontSize="9"
              fill="#64748b"
              textAnchor="end"
              transform={`rotate(-35 ${xCenter} ${height - padding.bottom + 20})`}
            >
              {groupBy === "assignee" ? truncate(c.label, 14) : c.label}
            </text>
            <text x={xCenter} y={y - 4} fontSize="10" fill="#334155" textAnchor="middle">
              {c.y.toLocaleString()}
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
  height: 36,
  padding: "0 10px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "white",
  cursor: "pointer",
  fontSize: 12,
};

const dangerBtn: React.CSSProperties = {
  height: 28,
  padding: "0 10px",
  borderRadius: 6,
  border: "1px solid #ef4444",
  background: "#fff1f2",
  color: "#b91c1c",
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
  background: "#f8fafc",
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderTop: "1px solid #f1f5f9",
  verticalAlign: "top",
};

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function formatDate(v: string | number) {
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

function fmtDateCell(v: any): string {
  if (v === null || v === undefined || v === "") return "";
  try {
    return formatDate(v);
  } catch {
    return String(v);
  }
}

function fmtDateTimeCell(v: any): string {
  if (!v) return "";
  try {
    const d = new Date(v);
    // Show YYYY-MM-DD HH:MM (UTC)
    const iso = d.toISOString();
    return iso.slice(0, 16).replace("T", " ") + "Z";
  } catch {
    return String(v);
  }
}