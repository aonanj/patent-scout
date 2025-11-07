// app/help/page.tsx
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
  border: "1px solid rgba(107, 174, 219, 0.55)",
  boxShadow: "0 18px 36px rgba(107, 174, 219, 0.55)",
  textDecoration: "none",
  transition: "transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease",
};

export default function HelpIndexPage() {
  return (
    <div style={pageWrapperStyle}>
      <div className="glass-surface" style={surfaceStyle}>

        {/* Header */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: TEXT_COLOR }}>Patent Scout Help</h1>
          <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 0 }}>
            Welcome to Patent Scout, an advanced data and analytics platform directed to artificial intelligence (AI) and machine learning (ML) intellectual property (IP). This help center includes documentation describing the platform's various features and terminology, as well as guides to the user interfaces and workflows on the platform.
          </p>
        </div>

        {/* Overview */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Introduction to the Patent Scout Platform</h2>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 8 }}>
            Patent Scout is an IP platform specific to AI/ML data and analytics. The platform combines hybrid semantic search, trend analysis, and whitespace signaling to provide an integrated and in-depth understanding of the IP landscape as it relates to AI/ML innovations and investments and the entities active in this space. The platform is built on a relational database system that includes 56,000+ AI/ML-related patents and publications dating back to 2023.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 8 }}>
            Each entry (i.e., patent or publication) in the database is enriched with metadata and context; specifically, each entry corresponds to a patent or publication with multiple associated AI embeddings. The multiple AI embeddings enable accurate and robust semantic searching over multiple fields and combinations of fields.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 12 }}>
            Metadata and context for each entry further include the assignee name (i.e., owner). The Patent Scout platform normalizes each assignee name to ensure that the AI/ML IP assets held by different entities are accurately and comprehensively represented.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 12 }}>
            Patent Scout is designed with a streamlined user interface divided between two primary web service pages:
          </p>
          <ul style={{ marginLeft: 20, marginTop: 12, fontSize: 14, lineHeight: 1.5, listStyleType: "disc", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li><strong>Search & Trends</strong>: Discover patents and publications through hybrid keyword and semantic search, visualize filing trends over time, by CPC code, or by assignee, and set up proactive alerts for new filings that match configurable criteria;</li>
            <li><strong>Whitespace Analysis</strong>: Size whitespace with crowding, density, momentum, and CPC context tiles, then optionally layer on assignee signals for competitive storytelling.</li>
          </ul>
        </div>

        {/* Feature Cards Grid */}
        <div style={{ display: "grid", gap: 24 }}>

          {/* Search & Trends Card */}
          <div
            className="glass-card"
            style={{
              ...cardBaseStyle,
              border: "1.5px solid rgba(107, 174, 219, 0.75)",
              boxShadow: "0 30px 60px rgba(107, 174, 219, 0.32)",
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <div style={{ flex: 1, minWidth: 250 }}>
                <h3 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: TEXT_COLOR }}>Search & Trends</h3>
                <p style={{ marginTop: 8, fontSize: 13, color: "#627D98", marginBottom: 0 }}>
                  Hybrid search, trend visualization, and proactive alerts
                </p>
              </div>
              <a
                href="/help/search_trends"
                className="btn-modern"
                style={linkButtonStyle}
              >
                View Guide →
              </a>
            </div>

            <p style={{ marginTop: 20, fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 8 }}>
              The Search & Trends page is the primary interface for discovering and monitoring granted patents and published applications. It combines powerful search capabilities with visual trend analytics to provide an easily comprehensible view of the AI/ML IP landscape. The intuitive interface allows users to construct complex queries using both keywords and semantic similarity, filter results by various metadata fields, and visualize filing trends over time, by CPC classification, or by assignee. 
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 16 }}>
              The Search & Trends page further includes the option to save a particular search configuration as an alert. Patent Scout updates its database on a weekly basis, following the USPTO schedule. Saved searches are automatically run when new data becomes available, and users are notified of new matches.
            </p>

            <div style={{ display: "grid", gap: 12 }}>
              <DetailItem icon="⬩" title="Hybrid Search" text="Combine keyword and semantic queries to find relevant patents and publications using both exact matches and AI-powered similarity" />
              <DetailItem icon="⬩" title="Advanced Filters" text="Narrow results by assignee, CPC code, grant/publication date range, and more" />
              <DetailItem icon="⬩" title="Trend Visualization" text="Visualize patent filing trends by month, CPC classification, or assignee to spot patterns and emerging areas" />
              <DetailItem icon="⬩" title="Export Capabilities" text="Download search results as CSV or enriched PDF reports for offline analysis" />
              <DetailItem icon="⬩" title="Saved Alerts" text="Save your search criteria and receive notifications when new patents and publications match your filters" />
            </div>

            <div
              style={{
                marginTop: 20,
                padding: 18,
                background: "rgba(57, 80, 107, 0.22)",
                borderRadius: 14,
                border: "1px solid rgba(155, 199, 255, 0.35)",
                boxShadow: "0 14px 26px rgba(107, 174, 219, 0.18)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
              }}
            >
              <p style={{ fontSize: 13, lineHeight: 1.5, color: TEXT_COLOR, margin: 0 }}>
                <strong>Example Use Cases</strong>: Ongoing competitive monitoring, prior art searches, freedom-to-operate and clearance analysis, and staying current with AI/ML IP as it relates to specific technology areas. Graphs provide visual guides on trends across the AI/ML IP landscape.
              </p>
            </div>
          </div>

          {/* Whitespace Analysis Card */}
          <div
            className="glass-card"
            style={{
              ...cardBaseStyle,
              border: "1.5px solid rgba(107, 174, 219, 0.75)",
              boxShadow: "0 30px 60px rgba(107, 174, 219, 0.32)",
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <div style={{ flex: 1, minWidth: 250 }}>
                <h3 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: TEXT_COLOR }}>Whitespace Analysis</h3>
                <p style={{ marginTop: 8, fontSize: 13, color: "#627D98", marginBottom: 0 }}>
                  Overview tiles for whitespace primitives with an optional assignee signal deep dive
                </p>
              </div>
              <a
                href="/help/whitespace"
                className="btn-modern"
                style={linkButtonStyle}
              >
                View Guide →
              </a>
            </div>

            <p style={{ marginTop: 20, fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 8 }}>
              The Whitespace page quantifies how crowded a scope is, how quickly activity is changing, and where filings cluster by CPC. Four tiles (Crowding, Density, Momentum, Top CPCs) headline the view, backed by a monthly sparkline, CPC bar chart, and a sortable result table with direct patent links.<a href="#footnote1" className="hover:underline" style={{ color: LINK_COLOR }}>*</a>
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 16 }}>
              When you need competitor-specific insight, toggle “Group by Assignee” to load the legacy Sigma graph and confidence-scored signals (emerging gaps, bridges, convergence, crowd-out). Otherwise, the overview primitives provide a fast and auditable whitespace readout.
            </p>

            <div style={{ display: "grid", gap: 12 }}>
              <DetailItem icon="⬩" title="Crowding & Density Tiles" text="Exact vs. semantic counts, density per month, and percentile labels expose how busy a space is." />
              <DetailItem icon="⬩" title="Momentum Labeling" text="Monthly trendline, slope, and CAGR classify activity as Up, Flat, or Down." />
              <DetailItem icon="⬩" title="CPC Distribution" text="Top CPC badges plus a ranked bar chart highlight adjacent technology slices." />
              <DetailItem icon="⬩" title="In-Page Result Table" text="Patent and publication rows (with CPC badges and external links) anchor qualitative review." />
              <DetailItem icon="⬩" title="Optional Assignee Signals" text="Enable the toggle to restore the Sigma.js graph and per-assignee convergence, bridge, crowd-out, and emerging gap signals." />
            </div>

            <div
              style={{
                marginTop: 20,
                padding: 18,
                background: "rgba(57, 80, 107, 0.22)",
                borderRadius: 14,
                border: "1px solid rgba(107, 174, 219, 0.25)",
                boxShadow: "0 14px 26px rgba(107, 174, 219, 0.18)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
              }}
            >
              <p style={{ fontSize: 13, lineHeight: 1.5, color: TEXT_COLOR, margin: 0 }}>
                <strong>Example Use Cases</strong>: Strategic IP investment decisions, whitespace opportunity identification, competitive threat assessment, and understanding where R&D focus is shifting in and around specific technology areas in the context of AI/ML.
              </p>
            </div>
          </div>

        </div>

        {/* Quick Start */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Quick Start Guide</h2>

          <div style={{ display: "grid", gap: 20 }}>
            <InfoSection
              title="1. Authentication"
              content="Patent Scout uses Auth0 for secure authentication. Log in or sign up using the button in the top navigation bar. All features require authentication to ensure data security and usage tracking."
            />

            <InfoSection
              title="2. Start with Search & Trends"
              content="Exploring the Search & Trends page may be helpful in familiarizing yourself with the patent and publication data set accessible through Patent Scout. Try a semantic query like 'autonomous vehicle perception systems' or use keyword filters to narrow results. Experiment with trend groupings to understand filing patterns."
            />

            <InfoSection
              title="3. Save Important Searches as Alerts"
              content="When you find a search configuration that matters to your work, click 'Save as Alert' to receive notifications when new patents or publications match your criteria. Manage your alerts through the navigation bar modal."
            />

            <InfoSection
              title="4. Explore Whitespace Opportunities"
              content="Navigate to the Whitespace page to size the space. Enter focus keywords or CPC codes, review the crowding/density/momentum tiles, inspect the timeline and CPC bars, and then dip into the result table for representative filings."
            />

            <InfoSection
              title="5. Export and Share Insights"
              content="Use CSV/PDF exports from Search & Trends for shareable reports, and copy links from the Whitespace table when you need to circulate specific patents or publications."
            />
          </div>
        </div>

        {/* Additional Resources */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Additional Resources</h2>

          <div style={{ display: "grid", gap: 16 }}>

            <Footnote
              id="footnote1"
              title="“Bridging” Patents and Publications"
              description="A “bridging” patent/publication is one in which the invention is directed to one technology area but the scope of protection can be broadened to cover other areas. Example: a patent claiming an improvement to internal combustion engines in automobiles, and the improvement can also be used in aviation, marine, and other internal combustion engine applications. Bridging patents have been shown to be especially commercially valuable. See, e.g., Choi & Yoon, Measuring Knowledge Exploration Distance at the Patent Level, 16 J. Informetr. 101286 (2002) (linked here). See also Moehrle & Frischkorn, Bridge Strongly or Focus — An Analysis of Bridging Patents [...], 15 J. Informetr. 101138 (2001)."
              href="https://ideas.repec.org/a/eee/infome/v16y2022i2s1751157722000384.html"
              external={true}
            />

            <ResourceLink
              title="Understanding CPC Codes"
              description="CPC (Cooperative Patent Classification) codes categorize patents and applications by technology area. For reference, the USPTO generally assigns AI and machine learning subject matter under one of the following CPC section (letter)+class(number)+subclass(letter) classifications: A61B, B60W, G05D, G06N, G06V, and G10L. More specific AI/ML-related subject matter is generally assigned to group, as well, as indicating by a number appended to the subclass: G06F17, G06F18, G06F40, G06K9, G06T7. A further subgroup indicates subject matter at an even more granular level, which is indicated by a third number, preceded by a backslash. For AI/ML-related subject matter, this is most commonly encoutered in CPC classification G06F16/90."
              href="https://www.uspto.gov/web/patents/classification/cpc/html/cpc.html"
              external={true}
            />

            <ResourceLink
              title="Legal Documentation"
              description="Review the Patent Scout platform Terms of Service, Privacy Policy, and Data Processing Agreement."
              href="/docs"
              external={false}
            />
          </div>
        </div>

        {/* Support */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Need Help?</h2>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 12 }}>
            If you have questions or encounter issues not covered in this documentation, please contact:
          </p>
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, margin: 0 }}>
              <strong>Email</strong>: <a href="mailto:support@phaethon.llc" className="hover:underline" style={{ color: LINK_COLOR }}>support@phaethon.llc</a><br />
              <strong>Subject Line</strong>: Patent Scout Support Request<br />
              <strong>Website</strong>: <a href="https://phaethonorder.com" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: LINK_COLOR }}>https://phaethonorder.com</a>
            </p>
          </div>
        </div>
      </div>
      <div className="glass-surface" style={surfaceStyle}>
        {/* Footer */}
        <footer style={footerStyle}>
          2025 © Phaethon Order LLC | <a href="mailto:support@phaethon.llc" target="_blank" rel="noopener noreferrer" className="text-[#312f2f] hover:underline hover:text-blue-400">support@phaethon.llc</a> | <a href="https://phaethonorder.com" target="_blank" rel="noopener noreferrer" className="text-[#312f2f] hover:underline hover:text-blue-400">phaethonorder.com</a> | <a href="/help" className="text-[#312f2f] hover:underline hover:text-blue-400">Help</a> | <a href="/docs" className="text-[#312f2f] hover:underline hover:text-blue-400">Legal</a>
        </footer>
      </div>
    </div>
  );
}

