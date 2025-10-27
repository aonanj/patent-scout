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

type TrendPoint = { label: string; count: number; top_assignee?: string | null };

type SortOption = "pub_date_desc" | "assignee_asc";

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

function PrimaryButton({ onClick, children, disabled, style, title }: { onClick?: () => void; children: React.ReactNode; disabled?: boolean; style?: React.CSSProperties; title?: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const buttonStyle: React.CSSProperties = {
    height: 36,
    padding: "0 12px",
    borderRadius: 8,
    border: isHovered ? "2px solid #5FA8D2" : "1px solid #0ea5e9",
    background: isHovered ? "#39506b" : "#0ea5e9",
    color: "white",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 600,
    opacity: disabled ? 0.6 : 1,
    ...style,
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={buttonStyle}
      title={title}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
    </button>
  );
}

function GhostButton({ onClick, children, disabled, style, title }: { onClick?: () => void; children: React.ReactNode; disabled?: boolean; style?: React.CSSProperties; title?: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const buttonStyle: React.CSSProperties = {
    height: 36,
    padding: "0 12px",
    borderRadius: 8,
    border: isHovered ? "2px solid #5FA8D2" : "1px solid #0ea5e9",
    background: isHovered ? "#bcccdc" : "#d9e1eb",
    color: "#39506b",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 500,
    opacity: disabled ? 0.6 : 1,
    ...style,
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={buttonStyle}
      title={title}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, children, disabled, style, title }: { onClick?: () => void; children: React.ReactNode; disabled?: boolean; style?: React.CSSProperties; title?: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const buttonStyle: React.CSSProperties = {
    height: 36,
    padding: "0 10px",
    borderRadius: 8,
    border: isHovered ? "2px solid #5FA8D2" : "1px solid #0ea5e9",
    background: isHovered ? "#bcccdc" : "#d9e1eb",
    color: "#39506b",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 12,
    opacity: disabled ? 0.6 : 1,
    ...style,
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={buttonStyle}
      title={title}
      onMouseEnter={() => !disabled && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
    </button>
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
  const [appliedQ, setAppliedQ] = useState("");
  const [appliedSemantic, setAppliedSemantic] = useState("");
  const [appliedAssignee, setAppliedAssignee] = useState("");
  const [appliedCpc, setAppliedCpc] = useState("");
  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo, setAppliedDateTo] = useState("");

  // data
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("pub_date_desc");

  // Sigma component handles its own container; no external ref needed.

  const [dateBounds, setDateBounds] = useState<{ min: string; max: string} | null>(null);
  const [downloading, setDownloading] = useState<null | "csv" | "pdf">(null);

  // Save current query as an alert in saved_query table via API route
  const saveAsAlert = useCallback(async () => {
    try {
      const defaultName = appliedQ || appliedAssignee || appliedCpc || "My Alert";
      const name = window.prompt("Alert name", defaultName);
      if (!name) return;

      const token = await getAccessTokenSilently();

      setSaving(true);
      setSaveMsg(null);

      const payload = {
        name,
        filters: {
          keywords: appliedQ || null,
          assignee: appliedAssignee || null,
          cpc: appliedCpc || null,
          date_from: appliedDateFrom || null,
          date_to: appliedDateTo || null,
        },
        semantic_query: appliedSemantic || null,
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
        const errorData = await r.json().catch(() => ({}));
        throw new Error(errorData.detail || `Save failed (${r.status})`);
      }
      setSaveMsg("Alert saved");
      setTimeout(() => setSaveMsg(null), 3500);
    } catch (e: any) {
      setSaveMsg(e?.message || "Save failed");
      setTimeout(() => setSaveMsg(null), 5000);
    } finally {
      setSaving(false);
    }
  }, [appliedQ, appliedSemantic, appliedAssignee, appliedCpc, appliedDateFrom, appliedDateTo, getAccessTokenSilently]);


  const fetchSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const dateToInt = (d: string) => d ? parseInt(d.replace(/-/g, ""), 10) : undefined;

      const payload = {
        keywords: appliedQ || undefined,
        semantic_query: appliedSemantic || undefined,
        filters: {
          assignee: appliedAssignee || undefined,
          cpc: appliedCpc || undefined,
          date_from: dateToInt(appliedDateFrom),
          date_to: dateToInt(appliedDateTo),
        },
        limit: pageSize,
        offset: (page - 1) * pageSize,
        sort_by: sortBy,
      };

      const res = await fetch(`/api/search`, {
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
      const data = await res.json();
      setHits(data.items ?? []);
      setTotal(data.total ?? null);
    } catch (e: any) {
      setError(e?.message ?? "search failed");
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently, page, pageSize, appliedQ, appliedSemantic, appliedAssignee, appliedCpc, appliedDateFrom, appliedDateTo, sortBy]);

  const fetchTrend = useCallback(async () => {
    setTrendLoading(true);
    setTrendError(null);
    try {
      const token = await getAccessTokenSilently();
      const dateToInt = (d: string) => (d ? parseInt(d.replace(/-/g, ""), 10) : undefined);

      const p = new URLSearchParams();
      if (appliedQ) p.set("q", appliedQ);
      if (appliedSemantic) p.set("semantic_query", appliedSemantic);
      if (appliedAssignee) p.set("assignee", appliedAssignee);
      if (appliedCpc) p.set("cpc", appliedCpc);
      if (appliedDateFrom) p.set("date_from", dateToInt(appliedDateFrom)!.toString());
      if (appliedDateTo) p.set("date_to", dateToInt(appliedDateTo)!.toString());
      p.set("group_by", trendGroupBy);

      const res = await fetch(`/api/trend/volume?${p.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const raw: Array<Record<string, any>> = (Array.isArray(data) ? data : data?.points) || [];

      const getKey = (r: Record<string, any>): string => {
        const k = r.bucket ?? r.date ?? r.label ?? r.key ?? r.cpc ?? r.assignee ?? r.name ?? null;
        return k == null ? "" : String(k);
      };

      if (trendGroupBy === "month") {
        const points = raw
          .map((r) => ({
            label: getKey(r),
            count: Number(r.count) || 0,
            top_assignee: r.top_assignee ?? null,
          }))
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
          .map(([label, count]) => ({ label, count, top_assignee: null }))
          .sort((a, b) => b.count - a.count);
        const top = sorted.slice(0, 10);
        const restSum = sorted.slice(10).reduce((acc, x) => acc + x.count, 0);
        const finalPoints = restSum > 0 ? [...top, { label: "Other", count: restSum, top_assignee: null }] : top;
        setTrend(finalPoints);
      } else {
        const itemsAll = raw.map((r) => ({ key: getKey(r), count: Number(r.count) || 0 }));
        const known = itemsAll.filter((i) => i.key).map((i) => ({ label: i.key as string, count: i.count, top_assignee: null }));
        const sorted = known.filter((p) => p.count > 0).sort((a, b) => b.count - a.count);
        const top = sorted.slice(0, 15);
        setTrend(top);
      }
    } catch (err: any) {
      setTrend([]);
      setTrendError(err?.message ?? "Trend fetch failed");
    } finally {
      setTrendLoading(false);
    }
  }, [getAccessTokenSilently, appliedQ, appliedSemantic, appliedAssignee, appliedCpc, appliedDateFrom, appliedDateTo, trendGroupBy]);

  // whitespace analysis moved to /whitespace page

  // NOTE: rendering is now handled by SigmaWhitespaceGraph component below.

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

  const displayedDateFrom = appliedDateFrom || (dateBounds?.min ?? '');
  const displayedDateTo = appliedDateTo || (dateBounds?.max ?? '');

  const totalPages = useMemo(() => {
    if (total === null) return null;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [total, pageSize]);
  const isFetchingData = loading || trendLoading;

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
    if (appliedQ) p.set("q", appliedQ);
    if (appliedSemantic) p.set("semantic_query", appliedSemantic);
    if (appliedAssignee) p.set("assignee", appliedAssignee);
    if (appliedCpc) p.set("cpc", appliedCpc);
    if (appliedDateFrom) p.set("date_from", String(dateToInt(appliedDateFrom)));
    if (appliedDateTo) p.set("date_to", String(dateToInt(appliedDateTo)));
    p.set("limit", "1000");
    p.set("sort", sortBy);
    return `/api/export?${p.toString()}`;
  }, [appliedQ, appliedSemantic, appliedAssignee, appliedCpc, appliedDateFrom, appliedDateTo, sortBy]);

  const triggerDownload = useCallback(async (fmt: "csv" | "pdf") => {
    try {
      setDownloading(fmt);
      const token = await getAccessTokenSilently();
      const url = buildExportUrl(fmt);
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) {
        const errorData = await r.json().catch(() => ({}));
        throw new Error(errorData.detail || `Export failed (${r.status})`);
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

  const handleApply = useCallback(() => {
    setAppliedQ(q);
    setAppliedSemantic(semantic);
    setAppliedAssignee(assignee);
    setAppliedCpc(cpc);
    setAppliedDateFrom(dateFrom);
    setAppliedDateTo(dateTo);
    setPage(1);
  }, [q, semantic, assignee, cpc, dateFrom, dateTo]);

  const handleReset = useCallback(() => {
    setQ("");
    setSemantic("");
    setAssignee("");
    setCpc("");
    setDateFrom("");
    setDateTo("");
    setAppliedQ("");
    setAppliedSemantic("");
    setAppliedAssignee("");
    setAppliedCpc("");
    setAppliedDateFrom("");
    setAppliedDateTo("");
    setSortBy("pub_date_desc");
    setPage(1);
  }, []);

  return (
    <div style={{ padding: 20, background: "#eaf6ff", minHeight: "100vh" }}>
      
      {/* Login Overlay */}
      {!isLoading && !isAuthenticated && (
        <div style={overlayStyle}>
          <div style={overlayContentStyle}>
            <h2 style={{ marginTop: 0, fontSize: 20, fontWeight: 600 }}>Patent Scout</h2>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 400 }}>presented by Phaethon Order LLC</h3>
            <p style={{ color: '#475569', marginBottom: 24 }}>Please log in or sign up to continue.</p>
            <PrimaryButton
              onClick={() => loginWithRedirect()}
              style={{ padding: '0 24px', height: 44, fontSize: 16 }}
            >
              Log In / Sign Up
            </PrimaryButton>
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
                <Label htmlFor="cpc">CPC 
                  (<a href="https://www.uspto.gov/web/patents/classification/cpc/html/cpc.html" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">reference</a>)
                </Label>
                <input
                  id="cpc"
                  value={cpc}
                  onChange={(e) => setCpc(e.target.value)}
                  placeholder="e.g., G06N, G06F17/00, ..."
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

              <PrimaryButton onClick={handleApply}>
                Apply
              </PrimaryButton>

              <GhostButton onClick={handleReset}>
                Reset
              </GhostButton>

              <SecondaryButton onClick={saveAsAlert} disabled={saving || !isAuthenticated} title="Save current filters as an alert">
                {saving ? "Saving…" : "Save Alert"}
              </SecondaryButton>
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
          {isFetchingData ? (
            <div style={{ fontSize: 13, color: "#64748b" }}>Loading…</div>
          ) : trendError ? (
            <div style={{ fontSize: 13, color: "#b91c1c" }}>Error: {trendError}</div>
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
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {!isFetchingData && total !== null && (
                <span style={{ fontSize: 12, color: "#334155" }}>
                  {total.toLocaleString()} total
                </span>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Label htmlFor="results_sort">Sort</Label>
                <select
                  id="results_sort"
                  value={sortBy}
                  onChange={(e) => {
                    const next = e.target.value as SortOption;
                    setSortBy(next);
                    setPage(1);
                  }}
                  style={{ height: 28, border: "1px solid #e5e7eb", borderRadius: 6, padding: "0 8px" }}
                >
                  <option value="pub_date_desc">Most Recent</option>
                  <option value="assignee_asc">Assignee (A→Z)</option>
                </select>
              </div>
              {!isFetchingData && total !== null && total > 0 && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <SecondaryButton onClick={() => triggerDownload('csv')} disabled={downloading !== null} title="Download top 1000 as CSV">
                    {downloading === 'csv' ? 'Generating…' : 'Export CSV'}
                  </SecondaryButton>
                  <SecondaryButton onClick={() => triggerDownload('pdf')} disabled={downloading !== null} title="Download top 1000 as PDF">
                    {downloading === 'pdf' ? 'Generating…' : 'Export PDF'}
                  </SecondaryButton>
                </div>
              )}
            </div>
          </Row>

          {error && (
            <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 8 }}>Error: {error}</div>
          )}

          {isFetchingData ? (
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 12 }}>Loading…</div>
          ) : hits.length === 0 ? (
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 12 }}>No results</div>
          ) : (
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
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <SecondaryButton
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Prev
            </SecondaryButton>
            <div style={{ fontSize: 12, alignSelf: "center" }}>
              Page {page}
              {totalPages ? ` / ${totalPages}` : ""}
            </div>
            <SecondaryButton
              onClick={() => {
                if (totalPages && page >= totalPages) return;
                setPage((p) => p + 1);
              }}
              disabled={!!totalPages && page >= totalPages}
            >
              Next
            </SecondaryButton>
          </div>
        </Card>
      </div>

      {/* Footer */}
      <footer style={{ marginTop: 24, textAlign: "center", color: "#64748b", fontSize: 12, fontWeight: 500 }}>
        2025 © Phaethon Order LLC | <a href="mailto:support@phaethon.llc" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">support@phaethon.llc</a> | <a href="https://phaethonorder.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">phaethonorder.com</a> | <a href="/help" className="text-blue-400 hover:underline">Help</a> | <a href="/docs" className="text-blue-400 hover:underline">Legal</a>
      </footer>
    </div>
  );
}

function TrendChart({ data, groupBy, height = 180 }: { data: TrendPoint[]; groupBy: "month" | "cpc" | "assignee"; height?: number }) {
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; data: TrendPoint } | null>(null);
  const padding = { left: 60, right: 28, top: 28, bottom: 28 };
  const width = 900;
  const w = width - padding.left - padding.right;
  const h = height - padding.top - padding.bottom;

  // Clear tooltip when switching groupBy modes
  useEffect(() => {
    setHoveredPoint(null);
  }, [groupBy]);

  // Format YYYY-MM to "Month Year"
  const formatMonthYear = (dateStr: string): string => {
    try {
      if (!dateStr || typeof dateStr !== 'string') return dateStr || '';
      const parts = dateStr.split('-');
      if (parts.length < 2) return dateStr;
      const [year, month] = parts;
      const yearNum = parseInt(year);
      const monthNum = parseInt(month);
      if (isNaN(yearNum) || isNaN(monthNum)) return dateStr;
      const date = new Date(yearNum, monthNum - 1, 1);
      const monthName = date.toLocaleString('en-US', { month: 'long' });
      return `${monthName} ${year}`;
    } catch (e) {
      return dateStr;
    }
  };

  if (groupBy === "month") {
    const parsed = data
      .map((d) => {
        const isoLabel = d.label?.length === 7 ? `${d.label}-01` : d.label;
        const timestamp = isoLabel ? new Date(isoLabel).getTime() : NaN;
        return {
          x: timestamp,
          y: Number(d.count) || 0,
          label: d.label,
          top_assignee: d.top_assignee,
        };
      })
      .filter((d) => !Number.isNaN(d.x))
      .sort((a, b) => a.x - b.x);

    const xs = parsed.map((d) => d.x);
    const ys = parsed.map((d) => d.y);
    const minX = xs.length ? Math.min(...xs) : 0;
    const maxX = xs.length ? Math.max(...xs) : 0;
    const minY = ys.length ? Math.min(...ys) : 0;
    const maxY = ys.length ? Math.max(...ys) : 0;
    const xRange = Math.max(1, maxX - minX);
    const yRange = Math.max(1, maxY - minY);

    const scaleX = (x: number) => padding.left + ((x - minX) / xRange) * w;
    const scaleY = (y: number) => padding.top + h - ((y - minY) / yRange) * h;

    const path =
      parsed.length === 0
        ? ""
        : parsed
            .map((d, i) => `${i === 0 ? "M" : "L"} ${scaleX(d.x)} ${scaleY(d.y)}`)
            .join(" ");

    const yTicks = 4;
    const yVals = Array.from({ length: yTicks + 1 }, (_, i) =>
      Math.round(minY + (i * (maxY - minY)) / yTicks)
    );

    return (
      <div style={{ position: "relative" }}>
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
            <circle
              key={i}
              cx={scaleX(d.x)}
              cy={scaleY(d.y)}
              r="5"
              fill={hoveredPoint?.data.label === d.label ? "#0284c7" : "#0ea5e9"}
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                if (rect) {
                  setHoveredPoint({
                    x: scaleX(d.x) * (rect.width / width),
                    y: scaleY(d.y) * (rect.height / height),
                    data: { label: d.label, count: d.y, top_assignee: d.top_assignee },
                  });
                }
              }}
              onMouseLeave={() => setHoveredPoint(null)}
            />
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
        {hoveredPoint && groupBy === "month" && (
          <div
            style={{
              position: "absolute",
              left: hoveredPoint.x + 10,
              top: hoveredPoint.y - 60,
              background: "rgba(0, 0, 0, 0.85)",
              color: "white",
              padding: "8px 12px",
              borderRadius: "6px",
              fontSize: "12px",
              pointerEvents: "none",
              zIndex: 1000,
              minWidth: "150px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            <div style={{ fontWeight: "600", marginBottom: "4px" }}>
              {formatMonthYear(hoveredPoint.data.label)}
            </div>
            <div style={{ marginBottom: "2px" }}>
              Entries: {hoveredPoint.data.count}
            </div>
            {hoveredPoint.data.top_assignee && (
              <div style={{ fontSize: "11px", color: "#d1d5db", marginTop: "4px" }}>
                Top Assignee: {hoveredPoint.data.top_assignee}
              </div>
            )}
          </div>
        )}
      </div>
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
