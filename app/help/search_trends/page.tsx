// app/help/search_trends/page.tsx
"use client";

const TEXT_COLOR = "#102A43";
const LINK_COLOR = "#5FA8D2";
const CARD_BG = "white";
const CARD_BORDER = "#e5e7eb";

export default function SearchTrendsHelpPage() {
  return (
    <div style={{ padding: 20, background: "#eaf6ff", minHeight: "100vh", color: TEXT_COLOR }}>
      <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 24 }}>

        {/* Header */}
        <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: TEXT_COLOR }}>Search & Trends Guide</h1>
              <p style={{ marginTop: 8, fontSize: 14, color: "#627D98", marginBottom: 0 }}>
                <a href="/help" style={{ color: LINK_COLOR, textDecoration: "none" }}>← Back to Help</a>
              </p>
            </div>
            <a
              href="/"
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
              Go to Search & Trends →
            </a>
          </div>
          <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.7, color: TEXT_COLOR, marginBottom: 0 }}>
            The Search & Trends page is the primary interface for discovering, filtering, and monitoring patent filings. This guide covers all inputs, outputs, and workflows to help you make the most of the search and alert features.
          </p>
        </div>

        {/* Overview */}
        <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Overview</h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR, marginBottom: 12 }}>
            Search & Trends combines three core capabilities:
          </p>
          <ul style={{ marginLeft: 20, marginTop: 12, fontSize: 14, lineHeight: 1.7, listStyleType: "decimal", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li><strong>Hybrid Search</strong>: Find patents using keyword matching, semantic similarity, or both combined;</li>
            <li><strong>Trend Visualization</strong>: Understand filing patterns over time, by technology classification, or by assignee;</li>
            <li><strong>Saved Alerts</strong>: Monitor ongoing activity by saving search criteria and receiving notifications when new patents match.</li>
          </ul>
        </div>

        {/* Search Interface */}
        <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Search Interface & Inputs</h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR, marginBottom: 16 }}>
            The search interface provides multiple input fields to refine your patent search. All inputs are debounced (400ms delay) to prevent excessive API calls as you type.
          </p>

          <div style={{ display: "grid", gap: 20 }}>
            <InputDescription
              label="Semantic Query"
              description="Enter a natural language description of the technology or concept you're interested in. Patent Scout uses OpenAI embeddings to find semantically similar patents, even if they don't contain exact keyword matches."
              example='Example: "autonomous vehicle perception systems using LIDAR and camera fusion"'
              tips={[
                "Be specific and descriptive rather than using single keywords",
                "This field searches against both title+abstract and claims embeddings",
                "Results are ranked by cosine similarity to your query",
                "Can be combined with other filters for hybrid search"
              ]}
            />

            <InputDescription
              label="Keywords"
              description="Enter specific words or phrases that must appear in the patent title, abstract, or claims. This is a traditional keyword-based search using PostgreSQL full-text search."
              example='Example: "neural network", "LIDAR", "convolutional"'
              tips={[
                "Use quotes for exact phrases if your search term is a common word",
                "Multiple keywords are treated as AND conditions",
                "Case-insensitive matching",
                "Combine with semantic query for the most precise results"
              ]}
            />

            <InputDescription
              label="Assignee"
              description="Filter results to patents assigned to a specific company or entity. Partial matching is supported."
              example='Example: "Google", "Microsoft", "Tesla"'
              tips={[
                "Partial matches are supported (e.g., 'Google' matches 'Google LLC', 'Google Inc.')",
                "Use the exact assignee name as it appears in patent records for best results",
                "Case-insensitive matching"
              ]}
            />

            <InputDescription
              label="CPC (Cooperative Patent Classification)"
              description="Filter by CPC code to narrow results to specific technology areas. Supports hierarchical matching."
              example='Example: "G06N" (AI/neural networks), "G06F 17/00" (specific subclass)'
              tips={[
                "Use broader codes (e.g., 'G06N') for wider results",
                "Use specific codes (e.g., 'G06F 17/16') for narrow results",
                "Supports partial matching at any level of the hierarchy",
                "See the USPTO CPC reference for code definitions"
              ]}
            />

            <InputDescription
              label="Date Range (From / To)"
              description="Filter patents and publications by grant/publication date. Both fields are optional. The default range spans the entire corpus (2023–present)."
              example="Example: From 2024-01-01, To 2024-12-31"
              tips={[
                "Dates are based on earliest publication date for applications, grant date for patents",
                "Both fields accept YYYY-MM-DD format via the date picker",
                "Leaving fields blank uses the corpus min/max dates",
                "Date range is displayed in the Trend chart subtitle"
              ]}
            />
          </div>
        </div>

        {/* Control Buttons */}
        <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Action Buttons</h2>

          <div style={{ display: "grid", gap: 20 }}>
            <ActionDescription
              button="Apply"
              description="Manually trigger a search and trend fetch with the current filter state. The search automatically runs when debounced inputs settle, but this button forces an immediate refresh."
              when="Use when you want to force an immediate update or re-fetch after changing non-debounced inputs like date pickers."
            />

            <ActionDescription
              button="Reset"
              description="Clears all search inputs (semantic query, keywords, assignee, CPC, date range) and resets the page to 1. Does not automatically re-run the search; click Apply or wait for debounce to fetch new results."
              when="Use when starting a fresh search from scratch or clearing previous filters."
            />

            <ActionDescription
              button="Save as Alert"
              description="Saves the current search configuration (all filters and semantic query) as a named alert. When new patents matching these criteria are ingested, you'll receive a notification (via email if Mailgun is configured, or console log otherwise)."
              when="Use when you want to monitor a specific technology area, competitor, or search scope over time."
            />
          </div>
        </div>

        {/* Search Results */}
        <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Search Results</h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR, marginBottom: 16 }}>
            Search results are displayed in a paginated list (20 results per page) with detailed metadata for each patent.
          </p>

          <h3 style={{ margin: "20px 0 12px", fontSize: 16, fontWeight: 600, color: TEXT_COLOR }}>Result Fields</h3>
          <div style={{ display: "grid", gap: 12 }}>
            <ResultField field="Title" description="The patent title, displayed prominently with a clickable link to Google Patents." />
            <ResultField field="Patent/Publication No" description="The patent or publication number (e.g., US-2024123456-A1, US-12345678-B2). Clicking opens a link to Google Patents in a new tab." />
            <ResultField field="Assignee" description="The company or entity that is assigned the patent (e.g., 'Google LLC')." />
            <ResultField field="Grant/Publication Date" description="The date the patent was granted or the application was published (formatted as YYYY-MM-DD)." />
            <ResultField field="CPC Codes" description="Cooperative Patent Classification codes assigned to the patent, comma-separated." />
            <ResultField field="Abstract" description="A truncated preview of the patent abstract (up to 420 characters)." />
          </div>

          <h3 style={{ margin: "20px 0 12px", fontSize: 16, fontWeight: 600, color: TEXT_COLOR }}>Pagination</h3>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR, marginBottom: 12 }}>
            Use the Prev and Next buttons to navigate through pages. The current page and total page count are displayed between the buttons. Changing any filter resets pagination to page 1.
          </p>

          <h3 style={{ margin: "20px 0 12px", fontSize: 16, fontWeight: 600, color: TEXT_COLOR }}>Export Options</h3>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR, marginBottom: 12 }}>
            When results are available, two export buttons appear:
          </p>
          <ul style={{ marginLeft: 20, marginTop: 12, fontSize: 14, lineHeight: 1.7, listStyleType: "disc", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li><strong>Download CSV</strong>: Exports up to 1,000 results matching the current filters as a CSV file with columns for title, abstract, assignee, pub_id, pub_date, and CPC codes;</li>
            <li><strong>Download PDF</strong>: Generates an enriched PDF report (powered by ReportLab) with up to 1,000 results, including AI-generated summaries and metadata formatting.</li>
          </ul>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR, marginTop: 12 }}>
            Both exports respect the current filter state, so you can refine your search before downloading.
          </p>
        </div>

        {/* Trend Visualization */}
        <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Trend Visualization</h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR, marginBottom: 16 }}>
            The Trend chart visualizes patent filing patterns based on your current search filters. It updates automatically when filters change and respects all search inputs (keywords, semantic query, assignee, CPC, date range).
          </p>

          <h3 style={{ margin: "20px 0 12px", fontSize: 16, fontWeight: 600, color: TEXT_COLOR }}>Group By Options</h3>
          <div style={{ display: "grid", gap: 12 }}>
            <TrendOption
              mode="Month"
              description="Displays patent/publication count over time, grouped by month. The chart is a line graph with time on the x-axis and count on the y-axis. Indicative of filing spikes, seasonal patterns, or growth trends."
            />
            <TrendOption
              mode="CPC (Section + Class)"
              description="Groups patents by their CPC section and class (e.g., 'G06N', 'H04L'). Displays the top 10 CPC codes by count, with an 'Other' category aggregating the rest. Rendered as a horizontal bar chart. Indicative of the technological areas dominating the search results."
            />
            <TrendOption
              mode="Assignee"
              description="Groups patents by assignee name. Displays the top 15 assignees by count as a horizontal bar chart. Indicative of most relevant entities in a technology space and their movements in different directions (i.e., competitive landscape analysis)."
            />
          </div>

          <h3 style={{ margin: "20px 0 12px", fontSize: 16, fontWeight: 600, color: TEXT_COLOR }}>Interpreting the Chart</h3>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR, marginBottom: 12 }}>
            The trend chart is interactive and updates in real time as you refine your search. Key points:
          </p>
          <ul style={{ marginLeft: 20, marginTop: 12, fontSize: 14, lineHeight: 1.7, listStyleType: "disc", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li>The date range subtitle shows the effective From and To dates (either explicit or corpus min/max);</li>
            <li>If no data is available for the current filters, the chart displays "No data";</li>
            <li>The chart automatically scales axes to fit the data range;</li>
            <li>For CPC and Assignee modes, labels are truncated or rotated for readability.</li>
          </ul>
        </div>

        {/* Alerts Workflow */}
        <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Managing Alerts</h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR, marginBottom: 16 }}>
            Alerts enable specific search criteria to be monitored over time. Weekly emails are sent when the search criteria is met by new patents or publications. This section explains how to create, manage, and use alerts.
          </p>

          <h3 style={{ margin: "20px 0 12px", fontSize: 16, fontWeight: 600, color: TEXT_COLOR }}>Creating an Alert</h3>
          <div style={{ display: "grid", gap: 12 }}>
            <WorkflowStep
              step="1"
              title="Configure Your Search"
              description="Use the search interface to define the filters you want to monitor. This can include semantic queries, keywords, assignee filters, CPC codes, and date ranges. Run the search to verify it returns the results you expect."
            />
            <WorkflowStep
              step="2"
              title="Click 'Save as Alert'"
              description="Once you're satisfied with the search configuration, click the 'Save as Alert' button. You must be authenticated to save alerts."
            />
            <WorkflowStep
              step="3"
              title="Name Your Alert"
              description="A prompt will appear asking you to name the alert. The default name is derived from your search inputs (e.g., the first keyword or assignee), but you can customize it to something meaningful like 'Google AI Patents' or 'Autonomous Driving CPCs'."
            />
            <WorkflowStep
              step="4"
              title="Confirm Save"
              description="Click OK in the prompt. The alert is saved to the database with is_active=true, meaning it will be checked during the next alerts run. A success message appears briefly confirming the save."
            />
          </div>

          <h3 style={{ margin: "20px 0 12px", fontSize: 16, fontWeight: 600, color: TEXT_COLOR }}>Viewing and Managing Alerts</h3>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR, marginBottom: 12 }}>
            Click the "Alerts" button in the top navigation bar to open the alerts modal. This modal displays all your saved alerts with the following information:
          </p>
          <ul style={{ marginLeft: 20, marginTop: 12, fontSize: 14, lineHeight: 1.7, listStyleType: "disc", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li><strong>Alert Name</strong>: The custom name you assigned when creating the alert;</li>
            <li><strong>Filters</strong>: A summary of the search criteria (keywords, assignee, CPC, date range);</li>
            <li><strong>Semantic Query</strong>: If a semantic query was included, it's displayed here;</li>
            <li><strong>Status</strong>: Shows whether the alert is active or inactive;</li>
            <li><strong>Created Date</strong>: When the alert was first saved;</li>
            <li><strong>Last Run</strong>: The timestamp of the last time the alert was checked (if applicable).</li>
          </ul>

          <h3 style={{ margin: "20px 0 12px", fontSize: 16, fontWeight: 600, color: TEXT_COLOR }}>Alert Actions</h3>
          <div style={{ display: "grid", gap: 12 }}>
            <AlertAction
              action="Toggle Active/Inactive"
              description="Click the toggle switch to activate or deactivate an alert. Inactive alerts are not checked during the alerts run. This is useful if you want to pause monitoring without deleting the alert."
            />
            <AlertAction
              action="Delete Alert"
              description="Click the 'Delete' button (usually styled as a red/danger button) to permanently remove the alert from the database. This action cannot be undone."
            />
            <AlertAction
              action="View Results"
              description="Some alert implementations may include a 'View Results' button that reconstructs the original search on the Search & Trends page. This is useful for reviewing what the alert is monitoring."
            />
          </div>

          <h3 style={{ margin: "20px 0 12px", fontSize: 16, fontWeight: 600, color: TEXT_COLOR }}>How Alerts Are Triggered</h3>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR, marginBottom: 12 }}>
            The alerts system runs via the <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4, fontSize: 13 }}>alerts_runner.py</code> script, which is typically scheduled via cron or another scheduler. When the runner executes:
          </p>
          <ol style={{ marginLeft: 20, marginTop: 12, fontSize: 14, lineHeight: 1.7, listStyleType: "decimal", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li>It fetches all active alerts from the database;</li>
            <li>For each alert, it replays the saved search query against the latest corpus data;</li>
            <li>It compares the results to the last alert event timestamp to identify new patents published since the last run;</li>
            <li>If new matches are found, it sends a notification via Mailgun (or logs to console if Mailgun is not configured) with the patent details;</li>
            <li>It updates the alert event log with the current run timestamp.</li>
          </ol>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR, marginTop: 12 }}>
            This ensures you only receive notifications for truly new filings, not duplicates from previous runs.
          </p>
        </div>

        {/* UI/UX Flow Summary */}
        <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>UI/UX Flow Summary</h2>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR, marginBottom: 16 }}>
            Here's a step-by-step walkthrough of a typical Search & Trends session:
          </p>

          <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
            <FlowStep
              num="1"
              title="Authentication"
              description="Log in via Auth0 using the login button in the navigation bar. The page displays a login overlay if you're not authenticated."
            />
            <FlowStep
              num="2"
              title="Enter Search Criteria"
              description="Fill in one or more of the input fields (semantic query, keywords, assignee, CPC, date range). All inputs are debounced, so the search will trigger automatically 400ms after you stop typing."
            />
            <FlowStep
              num="3"
              title="Review Results"
              description="The Results section populates with up to 20 patents per page. Click on a publication ID to view the full patent on Google Patents. Use Prev/Next to paginate through results."
            />
            <FlowStep
              num="4"
              title="Analyze Trends"
              description="The Trend chart updates automatically to reflect your filters. Use the 'Group by' dropdown to switch between Month, CPC, and Assignee views. Observe filing patterns, spikes, or dominant players."
            />
            <FlowStep
              num="5"
              title="Export Data"
              description="If you want to save results for offline analysis, click 'Download CSV' or 'Download PDF'. The export includes up to 1,000 results matching your current filters."
            />
            <FlowStep
              num="6"
              title="Save as Alert (Optional)"
              description="If this is a search you want to monitor over time, click 'Save as Alert', name the alert, and confirm. The alert will be checked during the next scheduled alerts run."
            />
            <FlowStep
              num="7"
              title="Refine or Reset"
              description="Click 'Reset' to clear all filters and start a new search, or refine your inputs and click 'Apply' to re-run the search immediately."
            />
          </div>
        </div>

        {/* Best Practices */}
        <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Best Practices</h2>

          <div style={{ display: "grid", gap: 16 }}>
            <BestPractice
              title="Combine Semantic and Keyword Search"
              tip="For the most precise results, use both a semantic query (to capture conceptually similar patents) and keywords (to ensure specific terms are present). This hybrid approach leverages the strengths of both methods."
            />
            <BestPractice
              title="Use Broad CPC Codes for Exploration"
              tip="If you're exploring a new technology area, start with a broad CPC code (e.g., 'G06N' for AI) and refine based on the trend chart. This helps you understand the landscape before narrowing down."
            />
            <BestPractice
              title="Monitor Competitors with Assignee Filters"
              tip="Create alerts for specific assignees (e.g., 'Google', 'Microsoft') to stay informed about their latest filings in your domain. Combine with CPC or keyword filters to focus on relevant technologies."
            />
            <BestPractice
              title="Review Trend Charts Before Exporting"
              tip="Before exporting large datasets, use the Trend chart to verify the date range and filing volume. This helps you avoid exporting irrelevant or incomplete data."
            />
            <BestPractice
              title="Use Alerts for Ongoing Monitoring, Not One-Time Searches"
              tip="Alerts are designed for continuous monitoring. For one-time prior art searches or landscape analysis, use the search interface directly and export the results instead of creating an alert."
            />
          </div>
        </div>

        {/* Troubleshooting */}
        <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Troubleshooting</h2>

          <div style={{ display: "grid", gap: 16 }}>
            <Troubleshoot
              issue="No results found"
              solution="Try broadening your search by removing filters or using a more general semantic query. Verify that your date range covers filings in the corpus (2023–present). Check that CPC codes are valid and assignee names are spelled correctly."
            />
            <Troubleshoot
              issue="Trend chart shows 'No data'"
              solution="This usually means your filters are too restrictive and no patents match the criteria. Relax filters or check the date range. Ensure at least one filter (semantic, keyword, assignee, or CPC) is active."
            />
            <Troubleshoot
              issue="Alert save fails"
              solution="Ensure you are authenticated (logged in via Auth0). Check that at least one filter is active (an empty alert with no criteria cannot be saved). Verify the alert name is not empty."
            />
            <Troubleshoot
              issue="Export downloads are empty or fail"
              solution="Verify that the current search returns results before exporting. Check your browser's download settings to ensure the file is not being blocked. If the PDF fails, try CSV export as a fallback."
            />
            <Troubleshoot
              issue="Search is slow or times out"
              solution="Very broad semantic queries or large date ranges can be slow. Try narrowing the date range or adding additional filters (assignee, CPC) to reduce the search space. Contact support if timeouts persist."
            />
          </div>
        </div>

        {/* Related Resources */}
        <div style={{ background: CARD_BG, border: `1px solid ${CARD_BORDER}`, borderRadius: 12, padding: 32, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT_COLOR, marginBottom: 16 }}>Related Resources</h2>
          <ul style={{ marginLeft: 20, fontSize: 14, lineHeight: 1.7, listStyleType: "disc", listStylePosition: "outside", color: TEXT_COLOR }}>
            <li><a href="/help/whitespace" style={{ color: LINK_COLOR }}>Whitespace Analysis Guide</a> – Learn how to identify strategic opportunities and risks</li>
            <li><a href="/help" style={{ color: LINK_COLOR }}>Help Home</a> – Return to the main help index</li>
            <li><a href="https://www.uspto.gov/web/patents/classification/cpc/html/cpc.html" target="_blank" rel="noopener noreferrer" style={{ color: LINK_COLOR }}>USPTO CPC Reference</a> – Official CPC code definitions</li>
            <li><a href="/docs" style={{ color: LINK_COLOR }}>Legal Documentation</a> – Terms of Service, Privacy Policy, DPA</li>
          </ul>
        </div>

        {/* Footer */}
        <footer style={{ marginTop: 24, textAlign: "center", color: TEXT_COLOR, fontSize: 12, fontWeight: 500 }}>
          2025 © Phaethon Order LLC | <a href="mailto:support@phaethon.llc" target="_blank" rel="noopener noreferrer" style={{ color: LINK_COLOR }}>support@phaethon.llc</a> | <a href="https://phaethonorder.com" target="_blank" rel="noopener noreferrer" style={{ color: LINK_COLOR }}>phaethonorder.com</a>
        </footer>
      </div>
    </div>
  );
}

