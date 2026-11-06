# Team UX shell checks

Headless checks for the Team workspace shell. They need a running Team server
(`LIPIDOMIC_INTERFACE=team LIPIDOMIC_PROJECT_LIBRARY=1`; Team is always the workspace, `LIPIDOMIC_TEAM_WORKSPACE` is no longer read)
whose project library serves the synthetic CI fixture, for example a local stub
library on 127.0.0.1. Never point them at production.

```sh
TEAM_URL=http://127.0.0.1:43262/ TEAM_EMAIL=… TEAM_PASSWORD=… node tests/team-ux/test_shell_geometry.cjs
```

`test_shell_geometry.cjs` asserts at 1280×800, 1440×900 and 1920×1080 that the
top bar, icon rail, library, floating toolbar, minimap, inspector column and the
companion character never overlap, and that the companion's launcher opens its
panel and its canvas action adds a plot.

`test_open_latest.cjs` (same variables) checks that the Data side card's
"Open latest" button prepares Review like a human Resume click.

`test_card_figure.cjs` (same variables) checks that an idle canvas card shows only
its figure, that selecting it moves the module's controls into the inspector's
Data tab where they still work (CSV download, lipid choice), and that releasing
the card returns them.

`test_card_status.cjs` (same variables) checks the per-card status badge in the card
header, the global strip shown only while data changes wait, the collapsed canvas
notice line, and the Export figure warning shown while any card is not up to date.

`test_instance_copy_selection.cjs` (same variables; `TEAM_UX_ITERATIONS`, default 20)
copies the violin plot while its source's server-side lipid selector is cleared
mid-reload and checks that every copy still gets a lipid and a working CSV.

`test_stepper_queue.cjs` (same variables; optional `TEAM_UX_SHOTS` for a
screenshot of the pending state) forces a busy window by holding the server's
busy messages and triggering `shiny:busy`/`shiny:idle`. It checks that a step
clicked (or Enter on the focused step) while busy-locked shows a pending state
and is sent exactly once on idle, that Esc and another step cancel it, and that
a Canvas without prepared data is never queued. The server-rejection path is
covered offline by `tests/dual-ui/test_team_stepper_queue.cjs`.

`test_conditional_park.cjs` (same variables; optional `TEAM_CHECKPOINT`) checks that on
Review and Canvas the conditionalPanels inside hidden (inactive) tab panes are parked so
Shiny's page-wide conditional re-check no longer finds them, that a control changed while
its panel is parked is honoured once restored, that opening a parked tab pane restores it
at once, that leaving Canvas restores every panel with exactly Shiny's own shown state, and
that panels left live (Canvas card copies; on Review, which has no conditionalPanel of its
own, every panel outside a hidden pane) still follow their checkbox in the same pass.

`test_busy_lipid_scene.cjs` (no server; `SHOTS=<dir>` saves screenshots and frames)
checks the lipid scene of the busy dialog: Team shell only, micelle while preparing and
bilayer once Review is reached, transform/opacity animations only, nothing running while
closed, in error or under reduced motion, 375 px fit, and no open-to-close regression.

`test_sheet_picker.R` (R only, from the repository root) checks the Team Excel sheet picker
server code (`R/frontends/team/sheet_picker.R`): sheet listing, the 50 MB cap, the row cap,
that a chosen sheet reads `identical()` to the same sheet saved alone, and the refusals.
`test_sheet_picker_browser.cjs` runs `www/team/js/sheet_picker.js` in Chromium against
`sheet_picker_harness/app.R` (no Team library needed; `RSCRIPT=` points at Rscript).
