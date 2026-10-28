# Team workspace prototype

This optional Team frontend uses an individual login followed by **Data → Review → Canvas**. Classic remains unchanged. The feature is off unless `LIPIDOMIC_TEAM_WORKSPACE=1`; the workspace requires `LIPIDOMIC_PROJECT_LIBRARY=1` and the private project-library endpoints.

## What is implemented

- Individual account sign-in and account-scoped project/checkpoint access through the existing library service. Scientific modules start only after successful authentication. Failed startup closes the session; logout reloads and closes it. Library credentials are excluded from session ZIPs.
- Data: one decision per screen. Choose a checkpoint or upload an abundance matrix, then add metadata or explicitly continue without it.
- Review: sequential screens for labels, experimental units, confirmation, preparation, sample quality and the analysis question. Next waits for server acceptance and authoritative preparation readiness. Additional instructions/settings are expandable. Sample exclusions remain confirmed and reversible.
- Canvas: searchable plot catalog, live PCA/violin/composition and other existing plot outputs, draggable/resizable cards, Arrange, plot titles, axes, font/mark colors for supported Plotly traces, shared palettes, and existing per-plot downloads. Scientific computations use the common backend. Layout, appearance edits, and finished figure snapshots are retained in a private checkpoint only when the user explicitly saves through Save & export; there is no autosave.
- Finish plot: captures one prepared result as a clearly labeled archived snapshot. Its PNG/SVG/PDF exports represent that captured figure. A snapshot may not match the current live result after restoring a checkpoint or changing analysis. Edit regenerates the current live plot and its available CSV after the required scientific review and preparation.
- Existing specialized analysis tools, 3D cell view, session saving and publication export remain accessible from Canvas.
- Companion: Data/Review/Canvas suggestions and navigation, selected-plot interpretation requests, explicit add-plot buttons, chat, and unchanged server-side scientific confirmation controls. AI access remains optional and server-side; local guidance is available without it.

## How to try it

1. Sign in using an account provisioned for the isolated pilot.
2. In Data, select a saved checkpoint and click Resume checkpoint, or upload a new abundance matrix and metadata.
3. In Review, confirm the study design, inspect preparation settings, click Prepare data, and review sample quality. Do not remove a sample solely because it looks distant in PCA.
4. Open Canvas, add Principal component analysis and Violin plots, move/resize cards, and open Plot appearance. Use Arrange to organize the cards. Collapse Plot library to use the full work area, then select Finish plot to capture an archived figure.
5. Use Save & export to explicitly save a private checkpoint containing the Canvas layout, appearance edits and finished snapshots. After signing in again, resume that checkpoint from Data. Review the restored design and preparation and click Prepare data before relying on current live plots. Edit regenerates the current plot; the archived snapshot remains a record of the earlier prepared result.
6. Export each finished figure with its PNG/SVG/PDF controls or download the live plot's source CSV in Edit where available. Save & export provides per-figure/session exports; it does not create one composite export of the entire Canvas.
7. Click the companion to ask a question. Proposed scientific changes still require a separate review and confirmation.

## Explicit prototype limits

- Canvas state is not autosaved. It persists across sign-in only through an explicitly saved private checkpoint. A resumed checkpoint's frozen snapshots are archived figures, not current live results; review and Prepare data before relying on live plots.
- Whole-canvas composite SVG/PDF export is not implemented; finished figures and source downloads are per plot, with the pre-existing Publication Export Studio available separately.
- Some dynamically regenerated outputs open their original analysis instead of being portaled, to prevent duplicated Shiny IDs and stale exports. Some plots need their analysis configured first.
- This is not a general vector editor. Appearance support depends on the plot type; advanced scientific controls stay in their analysis tools.
- The isolated runtime is bound to RTX loopback and reached through a development SSH tunnel. This is not a new public deployment. Real team account enrollment/email setup and a physical-phone test remain separate work.
- In single-process Shiny, initialization/computation can delay another session. Load testing and a production authentication/upload gateway are required before public rollout. The built-in Shiny upload endpoint is not an authorization gateway; library storage access is token/RLS protected.

## Verification

Focused browser fixtures: `test_team_workspace_shell.cjs`, `test_team_canvas.cjs`, `test_team_companion_workspace.cjs`, `test_team_canvas_real_plotly.cjs`, and `test_team_companion_collision.cjs`. Server boundary and failure lifecycle: `test_team_workspace_auth.R`. Common numerical parity and regression: `tests/dual-ui/run_acceptance.R`.

The evidence bundle contains real-browser screenshots, an actual PCA SVG, acceptance logs and Opus review findings with their disposition. Do not interpret fixture passes as visual verification of every analysis tool.

## Progressive workflow verification

The earlier progressive-workflow R acceptance run passed 62 jobs. A real 352-lipid/42-sample checkpoint exposed a cached frozen-input error after restore; a Team-only restoration dependency fixes it, with failure-before/pass-after evidence and unchanged Classic/Team numerical parity. Four focused browser suites cover navigation acknowledgments, pending scientific changes, microstep nudges, live plot portability, snapshots, export races and errors. Actual browser downloads were inspected for SVG/PNG/PDF and 42-row CSV; physical-phone testing remains deferred.

Opus 5.5 reviewed design and selected code excerpts through Fabric. Its final export review is a scoped static review, not an independent end-to-end certification.

The final mobile collision fixture executes the actual companion placement code at 390 × 844, checking initial placement, speech bubbles and scroll-time avoidance of the Team journey text. Desktop and legacy selectors retain their existing behavior.

## Canvas checkpoint format

Team workspace checkpoints include an optional `team-canvas-v1.json` sidecar. It stores output identities, labels, positions, sizes, appearance overrides, library visibility and frozen figure images. Common plot controls and named/group palettes continue to use the existing session state. Scientific inputs, confirmation receipts and account tokens are not imported from Canvas. Classic ignores the optional sidecar. Old checkpoints clear the Canvas.

Private saves and ZIP exports wait for the server to validate the latest Canvas state. A rejected snapshot prevents the save instead of silently discarding figures. The private-save request also binds the selected project and checkpoint name. The schema permits up to 40 plots, 24 MiB total Canvas JSON and 4 MiB per encoded snapshot; oversized states receive an explicit error. SVG is validated with `xml2`, rejecting scripts, event handlers, external references and unsafe markup.

Dedicated tests cover Canvas round trips, acknowledgements, concurrent edits, hidden-layout saves, replaced Shiny outputs, malicious snapshots, login-time registration, legacy ZIP compatibility and project-switch races. Real-data browser evidence is kept outside the repository; no participant data or credentials belong in test fixtures.

The Canvas persistence revision passed 65 R acceptance jobs and seven browser fixture suites. The actual private-library round trip used the 352-lipid/42-sample sickle-cell case: edited PCA and violin titles/colors, moved cards, finished PCA, saved a checkpoint, downloaded its ZIP, signed out, signed in and resumed the checkpoint. The restored frozen SVG was byte-identical and the violin CSV retained all 42 measurements byte-for-byte. Palette and appearance controls were restored; Edit reopened the archived PCA against the explicitly prepared result. A real browser deadlock in the save handshake was fixed: the Shiny message handler must return immediately so its acknowledgement can be delivered. Its regression test checks that contract.