function InputDescription({ label, description, example, tips }: { label: string; description: string; example: string; tips: string[] }) {
  return (
    <div style={{ padding: 16, border: `1px solid ${CARD_BORDER}`, borderRadius: 8 }}>
      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT_COLOR }}>{label}</h4>
      <p style={{ margin: "8px 0", fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR }}>{description}</p>
      <p style={{ margin: "8px 0", fontSize: 13, fontStyle: "italic", color: "#627D98" }}>{example}</p>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_COLOR, marginBottom: 6 }}>Tips:</div>
        <ul style={{ marginLeft: 20, fontSize: 13, lineHeight: 1.6, listStyleType: "circle", listStylePosition: "outside", color: TEXT_COLOR }}>
          {tips.map((tip, idx) => <li key={idx}>{tip}</li>)}
        </ul>
      </div>
    </div>
  );
}

function ActionDescription({ button, description, when }: { button: string; description: string; when: string }) {
  return (
    <div>
      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT_COLOR }}>{button}</h4>
      <p style={{ margin: "8px 0", fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR }}>{description}</p>
      <p style={{ margin: "8px 0 0", fontSize: 13, fontStyle: "italic", color: "#627D98" }}>
        <strong>When to use:</strong> {when}
      </p>
    </div>
  );
}

function ResultField({ field, description }: { field: string; description: string }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ fontWeight: 600, fontSize: 14, color: TEXT_COLOR, minWidth: 140 }}>{field}:</span>
      <span style={{ fontSize: 14, color: TEXT_COLOR }}>{description}</span>
    </div>
  );
}

