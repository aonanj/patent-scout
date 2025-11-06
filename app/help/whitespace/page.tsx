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
            <a
              href="/whitespace"
              className="btn-modern"
              style={linkButtonStyle}
            >
              Go to Whitespace →
            </a>
          </div>
          <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 0 }}>
            The Whitespace Analysis page helps you identify strategic opportunities and competitive risks by analyzing the semantic relationships between patents and publications. This guide covers all inputs, signals, graph interpretation, and advanced options.
          </p>
        </div>

        {/* Overview */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>What is Whitespace Analysis?</h2>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 12 }}>
            Whitespace analysis uses graph-based algorithms to reveal the AI/ML IP landscape around a focus area defined by keywords and/or CPC codes. The system:
          </p>
          <ol style={{ marginLeft: 20, marginTop: 12, fontSize: 14, lineHeight: 1.5, listStyleType: "decimal", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li>Identifies patents and publications matching the focus criteria;</li>
            <li>Computes cosine similarity between patents and publications using AI embeddings to build a K-nearest-neighbor graph;</li>
            <li>Applies Leiden clustering to group semantically similar patents and publications into communities;</li>
            <li>Scores each patent and publication for whitespace intensity using UMAP-based dimensionality reduction and local density measures;</li>
            <li>Evaluates four signal types (convergence, emerging gaps, crowd-out, bridges) for each assignee based on graph topology and temporal patterns;</li>
            <li>Displays confidence-scored signals, an interactive graph visualization, and example patents and publications for each signal.</li>
          </ol>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginTop: 12 }}>
            The result is a comprehensive view of where competitors are investing, where gaps exist, and where strategic opportunities or risks lie.
          </p>
        </div>

        {/* Input Fields */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Input Fields</h2>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 16 }}>
            The Whitespace page provides a focused set of inputs to define the analysis scope. All inputs are optional, but at least one focus criterion (keywords or CPC) is necessary to obtain results.
          </p>

          <div style={{ display: "grid", gap: 20 }}>
            <InputDescription
              label="Focus Keywords"
              description="Enter one or more keywords (comma-separated) that define the technology area you want to analyze. The system will identify patents and publications containing these keywords in the title, abstract, or claims, then build a graph around them."
              example='Example: "LIDAR, perception, autonomous driving"'
              tips={[
                "Use multiple related keywords to capture a broader focus area",
                "Keywords are case-insensitive and support partial matching",
                "Combine with Focus CPC for more precise scoping"
              ]}
            />

            <InputDescription
              label="Focus CPC (LIKE)"
              description="Enter one or more CPC code patterns (comma-separated) using SQL LIKE syntax. This allows hierarchical matching (e.g., 'G06N%' matches all neural network patents and applications)."
              example='Example: "G06N%, H04L%"'
              tips={[
                "Use '%' as a wildcard to match any characters (e.g., 'G06N%' matches G06N3, G06N10, etc.)",
                "Multiple CPC patterns are OR-combined (any match qualifies)",
                "Combine with Focus Keywords to intersect technology areas"
              ]}
            />

            <InputDescription
              label="Date Range (From / To)"
              description="Filter the analysis to patents granted and applications published within a specific date range. This is useful for analyzing recent activity or temporal trends."
              example="Example: From 2024-01-01, To 2024-12-31"
              tips={[
                "Both fields are optional; omitting them uses the entire available date range",
                "The date range affects both the initial focus set and the neighbor graph",
                "Narrower date ranges reduce graph size and improve performance"
              ]}
            />
          </div>
        </div>

        {/* Advanced Options */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Advanced Options</h2>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 16 }}>
            Click "Show advanced settings" to access tuning parameters that control graph construction, clustering, and signal scoring. These are intended for power users who want fine-grained control over the analysis.
          </p>

          <div style={{ display: "grid", gap: 20 }}>
            <AdvancedOption
              param="Sample Limit"
              defaultValue="1000"
              description="Maximum number of patents and publications to include in the analysis. Higher values provide more comprehensive results but increase computation time."
              guidance="Start with 1000 for most analyses. Increase to 2000–5000 if the focus area is very broad and you want deeper coverage."
            />

            <AdvancedOption
              param="Neighbors (K)"
              defaultValue="15"
              description="Number of nearest neighbors to connect for each patent in the K-NN graph. Higher K creates denser graphs with more connections."
              guidance="15 is a good default for balanced graphs. Increase to 20–30 for very sparse domains; decrease to 8–12 for dense, well-connected areas."
            />

            <AdvancedOption
              param="Resolution"
              defaultValue="0.5"
              description="Leiden clustering resolution parameter. Higher values produce more granular clusters; lower values produce fewer, larger clusters."
              guidance="0.5 is a balanced default. Increase to 0.8–1.2 for fine-grained clustering; decrease to 0.2–0.4 for coarse groupings."
            />

            <AdvancedOption
              param="Alpha (distance weight)"
              defaultValue="0.8"
              description="Weight for geometric distance in whitespace scoring. Higher values emphasize isolation in the embedding space; lower values reduce its influence."
              guidance="0.8 is recommended for most cases. Increase to 1.0 for maximum distance sensitivity; decrease to 0.5–0.6 if you want density to dominate."
            />

            <AdvancedOption
              param="Beta (momentum weight)"
              defaultValue="0.5"
              description="Weight for temporal momentum in whitespace scoring. Higher values increase the penalty applied to clusters that are experiencing recent filing spikes; lower values soften this penalty."
              guidance="0.5 balances spatial sparsity with a moderate momentum penalty. Increase to 0.7–0.9 to aggressively discount hot, fast-filing clusters; decrease to 0.2–0.3 if you want momentum to have minimal effect."
            />

            <AdvancedOption
              param="Compute Layout"
              defaultValue="true (checked)"
              description="When enabled, computes a 2D force-directed layout for the graph visualization. When disabled, uses raw UMAP coordinates (faster but less readable)."
              guidance="Keep enabled for visual clarity. Disable only if performance is a concern or you prefer UMAP-based positioning."
            />

            <AdvancedOption
              param="Debug Mode"
              defaultValue="false (unchecked)"
              description="When enabled, includes detailed debug payloads in the response (graph metrics, signal computation details, assignee-level diagnostics)."
              guidance="Enable only for troubleshooting or when you need to inspect the underlying data. Increases response size significantly."
            />
          </div>
        </div>

        {/* Running Analysis */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Running the Analysis</h2>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 12 }}>
            Click the "Identify signals" button to run the analysis. The button is disabled if you're not authenticated. The analysis typically takes 5–30 seconds depending on the sample size and complexity, but loading time may exceed 50-60 seconds for broad queries, high K values, complex signal patterns, etc.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 12 }}>
            During execution, the button text changes to "Identifying..." and the page displays a loading indicator. Once complete, the page populates with two main sections: Signals and Graph Context. Selecting examples for a signal will highlight those examples in the Graph Context and a table presenting information for each highlighted example will be displayed, with an option to export the table as a PDF.
          </p>
        </div>

        {/* Understanding Signals */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Understanding Signals</h2>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 16 }}>
            Signals are confidence-scored indicators of strategic patterns in the AI/ML IP landscape. Each signal is computed per assignee and includes a status (none/weak/medium/strong), a confidence score (0.00–1.00), a rationale, and a list of example patent and publication numbers.
          </p>

          <h3 style={{ margin: "20px 0 12px", fontSize: 18, fontWeight: 600, color: TEXT_COLOR }}>Signal Types</h3>
          <div style={{ display: "grid", gap: 16 }}>
            <SignalCard
              icon="☼"
              type="Focus Area With Neighbor Underdevelopment"
              tone="opportunity"
              shortName="emerging_gap"
              description="Identifies areas within the focus scope where the assignee has strong presence but neighboring technologies remain underdeveloped. Momentum is treated as a negative factor, so the score is biased higher when adjacent clusters (e.g., technology areas) do not show increasing numbers of patents and publications."
              interpretation="A strong emerging gap signal highlights areas where you could file foundational applications with limited competition and/or less risk of prior art. However, increasing neighbor momentum can reduce the score, indicating greater difficulty in securing patent protection."
              exampleRationale="Microsoft has 8 patents in the focus area with low local density (avg 0.18) and muted neighbor momentum (0.10). Nearby patents and publications remain sparse, suggesting an underdeveloped niche within 'neural network inference optimization'."
            />

            <SignalCard
              icon="⟗"
              type="Neighbor Linking Potential Near Focus Area"
              tone="opportunity"
              shortName="bridge"
              description="Identifies patents and publications that act as bridges between the focus area and other technology clusters. These connectors surface when clusters remain partially separated, but momentum on either side is starting to rise—signalling a narrow window to claim cross-domain coverage before crowding."
              interpretation="A strong bridge signal spotlights patents and publications near technology areas that could serve as foundational IP for multi-domain applications."
              exampleRationale="NVIDIA has 5 patents with high betweenness centrality (avg 0.62) linking 'AI training' and 'edge inference'; combined cluster momentum sits at 0.35, indicating filings on both sides are ramping up but patents and publications bridging between the two areas still remains sparse."
            />

            <SignalCard
              icon="⇉"
              type="Convergence Toward Focus Area"
              tone="risk"
              shortName="focus_shift"
              description="Indicates that an assignee is filing applications/obtaining patent grants increasingly close to the focus area over time. This suggests they are shifting R&D resources toward the technology area underlying the focus."
              interpretation="A strong convergence signal indicates an assignee is actively moving into a technology area. For example, a convergence signal may indicate a competitive threat that may warrant defensive or blocking strategies."
              exampleRationale="Google has filed 12 patents near the focus area with recent filings moving closer to focus keywords 'LIDAR, autonomous driving'. Average distance to focus decreased from 0.45 to 0.22 over the past 6 months."
            />

            <SignalCard
              icon="☁︎"
              type="Sharply Rising Density Near Focus Area"
              tone="risk"
              shortName="crowd_out"
              description="Detects rapid increases in patent filing density around the focus area, indicating a surge of activity from the assignee or competitors. This can signal a crowded or saturated space where differentiation is difficult."
              interpretation="A strong crowd-out signal warns that the focus area is becoming substantially saturated. This indicates a reduced likelihood of successfully obtaining patent protection."
              exampleRationale="Tesla has filed 15 patents and publications near 'autonomous vehicle perception' in the past 3 months. Local density increased from 0.30 to 0.78, indicating a crowding effect."
            />
          </div>

          <h3 style={{ margin: "20px 0 12px", fontSize: 18, fontWeight: 600, color: TEXT_COLOR }}>Signal Confidence Scores</h3>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 12 }}>
            Each signal includes a confidence score (0.00–1.00) that quantifies the strength of evidence supporting the signal. The score is derived from:
          </p>
          <ul style={{ marginLeft: 20, fontSize: 14, lineHeight: 1.5, listStyleType: "disc", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li>Number of patents and publications contributing to the signal;</li>
            <li>Magnitude of the metric being measured (e.g., distance change, density increase);</li>
            <li>Temporal consistency (signals are stronger if the pattern is sustained over time);</li>
            <li>Statistical significance thresholds defined in the signal evaluation logic.</li>
          </ul>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginTop: 12 }}>
            Confidence scores above 0.60 are considered strong; 0.40–0.60 are medium; 0.20–0.40 are weak; below 0.20 are none/negligible.
          </p>

          <h3 style={{ margin: "20px 0 12px", fontSize: 18, fontWeight: 600, color: TEXT_COLOR }}>Signal Status Colors</h3>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 12 }}>
            Signals are color-coded based on their tone (opportunity vs. risk) and status (weak/medium/strong):
          </p>
          <ul style={{ marginLeft: 20, fontSize: 14, lineHeight: 1.5, listStyleType: "disc", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li><strong>Opportunity signals</strong> (emerging gap, bridge): Green backgrounds (light for weak, dark for strong);</li>
            <li><strong>Risk signals</strong> (convergence, crowd-out): Red/orange backgrounds (light for weak, dark for strong);</li>
            <li><strong>None status</strong>: Gray background, indicating insufficient evidence for the signal.</li>
          </ul>
        </div>

        {/* Page Layout */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Page Layout & Workflow</h2>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 16 }}>
            The Whitespace page is organized into several collapsible sections. Navigation of each section is described below:
          </p>

          <div style={{ display: "grid", gap: 16 }}>
            <LayoutSection
              title="1. Input Section (top)"
              description="Contains all input fields (focus keywords, CPC, date range) and the 'Identify signals' button. The advanced settings panel is hidden by default; click 'Show advanced settings' to expand it."
            />

            <LayoutSection
              title="2. Signals Section"
              description="After running the analysis, this section displays signals grouped by assignee. Each assignee has a collapsible accordion that shows/hides their signals. Click the assignee name to toggle. Within each assignee, signals are displayed as cards with a tap-to-expand behavior. Click a signal card to view its rationale and example buttons."
            />

            <LayoutSection
              title="3. Graph Context Section"
              description="Displays an interactive Sigma.js graph visualization of the AI/ML IP landscape. Nodes represent patents and publications; edges connect semantically similar patents and publications. Node size indicates whitespace score (larger = more isolated); node color indicates Leiden cluster membership. Clicking a signal in the Signals section highlights relevant nodes in the graph with a blue outline."
            />

            <LayoutSection
              title="4. Highlighted Examples Section (conditional)"
              description="Appears only when you click 'View Examples (Recent)' or 'View Examples (Related)' on a signal. Displays a table of up to eight example patents and publications sorted by grant/publication date (recent) or whitespace relevance (related). Includes title, patent or publication number ('pub_id') (linked to Google Patents), assignee, date, and abstract. An 'Export PDF' button lets you download the examples as a formatted report."
            />
          </div>

          <h3 style={{ margin: "20px 0 12px", fontSize: 18, fontWeight: 600, color: TEXT_COLOR }}>Typical Workflow</h3>
          <ol style={{ marginLeft: 20, fontSize: 14, lineHeight: 1.5, listStyleType: "decimal", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li>Enter focus keywords and/or CPC codes to define the analysis scope;</li>
            <li>Optionally adjust date range and advanced parameters;</li>
            <li>Click "Identify signals" to load results;</li>
            <li>Review the Signals section to identify opportunities (green) and risks (red);</li>
            <li>Click on a signal to expand its rationale and view example buttons;</li>
            <li>Click "View Examples (Recent)" or "View Examples (Related)" to see example patents and publications in the table below;</li>
            <li>Explore the Graph Context to visually understand cluster structure and node relationships;</li>
            <li>Export example patents and publications as PDF for offline review and reference;</li>
            <li>Refine inputs or advanced parameters and re-run to explore different scenarios.</li>
          </ol>
        </div>

        {/* Graph Context Interpretation */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Graph Context & Interpretation</h2>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 16 }}>
            The graph visualization is a core feature of the Whitespace page. It provides a visual representation of the AI/ML IP landscape, as represented by granted patents and published applications, with nodes positioned using either UMAP coordinates or force-directed layout (if "Compute layout" is enabled).
          </p>

          <h3 style={{ margin: "20px 0 12px", fontSize: 18, fontWeight: 600, color: TEXT_COLOR }}>What the Graph Represents</h3>
          <ul style={{ marginLeft: 20, fontSize: 14, lineHeight: 1.5, listStyleType: "disc", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li><strong>Nodes</strong>: Each node represents a patent or publication in the analysis sample. Hover over a node to see its title and patent/publication number (if tooltips are supported);</li>
            <li><strong>Edges</strong>: Edges connect patents and publications that are among each other's K-nearest neighbors in the embedding space. More edges indicate tighter semantic clustering;</li>
            <li><strong>Node Size</strong>: Larger nodes have higher whitespace scores, meaning they are more isolated or occupy less crowded areas of the landscape;</li>
            <li><strong>Whitespace Score (Distance Score)</strong>: Quantified value corresponding to node size. Shown in the node detail sidebar when you click a filing. Function of distance to focus input(s), local neighborhood density, and cluster momentum (via the ⍺ and β weights) to quantify residual whitespace. Higher values mark patents and publications that sit close to focus input(s) while remaining in sparse, slow-moving regions of the graph; lower values either correspond to exact matches to focus input(s) (score is forced to zero so exact matches do not obscure adjacent, under-explored areas) or to patents and publications in dense neighborhoods and/or belonging to fast-moving clusters where momentum suggests crowding is imminent;</li>
            <li><strong>Node Color</strong>: Colors correspond to Leiden cluster membership. Patents and publications in the same cluster are semantically similar and likely cover related technologies;</li>
            <li><strong>Highlighted Nodes</strong>: When you view examples for a signal, the corresponding nodes are highlighted with a blue outline and slightly increased size. This helps you locate the patents and publications contributing to the signal.</li>
          </ul>

          <h3 style={{ margin: "20px 0 12px", fontSize: 18, fontWeight: 600, color: TEXT_COLOR }}>Reading the Graph</h3>
          <div style={{ display: "grid", gap: 12 }}>
            <GraphInterpretation
              pattern="Dense clusters"
              meaning="Indicate heavily patented and/or well-explored technology areas. These are typically mature domains with many competitors."
            />
            <GraphInterpretation
              pattern="Sparse regions with large nodes"
              meaning="Represent whitespace opportunities—areas where few patents and publications exist; patents and publications in this space are isolated. Potential to be first mover, establish strong IP protection, etc."
            />
            <GraphInterpretation
              pattern="Bridge nodes (high degree)"
              meaning="Nodes with many connections (hubs) that link different clusters. These may be valuable for cross-domain innovation."
            />
            <GraphInterpretation
              pattern="Isolated nodes far from clusters"
              meaning="May represent niche innovations or outliers that don't fit existing categories. For example, isolated and unconnected nodes may be directed to early-stage technologies. However, such nodes may also be anomalous data, such as misclassified patents or foreign translations that use inaccurate or highly irregular language."
            />
          </div>

          <h3 style={{ margin: "20px 0 12px", fontSize: 18, fontWeight: 600, color: TEXT_COLOR }}>Interacting with the Graph</h3>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 12 }}>
            The graph is powered by Sigma.js and supports the following interactions:
          </p>
          <ul style={{ marginLeft: 20, fontSize: 14, lineHeight: 1.5, listStyleType: "disc", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li><strong>Pan</strong>: Click and drag the background to move the graph;</li>
            <li><strong>Zoom</strong>: Scroll or pinch to zoom in/out;</li>
            <li><strong>Hover</strong>: Hover over nodes to see tooltips with patent metadata (if enabled);</li>
            <li><strong>Click</strong>: Clicking nodes does not trigger actions by default, but highlighted nodes (from signal examples) are visually distinct.</li>
          </ul>
        </div>

        {/* Highlighted Examples Table */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Highlighted Examples Table</h2>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 16 }}>
            When you click "View Examples (Recent)" or "View Examples (Related)" on a signal, the page displays a table of up to 8 example patents and publications. These are the patents and publications that contribute most strongly to the signal.
          </p>

          <h3 style={{ margin: "20px 0 12px", fontSize: 18, fontWeight: 600, color: TEXT_COLOR }}>Sorting Modes</h3>
          <div style={{ display: "grid", gap: 12 }}>
            <SortMode
              mode="Recent"
              description="Sorts example patents/publications by grant date/publication date (most recent first). Useful for understanding current activity and recent trends."
            />
            <SortMode
              mode="Related"
              description="Sorts by whitespace score and local density (highest first). Useful for identifying the most strategically relevant patents and publications (e.g., those in isolated or low-density regions)."
            />
          </div>

          <h3 style={{ margin: "20px 0 12px", fontSize: 18, fontWeight: 600, color: TEXT_COLOR }}>Table Columns</h3>
          <div style={{ display: "grid", gap: 12 }}>
            <TableColumn column="#" description="Sequential index (1–8)." />
            <TableColumn column="Title" description="Patent or publication title." />
            <TableColumn column="Patent/Pub No" description="Patent or publication number, linked to Google Patents." />
            <TableColumn column="Assignee" description="The entity to whom the patent or publication is assigned." />
            <TableColumn column="Grant/Pub Date" description="The date the patent was granted or application was published (YYYY-MM-DD format)." />
            <TableColumn column="Abstract" description="A truncated abstract (up to 280 characters) providing context about the patent or publication." />
          </div>

          <h3 style={{ margin: "20px 0 12px", fontSize: 18, fontWeight: 600, color: TEXT_COLOR }}>Exporting Examples</h3>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginBottom: 12 }}>
            Click the "Export PDF" button above the table to generate a formatted PDF report containing:
          </p>
          <ul style={{ marginLeft: 20, fontSize: 14, lineHeight: 1.5, listStyleType: "disc", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li>Signal metadata (assignee, signal type, confidence, sort mode);</li>
            <li>Focus scope (keywords, CPC, date range);</li>
            <li>Full details for each example patent and publication (title, patent/pub no. (pub_id), assignee, date, abstract, and any signal-specific notes).</li>
          </ul>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR, marginTop: 12 }}>
            The PDF is generated client-side using a minimal PDF builder and downloads immediately. File names are auto-generated based on assignee name and signal type (e.g., <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4, fontSize: 13 }}>Google_focus_shift_recent_examples.pdf</code>).
          </p>
        </div>

        {/* Best Practices */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Best Practices</h2>

          <div style={{ display: "grid", gap: 16 }}>
            <BestPractice
              title="Define a Specific Focus Area"
              tip="Generally, analysis is most informative and accurate when specific focus keywords and/or CPC codes are used to define a well-scoped area. Overly broad queries (e.g., just 'AI') introduce too much noise, diluting signals."
            />
            <BestPractice
              title="Prioritize Strong Signals"
              tip="Focus on signals with confidence scores above 0.60 (strong status). Weak signals (0.20–0.40) can be noisy and may not represent actionable trends."
            />
            <BestPractice
              title="Use the Graph to Validate Signals"
              tip="After identifying a signal, review the graph to visually confirm the pattern. For example, convergence signals should show nodes moving closer to the focus area; gap signals should show sparse regions."
            />
            <BestPractice
              title="Compare Recent vs. Related Examples"
              tip="View both 'Recent' and 'Related' examples for important signals. Recent examples show current activity; Related examples highlight the most strategically relevant patents and publications (high whitespace scores)."
            />
            <BestPractice
              title="Adjust Advanced Parameters Incrementally"
              tip="If results are unclear or signals are weak, adjust one parameter at a time (e.g., increase neighbors from 15 to 20) and re-run. Avoid changing multiple parameters simultaneously, as this makes it hard to isolate the effect."
            />
            <BestPractice
              title="Use Date Ranges for Temporal Analysis"
              tip="Run the analysis with different date ranges (e.g., 2023 vs. 2024) to understand how the landscape is evolving. Compare convergence and crowd-out signals across time periods to identify accelerating trends."
            />
            <BestPractice
              title="Export PDFs of Example Patents and Publications"
              tip="For later research and reference, export PDFs that include lists of the patents and publications contributing most significantly to the corresponding key signals. Easier to annotate and share than screenshots or raw data."
            />
          </div>
        </div>

        {/* Troubleshooting */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Troubleshooting</h2>

          <div style={{ display: "grid", gap: 16 }}>
            <Troubleshoot
              issue="All signals show 'None' status"
              solution="This usually means the focus area is too broad or lacks sufficient patents and publications to generate meaningful signals. Try narrowing the focus (more specific keywords or CPC codes), reducing the date range, or increasing the sample limit to capture more data."
            />
            <Troubleshoot
              issue="Graph is empty or shows only a few nodes"
              solution="Verify that the focus criteria matches AI/ML-related subject matter (patents and publications in the database are limited to this domain). Check that focus keywords are spelled correctly and CPC codes are valid. Ensure the date range overlaps with available dates (2023–present). If the sample limit is too low, increase it in advanced settings."
            />
            <Troubleshoot
              issue="Graph is cluttered and hard to read"
              solution="Try reducing the number of neighbors (K) in advanced settings to create a sparser graph. Alternatively, enable 'Compute layout' if it's disabled, or use narrower focus criteria to reduce the total node count."
            />
            <Troubleshoot
              issue="Analysis is very slow (>60 seconds)"
              solution="Large sample sizes (>2000) or high neighbor counts (K>25) can slow computation. Reduce the sample limit or K value. Ensure you're using a modern browser with WebGL support for graph rendering."
            />
            <Troubleshoot
              issue="No example patents or publications shown for a signal"
              solution="This means the signal was detected based on aggregate metrics but no individual patents or publications met the threshold for inclusion in the node_ids list. This is rare but can happen with weak signals. Try re-running with adjusted parameters (e.g., lower alpha/beta) or broader focus."
            />
            <Troubleshoot
              issue="PDF export fails or downloads empty file"
              solution="Ensure you've clicked 'View Examples' to populate the table before exporting. Check browser console for JavaScript errors. If the issue persists, try exporting fewer examples (e.g., only recent mode) or contact support."
            />
          </div>
        </div>

        {/* Related Resources */}
        <div className="glass-card" style={{ ...cardBaseStyle }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Related Resources</h2>
          <ul style={{ marginLeft: 20, fontSize: 14, lineHeight: 1.5, listStyleType: "disc", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li><a href="/help/search_trends" style={{ color: LINK_COLOR }}>Search & Trends Guide</a> – Learn how to use hybrid search and alerts</li>
            <li><a href="/help" style={{ color: LINK_COLOR }}>Help Home</a> – Return to the main help index</li>
            <li><a href="https://www.uspto.gov/web/patents/classification/cpc/html/cpc.html" target="_blank" rel="noopener noreferrer" style={{ color: LINK_COLOR }}>USPTO CPC Reference</a> – Official CPC code definitions</li>
            <li><a href="/docs" style={{ color: LINK_COLOR }}>Legal Documentation</a> – Terms of Service, Privacy Policy, DPA</li>
          </ul>
        </div>

      {/* Footer */}
      <footer style={footerStyle}>
        2025 © Phaethon Order LLC | <a href="mailto:support@phaethon.llc" target="_blank" rel="noopener noreferrer" className="text-[#636363] hover:underline hover:text-amber-400">support@phaethon.llc</a> | <a href="https://phaethonorder.com" target="_blank" rel="noopener noreferrer" className="text-[#636363] hover:underline hover:text-amber-400">phaethonorder.com</a> | <a href="/help" className="text-[#636363] hover:underline hover:text-amber-400">Help</a> | <a href="/docs" className="text-[#636363] hover:underline hover:text-amber-400">Legal</a>
      </footer>
      </div>
    </div>
  );
}

function InputDescription({ label, description, example, tips }: { label: string; description: string; example: string; tips: string[] }) {
  return (
    <div style={{ padding: 16, border: `2px solid ${CARD_BORDER}`, borderRadius: 8 }}>
      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT_COLOR }}>{label}</h4>
      <p style={{ margin: "8px 0", fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR }}>{description}</p>
      <p style={{ margin: "8px 0", fontSize: 13, fontStyle: "italic", color: "#627D98" }}>{example}</p>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_COLOR, marginBottom: 6 }}>Tips:</div>
        <ul style={{ marginLeft: 20, fontSize: 13, lineHeight: 1.5, listStyleType: "circle", listStylePosition: "outside", color: TEXT_COLOR }}>
          {tips.map((tip, idx) => <li key={idx}>{tip}</li>)}
        </ul>
      </div>
    </div>
  );
}