function DetailItem({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
      <div>
        <span style={{ fontWeight: 600, fontSize: 14, color: TEXT_COLOR }}>{title}:</span>
        <span style={{ fontSize: 14, color: TEXT_COLOR, marginLeft: 4 }}>{text}</span>
      </div>
    </div>
  );
}

function InfoSection({ title, content }: { title: string; content: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT_COLOR, marginBottom: 8 }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR }}>{content}</p>
    </div>
  );
}

function ResourceLink({ title, description, href, external }: { title: string; description: string; href: string; external: boolean }) {
  return (
    <div style={{ padding: 16, border: `2px solid ${CARD_BORDER}`, borderRadius: 8 }}>
      <a
        href={href}
        className="hover:underline"
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        style={{ fontSize: 15, fontWeight: 600, color: LINK_COLOR }}
      >
        {title} {external && "↗︎"}
      </a>
      <p style={{ margin: "6px 0 0 0", fontSize: 13, color: "#627D98" }}>{description}</p>
    </div>
  );
}

function Footnote({ id, title, description, href, external }: { id: string; title: string; description: string; href: string; external: boolean }) {
  return (
    <div id={id} style={{ padding: 16, border: `2px solid ${CARD_BORDER}`, borderRadius: 8 }}>
      * <a
        href={href}
        className="hover:underline"
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        style={{ fontSize: 15, fontWeight: 600, color: LINK_COLOR }}
      >{title} {external && "↗︎"}</a>
      <p style={{ margin: "6px 0 0 0", fontSize: 13, color: "#627D98" }}>{description}</p>
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
  gap: 4
};