function TrendOption({ mode, description }: { mode: string; description: string }) {
  return (
    <div>
      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT_COLOR }}>{mode}</h4>
      <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR }}>{description}</p>
    </div>
  );
}

function WorkflowStep({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ minWidth: 28, height: 28, borderRadius: "50%", background: LINK_COLOR, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 14 }}>
        {step}
      </div>
      <div style={{ flex: 1 }}>
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT_COLOR }}>{title}</h4>
        <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR }}>{description}</p>
      </div>
    </div>
  );
}

function AlertAction({ action, description }: { action: string; description: string }) {
  return (
    <div>
      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT_COLOR }}>{action}</h4>
      <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR }}>{description}</p>
    </div>
  );
}

function FlowStep({ num, title, description }: { num: string; title: string; description: string }) {
  return (
    <div style={{ padding: 16, border: `1px solid ${CARD_BORDER}`, borderRadius: 8, background: "#eaf6ff" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ minWidth: 32, height: 32, borderRadius: "50%", background: TEXT_COLOR, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15 }}>
          {num}
        </div>
        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TEXT_COLOR }}>{title}</h4>
      </div>
      <p style={{ margin: "10px 0 0 44px", fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR }}>{description}</p>
    </div>
  );
}

function BestPractice({ title, tip }: { title: string; tip: string }) {
  return (
    <div style={{ padding: 16, border: `1px solid ${CARD_BORDER}`, borderRadius: 8, background: "#f0fdf4" }}>
      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#166534" }}>{title}</h4>
      <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR }}>{tip}</p>
    </div>
  );
}

function Troubleshoot({ issue, solution }: { issue: string; solution: string }) {
  return (
    <div style={{ padding: 16, border: `1px solid ${CARD_BORDER}`, borderRadius: 8, background: "#fef3c7" }}>
      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#92400e" }}>Issue: {issue}</h4>
      <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.7, color: TEXT_COLOR }}><strong>Solution:</strong> {solution}</p>
    </div>
  );
}