function AdvancedOption({ param, defaultValue, description, guidance }: { param: string; defaultValue: string; description: string; guidance: string }) {
  return (
    <div className="glass-card" style={{ padding: 18, borderRadius: 16, background: "rgba(107, 174, 219, 0.12)", border: "1px solid rgba(107, 174, 219, 0.25)", boxShadow: "0 14px 28px rgba(107, 174, 219, 0.18)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT_COLOR }}>{param}</h4>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#627D98", background: "#e2e8f0", padding: "2px 8px", borderRadius: 4 }}>Default: {defaultValue}</span>
      </div>
      <p style={{ margin: "0 0 8px", fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR }}>{description}</p>
      <p style={{ margin: 0, fontSize: 13, fontStyle: "italic", color: "#627D98" }}><strong>Guidance:</strong> {guidance}</p>
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

function SignalCard({ icon, type, tone, shortName, description, interpretation, exampleRationale }: { icon: string; type: string; tone: "opportunity" | "risk"; shortName: string; description: string; interpretation: string; exampleRationale: string }) {
  const bgColor = tone === "opportunity" ? "#f0fdf4" : "#fef2f2";
  const borderColor = tone === "opportunity" ? "#86efac" : "#fca5a5";
  const badgeColor = tone === "opportunity" ? "#166534" : "#7f1d1d";
  const badgeBg = tone === "opportunity" ? "#dcfce7" : "#fee2e2";

  return (
    <div style={{ padding: 20, border: `2px solid ${borderColor}`, borderRadius: 12, background: bgColor }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 24 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT_COLOR }}>{type}</h4>
          <span style={{ fontSize: 11, fontWeight: 600, color: badgeColor, background: badgeBg, padding: "2px 8px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {tone}
          </span>
        </div>
      </div>
      <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR }}><strong>What it means:</strong> {description}</p>
      <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR }}><strong>Interpretation:</strong> {interpretation}</p>
      <div style={{ padding: 12, background: "white", borderRadius: 8, border: `1px solid ${CARD_BORDER}` }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: TEXT_COLOR, marginBottom: 6 }}>Example Rationale:</div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: TEXT_COLOR, fontStyle: "italic" }}>{exampleRationale}</p>
      </div>
    </div>
  );
}

function GraphInterpretation({ pattern, meaning }: { pattern: string; meaning: string }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ fontWeight: 600, fontSize: 14, color: TEXT_COLOR, minWidth: 180 }}>{pattern}:</span>
      <span style={{ fontSize: 14, color: TEXT_COLOR }}>{meaning}</span>
    </div>
  );
}

function SortMode({ mode, description }: { mode: string; description: string }) {
  return (
    <div className="glass-card" style={{ padding: 16, borderRadius: 16, background: "rgba(107, 174, 219, 0.12)", border: "1px solid rgba(107, 174, 219, 0.25)", boxShadow: "0 14px 26px rgba(107, 174, 219, 0.18)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: TEXT_COLOR }}>{mode}</h4>
      <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR }}>{description}</p>
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
      <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.5, color: TEXT_COLOR }}><strong>Solution:</strong> {solution}</p>
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
  color: "#1f2937",
  textAlign: "center",
  fontSize: 13,
  fontWeight: 500,
  gap: 4
};
