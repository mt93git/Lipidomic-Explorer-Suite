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
