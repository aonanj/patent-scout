// app/help/page.tsx
"use client";

const TEXT_COLOR = "#102A43";
const LINK_COLOR = "#5FA8D2";
const CARD_BG = "white";
const CARD_BORDER = "#e5e7eb";

export default function HelpIndexPage() {
  return (
    <div style={{ padding: 20, background: "#f8fafc", minHeight: "100vh", color: TEXT_COLOR }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 24 }}>

        {/* Header */}
        <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: TEXT_COLOR }}>Patent Scout Help</h1>
          <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.7, color: TEXT_COLOR, marginBottom: 0 }}>
            Welcome to Patent Scout, the confidence-first patent intelligence platform for AI R&D teams. This help center will guide you through the features and workflows that power your patent research.
          </p>
        </div>

        {/* Overview */}
        <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>What is Patent Scout?</h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR, marginBottom: 12 }}>
            Patent Scout is an advanced patent analytics platform that combines hybrid semantic search, trend analysis, and whitespace exploration to help teams make informed decisions about patent strategy and R&D investments. The platform is built on a continuously updated corpus of 46,000+ AI-related patents and publications dating back to 2023, powered by pgvector-based semantic search and OpenAI embeddings.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR, marginBottom: 12 }}>
            The service offers two primary experiences:
          </p>
          <ul style={{ marginLeft: 20, marginTop: 12, fontSize: 14, lineHeight: 1.7, listStyleType: "disc", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li><strong>Search & Trends</strong>: Discover patents through hybrid keyword and semantic search, visualize filing trends over time, by CPC code, or by assignee, and set up proactive alerts for new filings that match your criteria;</li>
            <li><strong>Whitespace Analysis</strong>: Identify strategic opportunities and competitive risks through graph-based analysis of patent landscapes, with confidence-scored signals highlighting focus convergence, emerging gaps, crowd-out risks, and bridging opportunities.</li>
          </ul>
        </div>

        {/* Feature Cards Grid */}
        <div style={{ display: "grid", gap: 24 }}>

          {/* Search & Trends Card */}
          <div style={{ background: CARD_BG, border: `2px solid ${LINK_COLOR}`, borderRadius: 12, padding: 32, boxShadow: "0 2px 4px rgba(0,0,0,0.06)", transition: "transform 0.2s" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <div style={{ flex: 1, minWidth: 250 }}>
                <h3 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: TEXT_COLOR }}>Search & Trends</h3>
                <p style={{ marginTop: 8, fontSize: 13, color: "#627D98", marginBottom: 0 }}>
                  Hybrid search, trend visualization, and proactive alerts
                </p>
              </div>
              <a
                href="/help/search_trends"
                style={{
                  display: "inline-block",
                  padding: "10px 24px",
                  background: LINK_COLOR,
                  color: "white",
                  borderRadius: 6,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 14,
                  transition: "background 0.2s"
                }}
                onMouseOver={(e) => e.currentTarget.style.background = "#4A90B5"}
                onMouseOut={(e) => e.currentTarget.style.background = LINK_COLOR}
              >
                View Guide →
              </a>
            </div>

            <p style={{ marginTop: 20, fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR, marginBottom: 16 }}>
              The Search & Trends page is the primary interface for discovering and monitoring patent filings. It combines powerful search capabilities with visual trend analytics to help you understand the patent landscape.
            </p>

            <div style={{ display: "grid", gap: 12 }}>
              <DetailItem icon="⬩" title="Hybrid Search" text="Combine keyword and semantic queries to find relevant patents using both exact matches and AI-powered similarity" />
              <DetailItem icon="⬩" title="Advanced Filters" text="Narrow results by assignee, CPC code, publication date range, and more" />
              <DetailItem icon="⬩" title="Trend Visualization" text="Visualize patent filing trends by month, CPC classification, or assignee to spot patterns and emerging areas" />
              <DetailItem icon="⬩" title="Export Capabilities" text="Download search results as CSV or enriched PDF reports for offline analysis" />
              <DetailItem icon="⬩" title="Saved Alerts" text="Save your search criteria and receive notifications when new patents match your filters" />
            </div>

            <div style={{ marginTop: 20, padding: 16, background: "#f8fafc", borderRadius: 6, border: "1px solid #e5e7eb" }}>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: TEXT_COLOR, margin: 0 }}>
                <strong>Best For</strong>: Ongoing competitive monitoring, prior art searches, technology landscape analysis, and staying current with new filings in your domain.
              </p>
            </div>
          </div>

          {/* Whitespace Analysis Card */}
          <div style={{ background: CARD_BG, border: `2px solid ${LINK_COLOR}`, borderRadius: 12, padding: 32, boxShadow: "0 2px 4px rgba(0,0,0,0.06)", transition: "transform 0.2s" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <div style={{ flex: 1, minWidth: 250 }}>
                <h3 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: TEXT_COLOR }}>Whitespace Analysis</h3>
                <p style={{ marginTop: 8, fontSize: 13, color: "#627D98", marginBottom: 0 }}>
                  Graph-based strategic intelligence with confidence-scored signals
                </p>
              </div>
              <a
                href="/help/whitespace"
                style={{
                  display: "inline-block",
                  padding: "10px 24px",
                  background: LINK_COLOR,
                  color: "white",
                  borderRadius: 6,
                  textDecoration: "none",
                  fontWeight: 600,
                  fontSize: 14,
                  transition: "background 0.2s"
                }}
                onMouseOver={(e) => e.currentTarget.style.background = "#4A90B5"}
                onMouseOut={(e) => e.currentTarget.style.background = LINK_COLOR}
              >
                View Guide →
              </a>
            </div>

            <p style={{ marginTop: 20, fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR, marginBottom: 16 }}>
              The Whitespace page reveals strategic opportunities and competitive risks by analyzing the semantic relationships between patents. Using graph algorithms, clustering, and signal scoring, it identifies where competitors are converging, where gaps exist, and where bridge opportunities might lie.
            </p>

            <div style={{ display: "grid", gap: 12 }}>
              <DetailItem icon="⬩" title="Confidence-Scored Signals" text="Four signal types (convergence, emerging gaps, crowd-out, bridges) with quantitative confidence scores" />
              <DetailItem icon="⬩" title="Interactive Graph Visualization" text="Explore patent relationships through a Sigma.js-powered network graph with clustering and layout" />
              <DetailItem icon="⬩" title="Assignee-Level Intelligence" text="Signals are grouped by assignee to reveal competitor strategies and positioning" />
              <DetailItem icon="⬩" title="Exemplar Patents" text="View concrete examples of patents driving each signal, sorted by recency or relevance" />
              <DetailItem icon="⬩" title="Advanced Tuning" text="Adjust neighbor count, clustering resolution, and scoring weights to refine analysis" />
            </div>

            <div style={{ marginTop: 20, padding: 16, background: "#f8fafc", borderRadius: 6, border: "1px solid #e5e7eb" }}>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: TEXT_COLOR, margin: 0 }}>
                <strong>Best For</strong>: Strategic patent investment decisions, whitespace opportunity identification, competitive threat assessment, and understanding where R&D focus is shifting in your technology area.
              </p>
            </div>
          </div>

        </div>

        {/* Quick Start */}
        <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Quick Start Guide</h2>

          <div style={{ display: "grid", gap: 20 }}>
            <InfoSection
              title="1. Authentication"
              content="Patent Scout uses Auth0 for secure authentication. Log in or sign up using the button in the top navigation bar. All features require authentication to ensure data security and usage tracking."
            />

            <InfoSection
              title="2. Start with Search & Trends"
              content="Begin by exploring the Search & Trends page to familiarize yourself with the patent corpus. Try a semantic query like 'autonomous vehicle perception systems' or use keyword filters to narrow results. Experiment with trend groupings to understand filing patterns."
            />

            <InfoSection
              title="3. Save Important Searches as Alerts"
              content="When you find a search configuration that matters to your work, click 'Save as Alert' to receive notifications when new patents match your criteria. Manage your alerts through the navigation bar modal."
            />

            <InfoSection
              title="4. Explore Whitespace Opportunities"
              content="Navigate to the Whitespace page to analyze strategic positioning. Enter focus keywords or CPC codes that define your technology area, then review the confidence-scored signals to identify opportunities and risks."
            />

            <InfoSection
              title="5. Export and Share Insights"
              content="Use the CSV and PDF export features on Search & Trends, or export exemplar patents from Whitespace signals as PDF reports to share findings with your team."
            />
          </div>
        </div>

        {/* Additional Resources */}
        <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Additional Resources</h2>

          <div style={{ display: "grid", gap: 16 }}>
            <ResourceLink
              title="Understanding CPC Codes"
              description="CPC (Cooperative Patent Classification) codes categorize patents by technology area. Learn more at the USPTO CPC reference."
              href="https://www.uspto.gov/web/patents/classification/cpc/html/cpc.html"
              external={true}
            />

            <ResourceLink
              title="Legal Documentation"
              description="Review our Terms of Service, Privacy Policy, and Data Processing Agreement."
              href="/docs"
              external={false}
            />

            <ResourceLink
              title="API Documentation"
              description="For developers: explore the FastAPI backend documentation and endpoints (requires authentication)."
              href="https://patent-scout.vercel.app/docs"
              external={true}
            />
          </div>
        </div>

        {/* Support */}
        <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Need Help?</h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR, marginBottom: 12 }}>
            If you have questions or encounter issues not covered in this documentation, please contact our support team:
          </p>
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR, margin: 0 }}>
              <strong>Email</strong>: <a href="mailto:support@phaethon.llc" style={{ color: LINK_COLOR }}>support@phaethon.llc</a><br />
              <strong>Subject Line</strong>: Patent Scout Support Request<br />
              <strong>Website</strong>: <a href="https://phaethonorder.com" target="_blank" rel="noopener noreferrer" style={{ color: LINK_COLOR }}>https://phaethonorder.com</a>
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer style={{ marginTop: 24, textAlign: "center", color: TEXT_COLOR, fontSize: 12, fontWeight: 500 }}>
          2025 © Phaethon Order LLC | <a href="mailto:support@phaethon.llc" target="_blank" rel="noopener noreferrer" style={{ color: LINK_COLOR }}>support@phaethon.llc</a> | <a href="https://phaethonorder.com" target="_blank" rel="noopener noreferrer" style={{ color: LINK_COLOR }}>phaethonorder.com</a>
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
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR }}>{content}</p>
    </div>
  );
}

function ResourceLink({ title, description, href, external }: { title: string; description: string; href: string; external: boolean }) {
  return (
    <div style={{ padding: 16, border: `1px solid ${CARD_BORDER}`, borderRadius: 8 }}>
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        style={{ fontSize: 15, fontWeight: 600, color: LINK_COLOR, textDecoration: "none" }}
      >
        {title} {external && "↗"}
      </a>
      <p style={{ margin: "6px 0 0 0", fontSize: 13, color: "#627D98" }}>{description}</p>
    </div>
  );
}
