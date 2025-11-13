// app/help/scope-analysis/page.tsx
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

export default function ScopeAnalysisHelpPage() {
  return (
    <div style={pageWrapperStyle}>
      <div className="glass-surface" style={surfaceStyle}>

        {/* Header */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: TEXT_COLOR }}>Scope Analysis Guide</h1>
              <p style={{ marginTop: 8, fontSize: 14, color: "#627D98", marginBottom: 0 }}>
                <a href="/help" style={{ color: LINK_COLOR, textDecoration: "none" }}>← Back to Help</a>
              </p>
            </div>
            <a
              href="/scope-analysis"
              className="btn-modern"
              style={linkButtonStyle}
            >
              Go to Scope Analysis →
            </a>
          </div>
          <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 0 }}>
            The Scope Analysis page moves SynapseIP beyond patent search and into rapid freedom-to-operate (FTO) and infringement-risk screening. Paste a description of your product feature, invention disclosure, or draft claims and SynapseIP will semantically compare it against independent claims across the entire corpus, returning the closest matches with context-rich diagnostics.
          </p>
        </div>

        {/* Overview */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Why use Scope Analysis?</h2>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 12 }}>
            Traditional search tools focus on matching titles or abstracts. Scope Analysis dives into claim language, which ultimately determines infringement exposure. Each independent claim in the SynapseIP database is embedded and indexed, letting you:
          </p>
          <ul style={{ marginLeft: 20, marginTop: 12, fontSize: 14, lineHeight: 1.5, listStyleType: "disc", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li>Surface patents whose claim scope is semantically closest to your description;</li>
            <li>Quantify proximity using cosine distance and similarity percentage;</li>
            <li>Visualize whether risk is concentrated in one assignee or dispersed across multiple entities;</li>
            <li>Quickly read the actual claim text without leaving the page, while keeping a direct link to Google Patents one click away.</li>
          </ul>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginTop: 12 }}>
            This workflow dramatically shortens the path between an idea and a data-backed infringement assessment, making it ideal for internal diligence before commissioning formal legal opinions.
          </p>
        </div>

        {/* How it works */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>How Scope Analysis works</h2>
          <ol style={{ marginLeft: 20, marginTop: 12, fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR }}>
            <li><strong>User input</strong>: Provide up to ~20k characters describing the feature or claim set you want to clear. The richer the technical detail, the better the embedding quality.</li>
            <li><strong>Embedding generation</strong>: SynapseIP generates an OpenAI embedding for the submitted text (no data is stored beyond what is required to fulfill the request).</li>
            <li><strong>KNN search</strong>: The embedding is compared against the <em>patent_claim_embeddings</em> table, which stores vectors for every independent claim in the corpus. Only the closest matches (top-k configurable) are returned.</li>
            <li><strong>Visualization + evidence</strong>: Results populate both the similarity map and the evidence table so you can bounce between macro and micro views without rerunning the analysis.</li>
          </ol>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: "#627D98", marginTop: 12 }}>
            Tip: start with 10–20 closest claims for rapid assessments, then increase the <strong># of claim comparisons</strong> input to broaden coverage.
          </p>
        </div>

        {/* Workflow */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Recommended workflow</h2>
          <div style={{ display: "grid", gap: 18 }}>
            <InfoBlock
              title="1. Prepare your description"
              description="Collect a concise paragraph or two that captures the inventive concept or product capability. Include nouns/verbs tied to technical components so the embedding has enough signal."
            />
            <InfoBlock
              title="2. Choose the sampling depth"
              description="Use the '# of claim comparisons' input to define how many independent claims you want returned. 15 is a good starting point; expanding to 30–40 helps when validating a near miss."
            />
            <InfoBlock
              title="3. Run the analysis"
              description="Click 'Run scope analysis'. Authenticated users trigger an embedding + KNN pass, resulting in similarity scores, graph positioning, and risk tiles tailored to that query."
            />
            <InfoBlock
              title="4. Inspect the graph"
              description="Hover nodes to preview claim snippets, click to highlight a specific patent, and observe whether overlaps cluster around one entity or span multiple assignees."
            />
            <InfoBlock
              title="5. Review supporting claims"
              description="In the table, click any claim cell to expand the full text. Publication numbers link to Google Patents for downloading PDFs or reviewing prosecution histories."
            />
            <InfoBlock
              title="6. Capture learnings"
              description="Record high-similarity cases in your diligence tracker, flag patents for attorney review, or rerun the tool with an alternative product configuration to test design-around ideas."
            />
          </div>
        </div>

        {/* Visualization details */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Interpreting the graph & table</h2>
          <div style={{ display: "grid", gap: 14 }}>
            <DetailItem title="Radial layout" description="The input text sits in the center. Nodes closer to the center represent higher similarity (lower cosine distance). The updated radius scaling exaggerates separation so critical risks pop immediately." />
            <DetailItem title="Tooltip previews" description="Hover any node to see the patent title and first 200 characters of the matched claim. Tooltips appear above the node to avoid hiding the data point." />
            <DetailItem title="Selection sync" description="Clicking a node or claim row highlights both views, ensuring the graph, summary tiles, and claim text stay in lockstep." />
            <DetailItem title="Similarity column" description="Percent values are derived from 1 − distance. Scores ≥ 70% often warrant immediate counsel review; 55–69% indicates moderate overlap; &lt;50% is generally lower risk but still worth logging." />
            <DetailItem title="Expandable claim text" description="Click the claim snippet to read the entire independent claim inline. Use this to copy relevant language into risk memos or ask engineering teams to evaluate potential design-arounds." />
          </div>
        </div>

        {/* Tips */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Tips & troubleshooting</h2>
          <ul style={{ marginLeft: 20, marginTop: 12, fontSize: 14, lineHeight: 1.6, color: TEXT_COLOR }}>
            <li><strong>Not enough matches?</strong> Increase the <em># of claim comparisons</em> slider or broaden the description with additional functional detail.</li>
            <li><strong>Mixed technology stack?</strong> Run separate analyses for each subsystem (e.g., hardware vs. software) to isolate where overlap risk concentrates.</li>
            <li><strong>Need attribution?</strong> Use the table's assignee column to see which entities own the closest claims, then prioritize outreach or monitoring accordingly.</li>
            <li><strong>Want to preserve evidence?</strong> Capture screenshots or export the table via copy/paste. A formal export workflow is on the roadmap.</li>
            <li><strong>Still unsure?</strong> Email <a href="mailto:support@phaethon.llc" style={{ color: LINK_COLOR }}>support@phaethon.llc</a> with the query context (no confidential data required) and we can help interpret the output.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT_COLOR, marginBottom: 6 }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR }}>{description}</p>
    </div>
  );
}

function DetailItem({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR }}>
        <strong>{title}.</strong> {description}
      </p>
    </div>
  );
}
