# Nexo spike: shared brief for the implementing agents

Goal for one day: a read-only TypeScript canvas ("Nexo") that opens a Team checkpoint ZIP and draws its
results-dashboard plots from a tiny R API, served on the RTX next to `/team/`. KISS. Anything not listed here
is out of scope (no JWT, no Supabase, no jobs, no React, no editing, no statistics, no export).

## Hard rules

- Never modify `R/modules/**`, `R/server.R`, `R/global.R`, `R/ui.R`, `R/frontends/interface.R`,
  `R/frontends/classic/**`, `R/frontends/team/**`, `www/**`. Classic stays byte-identical.
- New files only under `R/frontends/api/`, `frontends/nexo/`, `tests/dual-ui/test_api_*.R`,
  `tests/dual-ui/test_nexo_*.cjs`, `OS/linux/`, `docs/integration/nexo-spike*`.
- No study data in git. Tests use `tests/dual-ui/fixtures/classic-seed7-synthetic.zip` only.
- TDD: first commit = failing test, second commit = code that makes it pass. Commit on your branch.
  No `git push`, no `gh`, no PR. Report branch, SHA and the literal output of every test.

## API (R, Plumber) — `R/frontends/api/`

The engine is the same headless harness the existing tests already use. Read these before coding:

- ZIP reader: `read_session_archive(path, include_team_canvas = TRUE, metadata_decoder = team_metadata_sidecar_decode)`
  in `R/utils_session_archive.R` (returns `directory`, `state`, `shared`, `canvas`).
- Restore + prepare headlessly: `tests/dual-ui/archive_fixture_helpers.R` (lines ~99-158) runs
  `shiny::testServer(shared_data_server, args = list(external_settings = reactive(settings()), preparation_policy = "team", design_check = function() TRUE), {...})`
  with `session$setInputs(import_session_file = data.frame(name, size, type, datapath))`, several
  `session$flushReact()`, then `selectedColumns` and `runAnalysis`. The ZIP keeps the ORIGINAL matrix; the
  prepared matrix is recomputed. Legacy ZIP without `applied` → `preparation_settings(list(), "team")` and all
  numeric columns. Data files may be `.csv` or `.xlsx`.
- Hub for the dashboard: from `session$returned` take `data_processed_allow_missing`, `all_metadata`,
  `preparation_audit`, `color_maps`, `class_color_map`, `palette_settings`; add
  `preparation_dirty = reactiveVal(FALSE)`, `team_compact_distribution = TRUE`,
  `inference_allowed = function(...) FALSE`. See what Team passes in `R/frontends/team/server.R`.
- Plots: `tests/dual-ui/fixture_team_canvas_dashboard_payload.R` renders `output$plot_<id>` of
  `results_dashboard_module_server` as Plotly JSON inside `testServer`, with the `[[.mockclientdata` width patch.
  One `testServer` per request. Ids: `pca`, `violin`, `dist`, `comp`, `heat`.
  Client defaults: `color_by = "Group1"`, `n_class = 7`, `top_n = 10`, `pca_transform = "log2"`,
  `pca_scale = "uv"`, `violin_lipid = <first lipid>`.

Files:

- `engine.R`: `api_load_session(zip)` → `list(hub, canvas, applied, samples, lipids)`;
  `api_render_plot(hub, output_id, inputs, width = 900)` → parsed Plotly figure (`list(data, layout, ...)`).
  Unknown id → error class `api_bad_request`; module `validate()` failure → error class `api_unprocessable`.
- `plumber.R` endpoints (JSON, `auto_unbox`):
  - `GET /api/v1/health` → `{ok, commit, r, plotly}`
  - `GET /api/v1/checkpoints` → ZIPs in `Sys.getenv("LIPIDOMIC_API_CHECKPOINT_DIR")`: `{id, name, bytes, sha256}`
    (`id` = file name without `.zip`)
  - `POST /api/v1/sessions` `{checkpointId}` → `{sessionId, samples, lipids, preparation, inputs, canvas}`;
    sessions cached in an environment; same checkpoint reuses its hub. `inputs` = the saved dashboard
    inputs from `state.json` (`state$inputs` keys starting with `results_dashboard-`, prefix stripped,
    `plotly_*` event keys dropped), e.g. `color_by`, `pca_transform`, `pca_scale`, `violin_lipid`, `top_n`,
    `n_class`. Fall back to the client defaults when a key is missing.
  - `POST /api/v1/sessions/<id>/plots/results_dashboard/<output>` `{inputs, width}` → `{figure, provenance}`
  - errors: 400 bad output, 404 unknown session or checkpoint, 422 validate message.
