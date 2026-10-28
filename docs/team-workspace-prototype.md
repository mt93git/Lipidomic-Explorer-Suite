# Team workspace prototype

This optional Team frontend uses an individual login followed by **Data → Review → Canvas**. Classic remains unchanged. The feature is off unless `LIPIDOMIC_TEAM_WORKSPACE=1`; the workspace requires `LIPIDOMIC_PROJECT_LIBRARY=1` and the private project-library endpoints.

## What is implemented

- Individual account sign-in and account-scoped project/checkpoint access through the existing library service. Scientific modules start only after successful authentication. Failed startup closes the session; logout reloads and closes it. Library credentials are excluded from session ZIPs.
- Data: one decision per screen. Choose a checkpoint or upload an abundance matrix, then add metadata or explicitly continue without it.
- Review: sequential screens for labels, experimental units, confirmation, preparation, sample quality and the analysis question. Next waits for server acceptance and authoritative preparation readiness. Additional instructions/settings are expandable. Sample exclusions remain confirmed and reversible.
- Canvas: searchable plot catalog, live PCA/violin/composition and other existing plot outputs, draggable/resizable cards, Arrange, plot titles, axes, font/mark colors for supported Plotly traces, shared palettes, and existing per-plot downloads. Scientific computations use the common backend.
- Finish plot: freezes the reviewed plot into a clean paper-style image. PNG/SVG/PDF export that same snapshot; Edit restores the live plot and its available CSV. Scientific revisions or source errors invalidate old snapshots; layout-only activity does not.
- Existing specialized analysis tools, 3D cell view, session saving and publication export remain accessible from Canvas.
- Companion: Data/Review/Canvas suggestions and navigation, selected-plot interpretation requests, explicit add-plot buttons, chat, and unchanged server-side scientific confirmation controls. AI access remains optional and server-side; local guidance is available without it.

## How to try it

1. Sign in using an account provisioned for the isolated pilot.
2. In Data, select a saved checkpoint and click Resume checkpoint, or upload a new abundance matrix and metadata.
3. In Review, confirm the study design, inspect preparation settings, click Prepare data, and review sample quality. Do not remove a sample solely because it looks distant in PCA.
4. Open Canvas, add Principal component analysis and Violin plots, move/resize cards, and open Plot appearance. Use Arrange to organize the cards. Collapse Plot library to use the full work area, then select Finish plot. Select Edit to reopen it.
5. Export each figure with its PNG/SVG/PDF/JPG controls or download its source CSV where available. Use Save & export for the existing publication/session tools.
6. Click the companion to ask a question. Proposed scientific changes still require a separate review and confirmation.

## Explicit prototype limits

- Canvas card layout, frozen snapshots and local appearance edits are session-local; they are not yet included in project checkpoints or ZIPs. A warning is shown in the canvas.
- Whole-canvas composite SVG/PDF export is not implemented; exports are per plot, with the pre-existing Publication Export Studio available separately.
- Some dynamically regenerated outputs open their original analysis instead of being portaled, to prevent duplicated Shiny IDs and stale exports. Some plots need their analysis configured first.
- This is not a general vector editor. Appearance support depends on the plot type; advanced scientific controls stay in their analysis tools.
- The isolated runtime is bound to RTX loopback and reached through a development SSH tunnel. This is not a new public deployment. Real team account enrollment/email setup and a physical-phone test remain separate work.
- In single-process Shiny, initialization/computation can delay another session. Load testing and a production authentication/upload gateway are required before public rollout. The built-in Shiny upload endpoint is not an authorization gateway; library storage access is token/RLS protected.

## Verification

Focused browser fixtures: `test_team_workspace_shell.cjs`, `test_team_canvas.cjs`, `test_team_companion_workspace.cjs`, `test_team_canvas_real_plotly.cjs`, and `test_team_companion_collision.cjs`. Server boundary and failure lifecycle: `test_team_workspace_auth.R`. Common numerical parity and regression: `tests/dual-ui/run_acceptance.R`.

The evidence bundle contains real-browser screenshots, an actual PCA SVG, acceptance logs and Opus review findings with their disposition. Do not interpret fixture passes as visual verification of every analysis tool.

## Progressive workflow verification

The final R acceptance run passed 62 jobs. A real 352-lipid/42-sample checkpoint exposed a cached frozen-input error after restore; a Team-only restoration dependency fixes it, with failure-before/pass-after evidence and unchanged Classic/Team numerical parity. Four focused browser suites cover navigation acknowledgments, pending scientific changes, microstep nudges, live plot portability, snapshots, export races and errors. Actual browser downloads were inspected for SVG/PNG/PDF and 42-row CSV; physical-phone testing remains deferred.

Opus 5.5 reviewed design and selected code excerpts through Fabric. Its final export review is a scoped static review, not an independent end-to-end certification.

The final mobile collision fixture executes the actual companion placement code at 390 × 844, checking initial placement, speech bubbles and scroll-time avoidance of the Team journey text. Desktop and legacy selectors retain their existing behavior.
