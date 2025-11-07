// app/help/whitespace/page.tsx
"use client";

import type { CSSProperties } from "react";

const TEXT_COLOR = "#102A43";
const LINK_COLOR = "#5FA8D2";
const CARD_BG = "rgba(255, 255, 255, 0.8)";
const CARD_BORDER = "rgba(255, 255, 255, 0.45)";
const CARD_SHADOW = "0 26px 54px rgba(15, 23, 42, 0.28)";

const pageWrapperStyle: CSSProperties = {
  padding: "48px 24px 64px",
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  gap: 32,
  color: TEXT_COLOR,
};

const surfaceStyle: CSSProperties = {
  maxWidth: 960,
  width: "100%",
  margin: "0 auto",
  display: "grid",
  gap: 24,
  padding: 32,
  borderRadius: 28,
};

const cardBaseStyle: CSSProperties = {
  background: CARD_BG,
  border: `1px solid ${CARD_BORDER}`,
  borderRadius: 20,
  padding: 32,
  boxShadow: CARD_SHADOW,
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
};

const linkButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 28px",
  borderRadius: 999,
  background: "linear-gradient(105deg, #5FA8D2 0%, #39506B 100%)",
  color: "#ffffff",
  fontWeight: 600,
  fontSize: 14,
  border: "1px solid rgba(107, 174, 219, 0.45)",
  boxShadow: "0 18px 36px rgba(107, 174, 219, 0.42)",
  textDecoration: "none",
  transition: "transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease",
};