- `run.R`:
  ```r
  Sys.setenv(LIPIDOMIC_INTERFACE = "team", LIPIDOMIC_STORAGE = "files", LIPIDOMIC_HOSTED = "1", LIPIDOMIC_TEAM_WORKSPACE = "1")
  Sys.unsetenv(c("LIPIDOMIC_AUTH_URL", "LIPIDOMIC_REST_URL", "LIPIDOMIC_STORAGE_URL", "LIPIDOMIC_COMPANION_ENV"))
  source("R/global.R"); source("R/frontends/api/engine.R")
  plumber::pr_run(plumber::plumb("R/frontends/api/plumber.R"), host = "127.0.0.1",
                  port = as.integer(Sys.getenv("LIPIDOMIC_API_PORT", "3960")))
  ```
  Mirror how `tests/dual-ui/test_cross_zip.R` sources `R/global.R` in team mode. Never call `shinyApp`.

## Nexo v0 (TypeScript) — `frontends/nexo/`

Vite + TypeScript, no framework, no router, no global store. Port `docs/nexo/prototype-reference.html`
(camera, render tiers, selection, minimap, read-only inspector, bottom sheet under 900 px) into `src/`:

- `api.ts` (fetch, base `import.meta.env.VITE_API_BASE ?? '/api/v1'`), `tiers.ts` (pure `tier()`),
  `cards.ts` (live = `Plotly.newPlot(el, figure.data, figure.layout, {displayModeBar:false, responsive:true})`;
  frozen = `<img>` of the checkpoint snapshot or a cached `Plotly.toImage`; culled = empty body),
  `canvas.ts` (camera, selection, inspector: title, tier, inputs), `main.ts`.
- Boot: `?checkpoint=<id>` or a picker from `GET /checkpoints`. Cards come from `canvas.nodes` of
  `team-canvas-v1.json` (validated by `R/frontends/team/canvas_state.R`). Real node shape:
  `{kind: "plot"|"illustration", id, label, x, y, width, height, visual: {plotTitle?}, finished: {url, createdAt,
  stale, provenance} | null, assetId, assetVersion, color, instance?}`. `finished.url` is an SVG data URL
  (tens of KB). Plot ids look like `results_dashboard-plot_pca` / `results_dashboard-plot_violin` (match
  `/results_dashboard-plot_(pca|violin|dist|comp|heat)/`); illustrations have `assetId` such as `lc-ms`.
  Plot nodes render live from the API using the session `inputs`; illustrations always show `finished.url`;
  frozen plots show `finished.url` when present. A small library lists the 5 dashboard plots; clicking one
  adds a live card (this is how the demo shows a heatmap that the checkpoint does not contain).
- `vite.config.ts`: `base: '/nexo/'`. plotly.js is loaded from `public/vendor/plotly.min.js` (copy of the file
  shipped with R plotly 4.12.1: `system.file("htmlwidgets/lib/plotlyjs/plotly-latest.min.js", package = "plotly")`);
  do not add plotly to npm dependencies and do not commit it: `public/vendor/` is gitignored and filled by
  `scripts/vendor-plotly.sh` (copies from `$NEXO_PLOTLY_JS`, else from the R plotly package via Rscript).
  On the M1 the file is staged at `~/nexo-vendor/plotly.min.js`.
- Dev mock: `npm run dev` works with `VITE_API_MOCK=1` against JSON fixtures in `src/mock/`.

## Tests (7 total, Pareto)

| id | file | asserts |
|---|---|---|
| U1 | `tests/dual-ui/test_api_engine.R` | synthetic ZIP → `nrow(data_processed) == 12`, `ncol == 9`; legacy defaults path does not error |
| U2 | same file | 5 ids return `data[[1]]$type` and `layout`; invalid `violin_lipid` → `api_unprocessable` |
| U3 | `frontends/nexo/src/tiers.test.ts` (vitest) | `tier()` → live/frozen/culled in 6 cases |
| I1 | `tests/dual-ui/test_api_http.R` | `callr::r_bg` runs `run.R` on a free port; health 200, sessions 200, pca 200, unknown session 404 |
| I2 | `tests/dual-ui/test_api_parity.R` | API traces (`type,name,x,y`) identical to `fixture_team_canvas_dashboard_payload.R` on the same hub |
| E1 | `tests/dual-ui/test_nexo_canvas_readonly.cjs` | Playwright Chromium+WebKit: cards = nodes, live cards have traces, 25 % zoom → img, offscreen → empty, inspector opens, 0 console errors |
| E2 | manual on the RTX | Paula checkpoint, `/team/` still 200 |

Each test prints `PASS <name>` lines; evidence goes to `docs/integration/nexo-spike-evidence/`.
