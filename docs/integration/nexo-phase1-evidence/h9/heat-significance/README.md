# Abundance heatmap: "Significant only" says why, as Team; card failure messages stay visible

Card `results_dashboard-plot_heat` ("Abundance heatmap"). Reported by the designer: choosing Show = "Significant only"
when the session does not allow independent inference left what looked like a blank card (Team's 422 message small and
centred in a 1000x1100 card, off screen whenever the header was on screen), and the card's red status sat where a title
tooltip covered it.

## Where the status comes from

Team, read only: `R/results_dashboard.R` `output$heat_significance_status` (a `uiOutput` right under the "Show" radio)
renders `<p class="rd-heat-significance-note" data-allowed="true|false" role="status">text</p>`;
`www/team/js/dashboard_significance.js` disables the "significant" option when `data-allowed="false"`.

API (`R/frontends/api/schema.R`): `api_control_status_outputs` is a control id -> Team status output table
(only `heat_significance -> heat_significance_status`, gating option `significant`, is wired). `api_control_status()` reads
that rendered output from the settled session (`s$mock$getOutput`) and returns its `data-allowed` and text; it never
recomputes the guard or the criterion. `GET .../cards/<id>/schema` adds it to the control:

    {"id": "heat_significance", "type": "radio", ...,
     "status": {"allowed": false, "text": "Significant only is unavailable. <Team's reason>", "option": "significant"}}

When allowed, `text` is Team's "Showing N significant lipids: <criterion>." (or "No lipid in this heatmap passes ..."), or
`null` with All lipids shown (Team renders an empty note). The create and PATCH responses carry no controls (the client
reads controls only from the schema route), so only the schema carries the status.

## What the Inspector and the card show

| Case | Data tab ("Show") | Card |
| --- | --- | --- |
| Not allowed (design not confirmed, or Team's guard says no) | "All lipids" enabled; "Significant only" disabled, `aria-describedby` the note; note under the control (`role=status`, `data-allowed=false`) with Team's "Significant only is unavailable. ..." | the heatmap (All lipids) |
| Allowed, All lipids | both options enabled; no note (Team's note is empty) | the heatmap |
| Allowed, Significant only | both enabled; note "Showing N significant lipids: <criterion>." | the filtered heatmap |
| Stored "significant" while not allowed (checkpoint or guard changed) | value kept: "Significant only" checked and disabled, note says why; nothing is written back | Team's 422 message at the top left of the body, red status "Data & settings" and actions unchanged |

The note refreshes after a design confirmation (`nexo-design-confirmed`) and after analysis settings are applied or undone
(`nexo-analysis-applied`, dispatched by `AnalysisSettings` `accept()`); the Data tab's schema cache is cleared on both.
Choosing an option already re-reads the schema (existing refresh on a control with options).

Card failure messages (every card): `.card .body.message` lays out from the top left of the body (under the header),
not centred, so the message is on screen whenever the header is; wording, Retry and "Data & settings" are unchanged.
Tooltip: the card element no longer carries a native `title` (it showed the card name wherever the pointer was, the
header's status badge included); the title keeps its own `title`, and `.card header .card-title` is only as wide as its
text, so empty header space and the badge carry no title tooltip. Tiers and zoom are unchanged.

Mock: `heat_significance` is Team's radio (All lipids / Significant only); `getCardSchema` adds the status from the mock
design state (an independent design confirmed) or the knob `window.__nexoPrefetchMock.heatSignificance` (null follows
the design; true/false force it); a heat render with Significant only while not allowed fails with Team's 422 message.

## Tests

- R: `tests/dual-ui/test_api_heat_significance.R` on `tests/dual-ui/fixtures/nexo-complete-synthetic.zip` (to be run by
  the coordinator on the RTX; the M1 has no R).
- vitest: `src/ui/forms/controlStatus.test.ts`, `src/cardFailurePlacement.test.ts`.
- browser (mock, Chromium and WebKit): `node tests/dual-ui/test_nexo_heat_significance.cjs`.

Outputs: `red.txt` (before), `green.txt` (after). Screenshots (Chromium, 1440x900):
`chromium-1440-not-allowed.png`, `chromium-1440-allowed-showing.png`, `chromium-1440-card-failure-top.png`.