export default function WhitespaceHelpPage() {
  return (
    <div style={pageWrapperStyle}>
      <div className="glass-surface" style={surfaceStyle}>

        {/* Header */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: TEXT_COLOR }}>Whitespace Analysis Guide</h1>
              <p style={{ marginTop: 8, fontSize: 14, color: "#627D98", marginBottom: 0 }}>
                <a href="/help" style={{ color: LINK_COLOR, textDecoration: "none" }}>← Back to Help</a>
              </p>
            </div>
            <a href="/whitespace" className="btn-modern" style={linkButtonStyle}>
              Go to Whitespace →
            </a>
          </div>
          <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 0 }}>
            The Whitespace page now surfaces the primitives that determine whether an AI/ML concept is crowded, accelerating, or still open. Use this guide to interpret the overview tiles, timeline, CPC distribution, and optional assignee signals.
          </p>
        </div>

        {/* Overview */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>What the Whitespace Overview Measures</h2>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 12 }}>
            For any combination of focus keywords, CPC filters, and date range the overview performs the following steps:
          </p>
          <ol style={{ marginLeft: 20, marginTop: 12, fontSize: 14, lineHeight: 1.5, listStyleType: "decimal", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li>Builds a focus cohort using PostgreSQL full-text search and, when enabled, semantic nearest neighbors.</li>
            <li>Counts distinct publications in that cohort (exact, semantic, and combined) and normalizes volume per month.</li>
            <li>Buckets filings by month via the trend API to compute slope, CAGR, and the Up / Flat / Down momentum label.</li>
            <li>Aggregates CPC classifications to show the top slices and a broader breakdown for adjacent technology clusters.</li>
            <li>Summarizes recency (6/12/24 month totals) and, when available, tags crowding with a percentile vs. historical queries.</li>
            <li>Optionally (when “Group by Assignee” is enabled) builds the legacy embedding graph and signal cards per assignee.</li>
          </ol>
        </div>

        {/* Input Fields */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Inputs & Toggles</h2>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 16 }}>
            At least one focus input (keywords or CPC) is required. The default window covers the past 24 months, anchored to the end date.
          </p>
          <div style={{ display: "grid", gap: 20 }}>
            <InputDescription
              label="Focus Keywords"
              description="Use comma-separated phrases that describe the technology you care about. The overview treats them as a Postgres `tsquery` over title, abstract, and claims."
              example="Example: foundation models, multi-modal reasoning, retrieval augmented generation"
              tips={[
                "Broader phrases enlarge the cohort; combine with CPC filters to focus results.",
                "Keywords drive both exact counts and the optional semantic neighbor embedding."
              ]}
            />
            <InputDescription
              label="CPC Filter"
              description="Filter the cohort to filings tagged with specific CPC prefixes. Supports partial codes such as G06N or full designations like G06F17/30."
              example="Example: G06N20/00, A61B5, G06V, G06K9/00"
              tips={[
                "Multiple CPC filters are OR’ed together; combine with keywords for precise intersections.",
                "Use broader prefixes (e.g., G06N) to capture related subgroups when exploring adjacent domains."
              ]}
            />
            <InputDescription
              label="Date Range"
              description="Restrict filings by publication date. Empty fields fall back to the full corpus. When only an end date is provided the start defaults to 23 months earlier."
              example="Example: From 2023-07-01, To 2025-06-30"
              tips={[
                "Shorter ranges highlight current activity; longer ranges provide more stable density and percentile signals.",
                "Momentum uses the monthly series inside the selected window."
              ]}
            />
            <InputDescription
              label="Show Semantic Neighbors (toggle)"
              description="When enabled, the overview retrieves the nearest neighbors from the embedding index and merges them with exact keyword hits."
              example="Default: Enabled"
              tips={[
                "Disable if you want to analyze only literal keyword matches.",
                "Semantic neighbors obey the same date and CPC filters after the nearest neighbor search."
              ]}
            />
            <InputDescription
              label="Group by Assignee (toggle)"
              description="Loads the legacy graph, assignee signal cards, and Sigma visualization beneath the overview. Off by default."
              example="Default: Disabled"
              tips={[
                "Enable only when you need convergence / crowd-out style signals tied to specific assignees.",
                "Toggling on after a run reuses the latest filters—no need to re-run the overview."
              ]}
            />
          </div>
        </div>

        {/* Overview Tiles */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Interpreting the Overview Tiles</h2>
          <div style={{ display: "grid", gap: 16 }}>
            <MetricTile
              title="Crowding"
              summary="Exact, semantic, and total distinct publication counts inside the window."
              bullets={[
                "Review exact vs. semantic to see how literal the coverage is.",
                "Density per month = total count divided by the number of months (window defaults to 24).",
                "Percentile (when present) maps into Low / Medium / High / Very High guidance."
              ]}
            />
            <MetricTile
              title="Density"
              summary="Average filings per month plus the observed min/max band."
              bullets={[
                "Use the band to understand volatility inside the window.",
                "High density with a narrow band indicates sustained filing cadence."
              ]}
            />
            <MetricTile
              title="Momentum"
              summary="Slope of the monthly time series and CAGR over the window."
              bullets={[
                "Momentum bucket: Up (> +0.05), Down (< -0.05), otherwise Flat.",
                "Slope is normalized by average volume; use CAGR to contextualize growth rate."
              ]}
            />
            <MetricTile
              title="Top CPCs"
              summary="Highest volume CPC codes among matched filings."
              bullets={[
                "Shows the leading technology slices at a glance.",
                "Use the detailed CPC bar chart below for depth beyond the top five."
              ]}
            />
          </div>
        </div>

        {/* Charts */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Timeline & CPC Distribution</h2>
          <div style={{ display: "grid", gap: 20 }}>
            <LayoutSection
              title="Timeline sparkline"
              description="Plots monthly publication counts across the selected window. Hover in the UI to inspect the exact month totals. Sudden inflections foreshadow changes in the momentum bucket."
            />
            <LayoutSection
              title="CPC density bars"
              description="Ranks CPC codes by filing volume. Concentrated bars indicate a narrow technology footprint; a long tail suggests broader exploration. Pair with the Top CPCs tile to see absolute counts."
            />
            <LayoutSection
              title="Recency badges"
              description="Summaries for the last 6, 12, and 24 months. Use these to compare near-term filing velocity against the historical average."
            />
          </div>
        </div>

        {/* Results Table */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Patent & Publication Table</h2>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 16 }}>
            The table lists up to 100 filings per run (ordered by recency). Click any publication number to open the Google Patents record in a new tab.
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            <TableColumn column="Title" description="Official title; if missing we display the publication number." />
            <TableColumn column="Publication" description="USPTO publication identifier with kind code. Links out to Google Patents." />
            <TableColumn column="Assignee" description="Canonicalized assignee name when available; 'Unknown' if not present." />
            <TableColumn column="Date" description="Publication date formatted as YYYY-MM-DD." />
            <TableColumn column="CPC Badges" description="Up to four CPC codes (section/class/subclass/group) attached to the filing." />
          </div>
        </div>

        {/* Optional Legacy Signals */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Optional Assignee Signals</h2>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 12 }}>
            Switching on “Group by Assignee” augments the overview with the legacy clustering view. It fetches embeddings, builds a cosine KNN graph, and evaluates four signals per grouping:
          </p>
          <ul style={{ marginLeft: 20, fontSize: 14, lineHeight: 1.5, listStyleType: "disc", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li><strong>Emerging Gap</strong>: Opportunity where an assignee has coverage but neighboring clusters stay sparse.</li>
            <li><strong>Bridge</strong>: Cross-cluster connectors with rising momentum on both sides.</li>
            <li><strong>Convergence</strong>: Risk indicator showing an assignee filing closer to your focus scope over time.</li>
            <li><strong>Crowd-out</strong>: Risk indicator where local density around your scope is accelerating sharply.</li>
          </ul>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginTop: 12 }}>
            Use this toggle when you need narrative around specific competitors. For quick whitespace sizing, the overview tiles are usually sufficient.
          </p>
        </div>

        {/* Workflow */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Suggested Workflow</h2>
          <ol style={{ marginLeft: 20, fontSize: 14, lineHeight: 1.5, listStyleType: "decimal", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li>Start with focus keywords and a 24-month window to gauge baseline crowding and momentum.</li>
            <li>Layer CPC filters to narrow into adjacent clusters and watch how the CPC bars shift.</li>
            <li>Inspect the timeline sparkline to confirm whether momentum aligns with the bucket label.</li>
            <li>Review filings in the table and spot-check CPC coverage before diving into full-text review.</li>
            <li>Enable “Group by Assignee” if you need competitive storytelling or candidate filings for diligence.</li>
          </ol>
        </div>

        {/* Best Practices */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Best Practices</h2>
          <div style={{ display: "grid", gap: 16 }}>
            <BestPractice
              title="Anchor the window to a strategic milestone"
              tip="Shift the end date to align with product launches or regulatory moments. Comparing periods highlights whether filings are accelerating into that milestone."
            />
            <BestPractice
              title="Compare exact vs. semantic crowding"
              tip="Large gaps between exact and semantic counts mean the language around your concept varies. Consider broadening keywords or tightening the semantic toggle."
            />
            <BestPractice
              title="Monitor CPC drift"
              tip="When the CPC bar chart shifts after minor keyword tweaks, the concept spans multiple technology families—plan follow-up analyses per cluster."
            />
          </div>
        </div>

        {/* Troubleshooting */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Troubleshooting</h2>
          <div style={{ display: "grid", gap: 16 }}>
            <Troubleshoot
              issue="No results returned"
              solution="Verify at least one keyword or CPC is provided. Try widening the date range or disabling semantic neighbors if the query is very niche."
            />
            <Troubleshoot
              issue="Momentum stays Flat"
              solution="Check the timeline sparkline for month-to-month variability. Extending the window or adding semantic neighbors can reveal more signal."
            />
            <Troubleshoot
              issue="Assignee graph looks empty"
              solution="Ensure “Group by Assignee” is toggled on and the latest run completed. Some narrow scopes simply lack enough filings per assignee to form signals."
            />
          </div>
        </div>

        {/* Footer */}
        <footer style={footerStyle}>
          2025 © Phaethon Order LLC | <a href="mailto:support@phaethon.llc" target="_blank" rel="noopener noreferrer" className="text-[#312f2f] hover:underline hover:text-blue-400">support@phaethon.llc</a> | <a href="https://phaethonorder.com" target="_blank" rel="noopener noreferrer" className="text-[#312f2f] hover:underline hover:text-blue-400">phaethonorder.com</a> | <a href="/help" className="text-[#312f2f] hover:underline hover:text-blue-400">Help</a> | <a href="/docs" className="text-[#312f2f] hover:underline hover:text-blue-400">Legal</a>
        </footer>
      </div>
    </div>
  );
}

function InputDescription({
  label,
  description,
  example,
  tips,
}: {
  label: string;
  description: string;
  example: string;
  tips: string[];
}) {
  return (
    <div>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: TEXT_COLOR }}>{label}</h3>
      <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR }}>{description}</p>
      <p style={{ margin: "8px 0", fontSize: 13, fontStyle: "italic", color: "#627D98" }}>{example}</p>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_COLOR, marginBottom: 6 }}>Tips:</div>
        <ul style={{ marginLeft: 20, fontSize: 13, lineHeight: 1.5, listStyleType: "circle", listStylePosition: "outside", color: TEXT_COLOR }}>
          {tips.map((tip, idx) => (
            <li key={idx}>{tip}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MetricTile({ title, summary, bullets }: { title: string; summary: string; bullets: string[] }) {
  return (
    <div className="glass-card" style={{ padding: 18, borderRadius: 16, background: "rgba(107, 174, 219, 0.12)", border: "1px solid rgba(107, 174, 219, 0.25)", boxShadow: "0 14px 26px rgba(107, 174, 219, 0.18)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: TEXT_COLOR }}>{title}</h3>
      <p style={{ margin: "8px 0", fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR }}>{summary}</p>
      <ul style={{ marginLeft: 20, fontSize: 13, lineHeight: 1.5, listStyleType: "disc", listStylePosition: "outside", color: TEXT_COLOR }}>
        {bullets.map((bullet, idx) => (
          <li key={idx}>{bullet}</li>
        ))}
      </ul>
    </div>
  );
}

function LayoutSection({ title, description }: { title: string; description: string }) {
  return (
    <div className="glass-card" style={{ padding: 18, borderRadius: 16 }}>
      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT_COLOR }}>{title}</h4>
      <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR }}>{description}</p>
    </div>
  );
}

function TableColumn({ column, description }: { column: string; description: string }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ fontWeight: 600, fontSize: 14, color: TEXT_COLOR, minWidth: 140 }}>{column}:</span>
      <span style={{ fontSize: 14, color: TEXT_COLOR }}>{description}</span>
    </div>
  );
}

function BestPractice({ title, tip }: { title: string; tip: string }) {
  return (
    <div style={{ padding: 16, border: `1px solid ${CARD_BORDER}`, borderRadius: 8, background: "#f0fdf4" }}>
      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#166534" }}>{title}</h4>
      <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR }}>{tip}</p>
    </div>
  );
}

function Troubleshoot({ issue, solution }: { issue: string; solution: string }) {
  return (
    <div style={{ padding: 16, border: `1px solid ${CARD_BORDER}`, borderRadius: 8, background: "#fef3c7" }}>
      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#92400e" }}>Issue: {issue}</h4>
      <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR }}>
        <strong>Solution:</strong> {solution}
      </p>
    </div>
  );
}

const footerStyle: React.CSSProperties = {
  alignSelf: "center",
  padding: "16px 24px",
  borderRadius: 999,
  background: "rgba(255, 255, 255, 0.22)",
  border: "1px solid rgba(255, 255, 255, 0.35)",
  boxShadow: "0 16px 36px rgba(15, 23, 42, 0.26)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  color: "#102a43",
  textAlign: "center",
  fontSize: 13,
  fontWeight: 500,
  gap: 4,
};

