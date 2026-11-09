# Nexo Phase 1 — milestone log

Branch `nexo/phase1` = production commit `ebee653` (what the RTX runs as Team) + Nexo. Zero changes under
`R/modules`, `R/server.R`, `R/global.R`, `R/ui.R`, `R/frontends/team`, `R/frontends/classic`, `www`.

## Phase 1 close (2026-11-08)

**Status: closed on synthetic data.** The whole Figure 1 workflow works
end to end in Nexo, and a checkpoint saved by Nexo opens in Team with nothing lost. This is shown on the complete
synthetic checkpoint (`tests/dual-ui/fixtures/nexo-complete-synthetic.zip`), in Chromium and WebKit, against the
real API running production's science. Paula and Steph were not available, so a script played them
(`nexo-pilot-simulation.md`) and a simulated Steph review judged the result (`nexo-steph-review.md`). The phase
therefore closes as "the Figure 1 workflow is complete end to end on synthetic data", not as "Paula's Figure 1 is
done". Deployed on the RTX at `95b2526a`. Close-time evidence: `nexo-phase1-evidence/h9/phase1-close/`; the `h8/…` and `h9/…` paths below are under
`nexo-phase1-evidence/`.

**Close decision (2026-11-09).** Gerardo closed Phase 1 on synthetic data, effective once the server runs the
ported API and the Nexo PRs #18, #19 and #20 (stacked on the Admin PRs #16 and #17) carry it to Max
(`nexo-pr-stack.md`). A confirmation run by Paula and Steph on her own checkpoint is not planned: Paula has no
time for it now, so the synthetic close is the close, and what only real people can judge is listed below as not
covered. Since the 2026-11-08 close the API moved to `frontends/nexo-api/`
(outside Team's `R/` tree, so Max's storage-isolation safeguard passes), passes its R suite on both Team trees
(`nexo-phase1-evidence/max-port/`), and nested guarded calls now share one 120 s request deadline.

### Definition of done, item by item

| The plan asked for | Where it stands | Evidence |
|---|---|---|
| Open a checkpoint prepared in Team | Done; a real 24-card Team checkpoint also reopens with every card drawn (checked by hand on the RTX, not in git) | `h8/restore-saved-cards/` |
| Add any plot of Team's catalog | 58 outputs in the catalog; 57 draw on the complete fixture, the 58th (Composition · donut, filtered) fails in Team too (`ncols` bug in `5_barchart_module.R`, listed for Max) | `h9/phase1-close/render-all-58-rtx.txt` |
| Adjust inputs and style per card | Done (Team's controls from the live schema, plot editor, session palette) | pilot steps 4–5, 4b–4e |
| Violin statistics and group comparison | Done through Team's own servers; p-values identical to Team | `test_api_statistics.R`, pilot step 6 |
| Finish cards, illustrations, tabs, Figure page | Done | pilot steps 7–9 |
| Export at journal size | Done: per-card publication bundle (PDF, SVG, CSV, R script, provenance) and the composed page as PDF and SVG | pilot steps 10, 10b; `h9/pilot-simulation/live/*/` |
| Save, and the checkpoint opens in Team with no differences (and back) | Done: Team round trip all PASS on the checkpoint each engine saved; `test_api_roundtrip.R` both ways | `h9/pilot-simulation/live/*/team-roundtrip.txt` |
| Paula rebuilds Figure 1 without Team's canvas | Simulated: 25/25 steps in Chromium and WebKit, live API | `h9/pilot-simulation/live/` |
| Steph reviews | Simulated review: "yes, with conditions"; its five P2 fixes landed and were verified live | `nexo-steph-review.md`, `nexo-pilot-simulation.md` (Steph's review fixes) |

### End-to-end verification at the close

1. **Science intact.** `git diff --stat ebee653..nexo/phase1 -- R/modules R/server.R R/global.R R/ui.R
   R/frontends/team R/frontends/classic www` is empty. The deployed `/health` reports `commit 95b2526a`,
   `scienceMatchesProduction: true` over 21 science files (`h9/phase1-close/deploy-health-rtx.txt`).
2. **R suites on the production tree (RTX).** 49 `test_api_*.R`: 48 PASS, 1 SKIP (`test_api_render_disk_cache`, whose cache key is the git commit and a `git archive` test tree has none; it passes in a checkout), 0 FAIL. Render-all on the complete fixture: `rendered=57 gated=1 silent=0 failed=0 of 58`, the gated one being the donut above (`h9/phase1-close/r-suite-rtx.txt`).
3. **Frontend.** vitest 133 files / 640 tests pass, `tsc --noEmit` clean; 26 browser suites pass against the mock
   (`h9/phase1-close/browser-suites-mac.txt`).
4. **Pilot, live.** Chromium 25/25, WebKit 25/25; mock 25/25; Team round trip all PASS in both engines.
5. **Performance.** App JS without Plotly 215.7 KB gz (60.3 vendor + 155.4 app; budget 250 KB,
   `h9/phase1-close/bundle-size-mac.txt`); `test_nexo_perf.cjs` budgets pass (zoom step, 40-card draw, live
   Plotly cap); the 24-card live stress is in `h8/stress-final/`.
6. **Production untouched.** Team (:3952) answers 200 with no restarts; `/nexo/` and `/api/` answer 401 without
   credentials.

### Not covered: what only the real people and data can judge

From Steph's review, section 5. None of this can be settled by a simulation, and no session with Paula and Steph is
planned:

- whether these are the right statistics for the study (test, comparison family, pairing);
- that Paula's own checkpoint behaves like the synthetic one through the whole workflow (it opens and draws; the
  full Figure 1 rebuild on it has not been run);
- the real group colours and their colour-blind safety;
- the waits and the canvas organisation as Paula feels them;
- the finished figure at journal size with panels C and D, whose methods are still PENDING in the template;
- a side-by-side comparison of Nexo panels with Team's render of the same real checkpoint.

### Known open items (not blocking the close)

- **Speed:** Selected-feature distributions took about 36 s per card because a create drew Team's violin view three
  times (once per settling round of the card's inputs). Since 2026-11-09 the card's plot output is wanted only after
  the inputs settle, so it is drawn once: create 10.7–11.0 s on the server (median 10.8 s of 3, both Team trees),
  decoded PNG at 620x3000 byte-identical to the old order, `plotHeight` 3000 unchanged (`test_api_violin_speed.R`;
  it needs the `png` package, so the server run used the same test comparing the raw PNG bytes). The remaining
  ~11 s is one draw of Team's module (60 violins with t-tests). Card creation on a heavy checkpoint is 1.3–3.7 s.
- **Team module behaviour, for Max (not changed here):** the donut `ncols` bug; Team's Ocean & Coral and Earth &
  Garden presets give two groups near-identical colours (Nexo now warns); the heatmap shows "30 of 76" beside
  "Showing 60 significant lipids"; three identical "Show Statistic Detail" buttons on the structural summary; a
  pairing variable offered under an independent design; plots that keep their own colours instead of the session
  palette (e.g. the violin).
- **Not reproduced or not built:** clicks in the dashboard and Guided QC side panels; logratio Finish in the mock;
  editable session shapes (Team's palette editor has none); designer decisions N1/N3.
- **Test environment:** `test_nexo_finish` and `layout_sweep` need vis-network vendored (`NEXO_VISNETWORK_DIR`)
  outside the Mac.

### Hand-off

Max receives Nexo as the stacked PRs #18 (API), #19 (canvas and browser suites) and #20 (docs) on
`mt93git/Lipidomic-Explorer-Suite`, on top of the Admin PRs #16 and #17 (`nexo-pr-stack.md`). They add files only;
Nexo runs and passes its R suite on both Team trees (`nexo-phase1-evidence/max-port/`). Team behaviours for Max are
in `nexo-team-bug-proposals.md`. Further Nexo changes for Max go on top of #18 to #20.

After this note, `nexo/phase1` also took the Admin line's shared-identity work (Nexo sends the Admin session token on
dataset opens; `admin-identity.md`). It belongs to Phase 1B, is not part of the close evidence above and was not
deployed with `95b2526a`; with it merged, vitest is 134 files / 655 tests, the dataset R tests and
`test_nexo_dataset.cjs` pass.

## H1 · Engine and catalog (2026-11-06, night)

**Done.** The API no longer runs one `testServer` per request: each checkpoint gets a long-lived headless
Shiny session (`R/frontends/api/session.R`), built on `shiny::MockShinySession` wrapped in a proxy that
captures custom messages and echoes input updates. Per-card module instances are created through Team's own
`team_plot_instances_server` (`cards.R`); the catalog (`catalog.R`) is derived from Team's family registry
and module sources. Routes: health, catalog, checkpoints, sessions (open/get/delete), design, cards
(create/update/delete), render (native JSON or `image/png` bytes), plus the v0 dashboard route on top of
cards.

Three rules that made the live session work (each cost a failed run first): every `setInputs`/flush runs
inside `withReactiveDomain`; flushes and `getOutput()` run with a private `later` loop as the current loop
(the mock drains the current loop, which deadlocks inside an httpuv request); echoed input values are coerced
to the archived JSON type. plumber switches the working directory to the API folder, so a `preroute` hook
restores the app root.

Evidence (`nexo-phase1-evidence/h1/`): `engine-spike-rtx.txt` (feasibility 8/8), `api-tests-rtx.txt`
(session 3, catalog 1, engine 4, parity 5, HTTP 7: all PASS on the RTX production tree),
`render-all-rtx.txt` (`SUMMARY rendered=40 gated=7 silent=11 failed=0 of 58`).

- gated (the module's own validate() message, same text Team shows on the card): qc_pca_tab-pca2dVectorPlot Editable vector view unavailable: smart repelled labels are preserved only in the original view; disable smart labels to edit this view. Switch off Editable vector, qc_pca_tab-load2dVectorPlot Editable vector view unavailable: smart repelled labels are preserved only in the original view; disable smart labels to edit this view. Switch off Editable vecto, barchart-barPlotFiltered No lipids passed filters (Significant & Global Filters)., barchart-donutPlotFiltered No lipids passed filters (Significant & Global Filters)., heatmap_barchart_tab-filteredHeatmapPlot No lipids passed significance filters., heatmap_barchart_tab-filteredHeatmapSDPlot No lipids passed significance filters., structural_tab-summaryPlot No structural shifts detected or insufficient data.
- silent (module waits for an input/action; the H3 inspector exposes them): barchart-barPlotUnfiltered The plot inputs are unavailable for this session., barchart-donutPlotUnfiltered The plot inputs are unavailable for this session., lsea_tab-lseaPlot The plot inputs are unavailable for this session., structural_tab-speciesPlotPlot The plot inputs are unavailable for this session., structural_grid_tab-heatmapPlot The plot inputs are unavailable for this session., structural_grid_tab-dotplotPlot The plot inputs are unavailable for this session., logratio_tab-logratioPlot The plot inputs are unavailable for this session., longitudinal_tab-macroclass_plot The plot inputs are unavailable for this session., longitudinal_tab-subclass_plot The plot inputs are unavailable for this session., longitudinal_tab-index_plot The plot inputs are unavailable for this session., longitudinal_tab-struct_plot The plot inputs are unavailable for this session.

Demo: `/nexo/` on the RTX opens Paula's checkpoint inside the Team-like shell (React: top bar, rail, tabs,
toolbar, status band, zoom pill) with the v0 canvas (minimap, tiers, fluid camera) and the 58-entry catalog;
a QC "Sample correlation" ggplot card renders from the production R code next to the live Plotly cards.
Timings on the RTX: open Paula ≈ 10 s; first dashboard card ≈ 9.7 s (module instantiation), later cards
≈ 2 s; JSON render 40 ms; PNG render 65 ms.

Open for H3: the 11 silent outputs need their inputs/actions from the inspector; `n_class` does not exist in
production's dashboard (dropped from defaults).

## H2 · Editable canvas (in progress, 2026-11-06 early morning)

Landed on the branch (all new files, vitest green, `npx tsc --noEmit` clean, `npm run build` ok):
`src/tokens.css` (one accent, one font), `src/state/{document,tabs,store,commands,history,validate}.ts`
(canvas v1 types with Team's limits, tabs model ported from `canvas_tabs_model.js`, tiny store, command
history with coalescing, validator with Team's error strings), `src/canvas/{snap,settle,tidy,align}.ts`
(pure geometry; settle/tidy constants from Team, snap/align from the prototype), the React shell
(`src/ui/*`: top bar with Team's save-pill strings, rail, tabs bar, toolbar with overflow, status band,
toast, zoom pill mirroring v0's `#zoom`, confirm dialog, `strings.ts`), and the React Plot library wired to
the catalog through a `CanvasHandle` (groups with counts, search, row states, "Confirm study design"
dialog for DE outputs). The v0 canvas (camera, minimap, tiers) is untouched underneath. Playwright E1
(`test_nexo_canvas_readonly.cjs`) passes 12/12 in Chromium and WebKit against the shell.

Editing landed (H2f): geometry lives in the store (`doc.nodes`, canvas v1) and the DOM is a projection;
drag by the header with snap guides (⌥ bypass), settle on drop as one undo step, corner resize, arrows /
Shift+arrows / Alt, Delete, Cmd/Ctrl+D duplicate, undo/redo, Tidy up, Remove all; adding a card no longer
moves the camera. `tests/dual-ui/test_nexo_canvas_edit.cjs` passes 14/14 in Chromium and WebKit on the
mock build; `test_nexo_canvas_readonly.cjs` still 12/12; vitest 63/63.

Tabs landed (H2g): the active tab filters the canvas (hidden cards are culled and excluded from the
minimap and Fit), each tab keeps its camera, Move to tab… / Copy to tab…, duplicate and delete tab (with the
move-or-remove dialog) are undoable, tabs reorder with the pointer, rename on F2/Enter/dblclick, and `tabs`
serialises exactly as Team's `canvas_tabs_model.js` (null when default). `test_nexo_canvas_tabs.cjs` 6/6 in
Chromium and WebKit; vitest 68/68.

Still open in H2: the inspector stays v0's read-only one (H3); group comparison and visNetwork render as
images; the inspector's "Move/Copy to tab" entries live in the card ⋯ only.

## H1 review (hidalgo-lab panel, 2026-11-06 01:25; the integrity reviewer hit its usage limit)

Fixed the same night: HTTP test skips (not fails) without plumber/callr on Max's CI; renderUI-created
inputs are seeded from the rendered markup with Team's `team_plot_instance_doc_defaults()` (the cause of
most "silent" outputs); output sizes keyed per session (v0's fixed instance ids collided across sessions);
one `later` loop per session; the 120 s guard covers setInputs and reads; render width/height capped to
Team's 4000; message bus bounded to 500; closed or evicted sessions answer 409 `session_lost`;
render-all keeps a floor of 40 rendered.

Deferred (P2 before the PR to Max): the generic 422 text for silent req() should name the missing input;
`card$settled`/`error` are not refreshed on update; `actions` should be allow-listed per family; the v0
dashboard route should validate input types. P3: Host/Origin checks (the API binds to 127.0.0.1 behind
nginx basic auth); `showNotification`/`showModal` from Team are dropped in the headless session.

## H3 · Inspector (2026-11-06, morning)

- **H3a (API):** `R/frontends/api/schema.R` turns the markup Team renders for each family (and the dashboard UI)
  into typed controls (select, multiselect, number, range, boolean, checkboxgroup, radio, text, color, tabs,
  action) with labels, options, ranges and defaults, using the same recognition rules as
  `team_plot_instance_doc_defaults()`. `GET /sessions/{id}/cards/{instanceId}/schema` overlays the live values
  and the options renderUI produced from the data (lipid names, metadata columns); catalog entries carry
  the static part. Tests on the RTX: schema 4/4, HTTP 8/8 (`nexo-phase1-evidence/h3/api-schema-rtx.txt`).
- **H3b-1 (React inspector):** header, status line, tabs Data | Appearance | Statistics | Export; Data is a
  `SchemaForm` over the live schema with debounced PATCH and renderer invalidation; Export has Download PNG
  and Copy figure JSON; finished cards show Export only; illustrations Appearance only; I toggles, Esc cascade.
  `test_nexo_inspector.cjs` green in Chromium and WebKit; verified by hand with Paula's checkpoint.
- **H3b-2 (plot editor module):** `src/editor/{applyEditor,editorState,palettes}.ts` port Team's
  `plot_editor.js` as pure functions (palettes with "Healthy in grey", layout/axis/legend/series/annotation
  overrides, swapAxes, publication style, reset, own undo stack, serialisation limited to the keys
  `canvas_state.R` accepts) plus the React sections under `src/ui/PlotEditor/`. vitest 89/89.
- **H3b-3 (Appearance wired):** Label and Background for plots, Label and Accent colour for illustrations,
  and the full plot editor bound to `visual.editor` in the store (undoable in the main history, own
  undo stack inside the editor as in Team); cards apply `applyEditor` on top of the cached figure with
  `Plotly.react`, so a palette or legend change never calls the API; only allow-listed keys are stored.
  Two fixes while integrating: the mock violin traces lacked marker colours (real R figures have them),
  and the palette select needed an accessible name. `test_nexo_inspector.cjs` 8/8 in Chromium and WebKit.
- The catalog is warmed at startup and served outside the engine lock: 0.3 s instead of ~12 s on first load.
- **Pending for later milestones:** Statistics tab (H5); "Edit figure" on finished cards (H6).

## H4 · Save and open (2026-11-06, morning)

- **H4a (API):** checkpoints live in a files backend with Team's layout (`<root>/projects/<workspace>/<sha256>.zip`
  + `.json`, atomic writes, 0600, dedupe by content; `R/frontends/api/{storage,storage_files}.R` because the
  production tree has no `team_storage_session`); the flat `nexo-storage` folder remains a fallback source.
  Routes: list/upload/download/delete checkpoints; `POST /sessions/{id}/canvas/validate` (token → Team's
  `team-canvas-state-ack`); `POST /sessions/{id}/checkpoints` saves from the live session through
  `export_session_path()` (so the ZIP is exactly what Team writes) behind the same ack gate as
  `project_library.R`; autosaves keep 5 per workspace. Evidence: `nexo-phase1-evidence/h4/api-storage-roundtrip-rtx.txt`
  (storage, round trip Nexo→ZIP→Nexo and ZIP→Team validation, HTTP 9/9, schema, engine: all PASS on the RTX).
- **H4b (frontend):** `state/serialize.ts` (canvas v1 ⇄ store), `state/autosave.ts` with Team's timings and
  pill strings (15 s debounce, 60 s max, 5 s retry, 135 s watchdog, 1 s re-save), checkpoints dialog
  (save as, open, download, upload ZIP, delete), URL follows the saved id. `test_nexo_save.cjs` green in
  Chromium and WebKit; vitest 99/99.
- **H2+H3 review (hidalgo-lab, integrity reviewer again out of quota):** fixed: typed validation of
  inspector inputs against the schema, action allow-list, 160-card cap, same-site/content-type filter,
  numeric editor fields with a text draft, trace patches by index only when every trace has a source key.
  Rejected after reading Team: "palette order without sort" (plot_editor.js:167 uses insertion order too).
  Deferred P2/P3: Team's explanatory messages in the editor (missing series, orientation, annotation
  limit), schema refetch after options-bearing changes, accessibility of dialogs, deleteCard on remove
  (server instances parked only), health exposing the root path.
- **Not yet verified by hand:** autosave against the RTX with Paula's checkpoint (the mock E2E covers the
  flow); please try: move a card, wait 15 s, the pill should read "Saved · HH:MM" and the checkpoint list
  should show a new autosave.

## H5 · Statistics (2026-11-06, morning)

- **H5a (API):** `R/frontends/api/statistics.R` drives `team_violin_stats_server` with the request Team's
  browser sends (describe / apply / verify / check; settings test welch|wilcoxon, correction holm|BH|
  bonferroni|none, scope displayed|all_in_scope, comparisons as pairs, effect none|hedges_g|cliffs_delta)
  and returns Team's reply verbatim; group comparison confirmation goes through the module's own input
  and its `team-group-comparison-data` message. Parity: a Welch/BH p-value recomputed from the prepared
  data equals Team's within 1e-9. Evidence `nexo-phase1-evidence/h5/api-statistics-rtx.txt` (7/7, HTTP 10/10).
- **H5b-1 (pure module):** `src/statistics/{settings,result,annotations,csv}.ts` port `canvas_statistics.js`:
  sanitising with Team's clamps, the Setting/Applied/New diff, status texts, stars and p formatting, group
  size labels, bracket annotations stacked by spacing and tip, CSV with Team's columns. 14 vitest cases.
- **H5b-2 (tab):** Statistics tab mirroring Team (Analysis: test, correction, family, comparisons, effect,
  "Review and confirm…" → diff → "Confirm and compute", Discard; Display: annotations on/off, adjusted or
  unadjusted p, label style, group sizes, font size, bracket spacing and tip, comparisons shown; results
  table, methods note, CSV); `node.statistics` saved through an undoable store command; cards draw the
  brackets with `applyStatisticsToFigure` on top of the editor without an API request; group comparison
  cards get "Show Group comparison report" and the reference-group confirmation. Two fixes while
  integrating: legacy dashboard nodes map to their v0 server instance (`tcinstance_v0_<output>`) instead of
  carrying an `instance` that `canvas_state.R` would reject, and the selects got accessible names.
  `test_nexo_statistics.cjs` green in Chromium and WebKit; all six suites green; vitest 115/115.

## H1–H5 integrity review (libreros-lab, 2026-11-06 ~07:00; static, no R on the M1)

Report: `nexo-phase1-evidence/h5/integrity-review-libreros-lab.txt`. Each finding was read against the
production tree before acting (R/server.R, project_records.R, results_dashboard.R, canvas.js). Fixes in
commit `5ccff4d`, pinned by `test_api_{engine,session,roundtrip,schema,storage}.R`.

| # | Finding | Cross-check | Action |
|---|---|---|---|
| P1-1 | Checkpoints without `shared-state-v1` prepared with default settings | True: Team rebuilds them from the restored QC inputs through `qc_settings_bridge` (`R/server.R:31,85`); the API has no QC module | **Fail closed**: `api_session_open` answers 422 "open it in Team and save it once" (`session.R`); selected columns always come from `saved$spec$selected` |
| P1-2 | ZIPs saved by Nexo lose `team-project-records-v1.json` | True: `project_library.R:382` appends it after `export_session_path`; the API only exported | Records read verbatim at open (`api_project_records_bytes`) and appended on every save (`api_project_records_append`); `team_project_records_read` of the saved ZIP equals the original |
| P2-1 | No pseudoreplication reason (`team_da_participant_reason`) | True (`R/server.R:55-59`) | Same bridge installed on the headless `shared` |
| P2-2 | Design gate stricter than Team, never laxer | True; also `design_check = TRUE` only affects `runAnalysis`, which the API triggers once at open on an already-prepared checkpoint | Documented; no change (Nexo may withhold p-values Team shows, never the reverse) |
| P2-3 | New cards start from markup defaults, Team copies the family view's live values | True (`canvas.js:297-309,333`) | Headless equivalent: the checkpoint's archived inputs for the family namespace seed the card (`api_family_archived_inputs`), explicit inputs still win |
| P2-4 | Legacy dashboard `top_n` default 10 vs Team 30 | True (`R/results_dashboard.R:238,793`) | 30 in `session.R` and `api.ts` |
| P2-5 | Boolean text coerced to FALSE; selects without static options unchecked | Boolean true; option-less selects are server-side selectize whose choices only the module knows | Boolean now rejects anything but true/false/1/0/yes/no; selects left to the module's `req()` (documented) |
| P2-6 | Choices-only `updateSelectInput` ignored; types lost after `runAnalysis` | True on both counts | Echo settles on the selected/first `<option>` when the current value is gone (`api_option_values`); archived types cached before `runAnalysis` empties `restored_inputs()` |
| P2-7 | A Team-named record (`<label>.zip`, 84 chars) or a bad `.json` fails the whole listing | True | Listing skips the record with a warning |
| P2-8 | Statistics pairs saved as `{a,b}` | **Rejected**: `StatisticsTab.tsx:12` (`saved()`) already writes `[a,b]` at 5a2f937; the reviewer read 24bef475 | — |
| P3 | TS validator misses R rules (unknown keys, SVG allow-list, 40 nodes/tab…) | True; all fail closed at the R ack with a generic message | Deferred to H8 polish (better messages), the R validator stays the authority |
| P3 | Autosave dedup/prune corner cases (same bytes, label "autosave") | True, improbable (ZIPs carry mtimes) | Deferred |
| P3 | `api_storage_dir` chmod 0700 on an existing root | True | Documented: Team and Nexo must run as the same user on the RTX (they do) |

## H6-0 · Card anatomy and shell polish (2026-11-06, morning; Codex Astra via Fabric, task t-20261106-061338-3b90)

Follow-up to the Fable design review of H5 (P1: cards lacked Team's anatomy). Branch `router/20261106-061530-e0cf2d`
cherry-picked onto `nexo/phase1`; 19 files, +405/−64, only `frontends/nexo` and one new E2E suite.

- **Card:** 40 px header with title and status dot (current / updating / pending / needs-data / waiting /
  error / finished, Team's labels as tooltips), 40 px footer with Edit · Duplicate · ⋯ (Finish plot,
  Data & settings, Copy to tab…, Move to tab…, Remove); the menu opens upward or downward and is clamped to
  the viewport (`cardMenuPlacement`, unit-tested). Finish is visual-only until H6b (no snapshot persisted).
- **Shell:** Team wording ("Export figure ▾", "Rename…", "Duplicate tab", "Delete tab…"), destructive confirm
  dialogs, dead controls disabled with "Coming in H6" (Figure page, per-card SVG/PDF/PNG/Print), reserved
  inspector column with the empty state "Select a plot or object to see its settings." (`data-open` toggles
  the content, the column no longer collapses), palette as swatch buttons (`role=group` "Color palette"),
  HUD hidden, lighter borders, single accent.
- **Checks:** `test_nexo_card_chrome.cjs` (anatomy, menu, remove/undo, duplicate, badge, finish; screenshots
  1440/1024/390 in `nexo-phase1-evidence/h6-0/`) green in Chromium and WebKit; vitest 115/115; tsc clean.
  Three older suites were updated to the new UI (tabs: actions inside the card menu and "Delete tab…";
  inspector: swatch buttons and the reserved column; save: "Export figure ▾"); all seven suites green.
- **Also fixed while checking the live API:** a checkpoint saved before any canvas work returned
  `canvas: null` and the client crashed on `canvas.version`; the API now opens it as Team's empty
  workspace (`{version "1", nodes []}`) and the client guards the same (`test_api_session.R`).

## H6 · Finish, illustrate, Figure page, Export (2026-11-06, late morning; integrated and deployed at 2c55772)

- **H6a (API, done):** `R/frontends/api/export.R` + routes. `GET /export/presets` (Team's
  `EXPORT_JOURNAL_PRESETS`, the four Export studio figures, formats, fonts, dpi and Team's UI limits);
  `POST /sessions/{id}/export` runs Team's `generate_export_artifacts` (with the Team adapters, so the
  participant warning and title wrapping apply) and `team_export_studio_write_bundle`, returning its ZIP;
  `GET /sessions/{id}/cards/{instanceId}/data.csv` calls the module's own `downloadHandler` (read from the
  mock session's download registry), so the CSV is the one Team's download button gives. Parity: for all four
  figures the bundle's members, CSV bytes and `figure_provenance.json` (without timestamps) equal Team's
  own call in the same session. Evidence `nexo-phase1-evidence/h6/h6a-export-api-rtx.txt` (export 7/7,
  HTTP 11/11); deployed, `/export/presets` 200 behind the same auth.
- **H6b/H6c/H6d (frontend, Fabric):** Finish snapshots + 21 illustrations (codex-a, gpt-6.1-sol,
  t-20261106-065649-b1a1), Figure page on the same canvas (codex-b, gpt-6.1-sol, t-20261106-065650-af12),
  unified Export dialog (claude-d, opus, t-20261106-065723-4c1e). Integrated on `nexo/phase1` as
  c02cccc (H6c + fixes), c16129a (H6b), 5fb63d1/876b735 (H6d red/green).
- **Integration fixes (mine):**
  - The v1 serializer dropped `state.document`, so the Figure page vanished on reload (H6c had worked
    around it by re-downloading the checkpoint ZIP). `toCanvasV1`/`fromCanvasV1` now carry it; vitest
    round trip added.
  - Dragging a page item saved the layout-decorated item (`node`, `index`, `note`), which the validator
    rejects ("Invalid saved document layout."). `replaceItem` keeps only `canvas_state.R` fields (red→green
    vitest).
  - Conflicts H6b×H6c (commands, CSS) kept both sides; H6d's Export tab replaced H6b's quick buttons.
  - The Export menu's Figure page items (SVG, PDF, Print) were left disabled by H6d; they now call the
    H6c page export. `test_nexo_export.cjs` checks the menu downloads a parsable page SVG.
  - `test_nexo_card_chrome.cjs` asserted the H6-0 finish stub (`finished === null`) and a transient
    "Finishing…" label that WebKit skips; now it asserts the stored v2 snapshot.
- **Found by the live probe (Mac dev server → SSH tunnel → RTX API), fixed with red→green tests:**
  - **Reopen showed later edits.** The API reused a live session by the opened file's sha256 even after
    cards, inputs, design or canvas changed, so reopening the original checkpoint showed unsaved edits
    until eviction or restart. Mutating calls now mark the session dirty, only a clean session is reused,
    and a save adopts the saved checkpoint's sha256 (0a6bbbd; `test_api_roundtrip`, `test_api_session`).
  - **Export dialog lost focus while busy.** Disabling the focused Download button dropped focus to the
    inert page, so the first Esc after a real bundle download did nothing. The dialog now holds focus while
    busy and returns it (16e82d8; new E2E check, Chromium and WebKit).
  - **Plot data (CSV) on finished legacy dashboard cards answered 404.** Their v0 instance only existed
    after a live render. The CSV route now builds it from saved inputs without dirtying the session
    (2c55772; `test_api_export`).
- **Evidence (`nexo-phase1-evidence/h6/`):** `h6-integrated-suites-mac.txt` (tsc, vitest 142/142, build,
  10 Playwright suites Chromium+WebKit, all exit 0); `h6-rtx-r-suites-and-deploy.txt`,
  `reopen-red-rtx.txt`/`reopen-green-rtx.txt`, `legacy-csv-red-rtx.txt`/`legacy-csv-green-rtx.txt`,
  `h6-final-deploy-rtx.txt` (health commit 2c55772, nginx 401 without credentials, Team :3952 200,
  parity 5/5, render-all exit 0); `h6-live-probe-synthetic.txt` (synthetic checkpoint against the real API:
  Finish → v2 SVG snapshot, Nature publication bundle with 7 members, Figure page SVG from the menu, card
  CSV, 0 console errors, both engines). The same read-only probe on the pilot checkpoint passed (5 cards,
  bundle, page SVG, CSV of 67 rows, no checkpoint writes); its outputs stay in the private folder.
- **Protected paths:** `git diff --stat ebee653 -- R/modules R/server.R R/global.R R/ui.R
  R/frontends/team R/frontends/classic www` is empty on the RTX checkout.
- **Open (P3, not blocking):** right after a plot draws, its badge reads "Up to date" while Finish still
  answers "Wait for … updating" for a few seconds (the live render is still finishing); a finished card's
  inspector status line says "Up to date" rather than "Finished". Both go to H7 polish.

## H7 · Performance, access, mobile (2026-11-06, midday; integrated and deployed at dfd60fb)

- **Baseline (mock build, Mac):** app JS 139 KB gz + CSS 4.5 KB gz (budget 250 KB gz without Plotly);
  `vendor/plotly.min.js` (1.09 MB gz) loaded as a blocking `<script>`; at "Fit" all 20 test cards freeze
  (scale < 0.5), so live-plot frame cost needs a dedicated measurement (H7b).
- **H7a (API, done, 65aad8e, deployed):** per-session render cache keyed by card, size, format and an
  input epoch (any API input change or echoed module update bumps it), 64 MB per session; a hit skips the
  flush. Unchanged input values are no longer re-applied, so Paula's legacy dashboard cards hit the cache
  on re-render. Memory guard after every request: above 2400 MB RSS it closes the least recently used other
  session, drops caches and collects garbage; above 2700 MB it exits with status 3 one second after the
  response and systemd restarts the unit. `test_api_cache.R` (red → green): PNG hit 0.013 s vs 0.12 s first,
  misses on size/input/design, 50 uncached renders p95 0.07 s with RSS flat (604 → 604 MB, synthetic data),
  guard soft/hard with injected RSS. All ten R API suites green, render-all 44/7/7/0, live probe unchanged on
  both checkpoints. Evidence `nexo-phase1-evidence/h7/h7a-*`.
- **Dispatched (Fabric):** H7b render performance (claude-d, opus, t-20261106-091422-c1fc: live cap of 4
  Plotly cards, rAF-coalesced draw, image cache 48 MB, deferred Plotly, vendor chunk, Finish waits for an
  in-flight render, perf E2E); H7c responsive, accessibility and phone read-only mode (claude-b, opus,
  t-20261106-091439-9b17: `?mode=view` and phones, no overlaps at 390/768/1024, axe 0 serious, keyboard
  only, finished status line).
- **What happened with the Fabric tasks:** both first runs hit Fabric's 30-minute task limit after
  committing their red tests and most of the work. H7b's continuation (claude-d, t-20261106-095040-2bef)
  fixed two regressions it had introduced (PNG cards frozen before their first render never loaded their
  image; menu and button zoom waited a frame and broke the camera assertion in `test_nexo_canvas_edit`) and
  restored the spike screenshots its first run had committed. H7c's continuation (claude-b,
  t-20261106-095049-2272) died after four minutes without a readable reason, leaving two small commits; I
  finished H7c here.
- **Integration fixes (mine):** H7c's lockfile rewrite replaced by one regenerated from the pre-H7c lock
  (semantically only `axe-core` added; the remaining diff is npm's key ordering). The WebKit access suite
  showed that Backspace on a focused card navigated back and dropped the page in view-only mode (no code
  handled Backspace, so it also applied in edit mode): Backspace outside a field is now never browser
  navigation and view-only swallows Delete (fe6c343).
- **Results (Mac, `h7-integrated-suites-mac.txt`):** tsc, vitest 162/162, build, all 12 Playwright suites
  Chromium+WebKit exit 0. Budgets: zoom step median 2.4 ms (p90 2.9 ms, budget 16 ms); `draw()` of 40
  cards 0.9 ms Chromium / 1.0 ms WebKit (budget 8 ms); never more than 4 live Plotly cards; panning back
  refetches 0 images; Plotly no longer blocks page load; app JS 60 KB gz vendor + 73 KB gz app (budget
  250 KB without Plotly). Access: read-only mode (`?mode=view`, phones ≤ 480 px with coarse pointer,
  `?mode=edit` forces edit) with no checkpoint writes; no overlaps at 390x844, 768x1024, 1024x768; axe 0
  serious/critical on canvas, inspector, Export dialog, Figure page and phone view (moderate "region"
  landmark notes remain); keyboard-only path and Esc cascade; finished cards' inspector status reads
  "Finished".
- **Live (RTX API, deploy dfd60fb, `h7-live-probe-synthetic.txt`, `h7-deploy-rtx.txt`):** H6 flow green in
  both engines; Finish now succeeds on the first click right after a plot draws (was 2 attempts); phone
  view-only on the pilot checkpoint: 5 cards, opened in 1.1 s, 0 writes after 20 s. Health dfd60fb, nginx
  401 without credentials, Team :3952 200, protected paths unchanged against ebee653.
- **Open (P3, for H8):** on a phone the canvas opens at 100 % instead of fitting the content; axe
  "region" (landmark) notes; "Unknown card" error text from Plot data (CSV) shows in the inspector status
  line instead of a toast.

## H8 · Pilot and close (2026-11-06, afternoon)

- **H8a, science parity in `/health` (`R/frontends/api/health.R`, `test_api_health.R` H1–H4):** health now
  reports `science = {globalMd5, productionRoot, scienceMatchesProduction, scienceFiles, scienceDiffers}`,
  the md5 of `R/global.R`, `R/server.R` and every `R/modules/*.R` of the API's own checkout compared with
  the production tree (`LIPIDOMIC_API_PRODUCTION_ROOT=<server-home>/lipidomic-team-ana-20261028` in the
  unit). An unreadable production root never reports a match. `deploy-nexo.sh` prints the verdict and
  warns, never fails. Live: 21 science files, `scienceMatchesProduction: true` (`h8-deploy-rtx.txt`).
- **Tests that need production Team skip cleanly on Max's branch (`requirements.R`):** every app-loading
  `test_api_*.R` checks the Team symbols it binds and prints `SKIP <test>: needs the production Team port
  (PRs 8 and 9)` with exit 0, so Max's `run_acceptance.R` stays green before that port lands.
- **24-card stress, API (`test_api_stress.R`, synthetic checkpoint, RTX):** the first run showed 24 cards
  cost 66 s to create (p95 10.7 s) and RSS 552 → 1513 MB, because `MockShinySession` runs every output
  observer eagerly (the browser suspends hidden outputs). Three changes, all outside the modules:
  - *Lazy outputs:* plot-type outputs inside card namespaces are gated until the API asks for that card
    (`api_output_lazy`, `api_output_want`); `LIPIDOMIC_API_LAZY_OUTPUTS=0` restores eager behaviour.
  - *Per-card cache epochs:* a card input bumps only that card's epoch, so adding a card no longer
    invalidates the other 23 (the first stress run failed its cached pass on exactly this).
  - *Download handlers are not seeded*, and the unit runs with `R_ENABLE_JIT=0` (same results, faster
    first renders).
  Result (`h8-r-suite-lazy-rtx.txt`, `h8-r-suite-nojit-rtx.txt`): create total 66 s → 28 s, p95 10.7 s →
  1.6 s, checkpoint open 6.6 s → 1.9 s, cached pass 24/24 hits, render-all 147 s → 78 s with the same
  44/7/7/0, parity 5/5, exports identical to Team, peak RSS under the 2400 MB soft guard.
- **24-plot stress, live browser (RTX API through the tunnel, synthetic checkpoint):** first run
  (`stress/h8-stress-chromium.txt`): 24 plots added in 30.5 s, but two vector PCA cards stayed "Updating…"
  and the canvas needed 180 s to settle; 24 additions also formed a 10 % strip. After the fixes below
  (`stress-final/`, Chromium and WebKit): 24 plots added in 27.9 s / 25.1 s (add→card median 1.1 s / 1.0 s,
  p95 1.4 s / 1.2 s), every card settled 6.1 s / 6.2 s after Fit (22 current, 2 showing the module's
  refusal), render requests median 160 / 170 ms, zoom step median 4.6 / 4.2 ms (p95 18.3 / 18.8 ms), frame
  median 16.7 ms, never more than 2 live Plotly cards during gestures (cap 4), API RSS flat at ~1710 MB with
  two sessions open. A first Chromium run on a loaded Mac read 21 ms zoom median; kept as
  `h8-stress-chromium-run1-noisy.txt`. **Open (P3):** up to 5 long tasks of ~1.2 s when cards turn live after
  a zoom (Plotly initialising, the 3D/WebGL cards are the likely cost). A mount queue that spaced Plotly
  mounts one frame apart was tried and reverted: it broke autosave and badge timing in two suites.
- **Bugs the stress found and fixed:**
  - The API validator rejected Team's own defaults (colour names such as `"black"`, two-value range
    sliders): it now follows Team's semantics, and adding a card sends `{}` so the server seeds defaults
    (ea830fc, red/green in `h8-validator-*-rtx.txt`; `test_api_catalog.R` checks every catalog default).
  - A refused frozen Plotly card stayed "Updating…" forever: it now shows the module's message (c7dcf7f).
  - 24 additions ended in a 10 % strip: a new card now takes the nearest free slot around the view centre
    (08c15a3), never at a negative position, which Team's validator rejects when saving (3807f3d).
- **H8b (Fabric claude-d, 1b35621):** all UI text in `strings.ts`, error toasts instead of inline status
  errors, empty states, a labelled canvas region, the shortcuts dialog (`?`), README.
- **H8c, Group comparison (Fabric claude-d, merged 8530c3c):** the P1 gap of the audit. The card draws the
  module's `team-group-comparison-data` message live (violins, significance, conditions), with its
  inspector section (test, reference, baseline, scale, classes, conditions, colours) and CSV. Live on the
  synthetic checkpoint in Chromium and WebKit (`gc-live.txt`): confirm prompt ~1 s, drawn < 1 s after
  confirm, 9 result rows, CSV 72 rows, hiding a condition 2 → 1 violins, 0 console errors.
- **Phone and access:** a phone opens fitted to the content (the H7 P3), one `<main>` landmark, axe
  moderate findings 0.
- **H8d (Fabric claude-b, merged eca66c6), and the rest of the audit's P2s (mine):** copy/paste plot,
  Shift+1 / Shift+0 / 100 %, Figure page aspect lock, z-order, duplicate object and double-click text, rail
  Palettes / Text & shapes, the open checkpoint's name in the top bar (H8d ran out of time before items 6
  and 7); tab toasts and the delete dialog's card count (f2c3757); "Try again" after a failed open
  (a7ae1c4).
- **Feature audit against Team (`nexo-team-gap-audit.md`, 127 features):** at audit time 101 done, 12
  partial, 14 missing. After H8 the P1 and every P2 are closed with tests; the remaining items are P3 and
  listed in the audit's section 0.
- **H8e, design pass (Fabric claude-b, Fable 5.1, merged 9665051; `nexo-design-pass.md`, 18 before/after
  captures in `h8/design/`):** Nunito Sans at its real 400/600/700 weights (every bold was synthetic), one type
  scale, hairline borders, a single-layer card shadow, one accent, quieter footer actions and library rows
  ("Requires configuration" and "Unavailable" look secondary), compact inspector tables (tabular numbers,
  sticky header, ellipsis with title), Data forms as rows (checkbox + short label with Team's sentence as
  muted help, one radio per line, segmented groups), smaller zoom pill and minimap. Zoom median on this Mac
  2.2 ms before and 2.2–2.3 ms after the merge (the 12.8–14.9 ms the task reported came from a loaded M1).
  **Three defects found in integration and fixed here:** the minimap moved to the lower right covered the ⋯
  of newly placed cards (WebKit `finish` suite): back to Nexo v0's lower left, keeping the smaller size
  (91e0bd9). On the real schema, a control without a label crashed `SchemaForm` and the crash unmounted the
  whole app (blank canvas; the mock schema never has a null label): fixed, and the inspector column now sits
  in an error boundary so a panel failure stays in the panel. Radio options and segmented groups were broken
  by a CSS specificity clash and overflow: fixed (309419c, `h8/design/live-after-fix-1440-inspector-data-synthetic.png`).
  After the fixes the live 24-plot stress opens 24 real schemas with 0 page errors.
- **Suites (Mac, `h8/suites/h8-final-suites-mac.txt`):** tsc, vitest 185/185, build (app 83 KB gz + vendor
  60 KB gz + CSS 8 KB gz, budget 250 KB without Plotly), all 13 Playwright suites in Chromium and WebKit exit
  0 (162 PASS lines); red/green for the new assertions in `h8/suites/`.
- **Deploy and live (309419c, `h8-final-deploy-rtx.txt`, `h8-final-live-rtx.txt`):** API restarted with
  `scienceMatchesProduction: true` (21 files), nginx 401 without credentials, Team :3952 200, protected
  paths unchanged against ebee653. Synthetic checkpoint, Chromium and WebKit: finish, publication bundle (7
  formats), Figure page SVG, card CSV, 0 console errors. Pilot checkpoint, read-only: the same desktop flow
  and the phone view (5 cards) with 0 console errors and 0 checkpoint writes; captures stay private.
- **Open (P3):** the long task when Plotly cards turn live (above); the minimap still covers the lower-left
  corner of a large card's footer at 100 % (as in v0); the P3 list in the gap audit. The shared workspace
  holds 5 autosaves of the synthetic checkpoint from the stress runs; the API keeps only the 5 newest, so
  the pilot's own autosaves replace them.
- **Pending people, not code:** Paula redoes Figure 1 in `/nexo/` and Steph reviews (`nexo-pilot-guide.md`);
  the `candidate/nexo-h1..h8` stack (`nexo-pr-stack.md`) is built locally and goes to Max only with
  Gerardo's approval.

## H8 · After close: where a new plot lands, and journey review

Gerardo asked how someone knows where on the canvas a newly added plot went. The add path now answers that,
and a journey-based UX review (Fable 5.1) walked the whole flow afterwards.

- **Adding a plot shows where it goes (83240f5, `h8/add-feedback/`):** a placeholder appears in the chosen
  slot while the API creates the card; the camera pans to it only if the slot is out of view (Nexo v0 rule:
  adding never moves the camera when the card is visible; never zooms in), animated for 260 ms and instant
  with reduced motion; the new card gets a short accent ring and is selected; the minimap marks it; the
  library row's "Added · N on canvas" is a link that cycles through those cards, switching tab and zooming
  out if a card does not fit. Placement never goes to negative coordinates (3807f3d). Same feedback for
  illustrations and paste. E2E red before, green after, in Chromium and WebKit.
- **Team selection bars no longer show raw tokens (fef14a4, `h8/selection/`):** the dashboard heatmap and
  composition cards have Team "selection bars" (sample groups, classes, lipids) stored as `__ALL__`,
  `__EVERY__` or a JSON array. The Data tab showed `__ALL__` in a text box. The API schema now carries each
  bar's default choices and all-token (as `www/team/js/dashboard_selection.js` reads them); the form shows
  All / Default / None, "n of N" and a checkbox per choice, and writes Team's own encoding. On the RTX the
  real heatmap card exposes 4 bars and accepts a JSON array (`test_api_schema.R`, red before, green after).
  The mock schema now has a selection bar and a control without a label, the two shapes that broke before.
  Live on the RTX at 60beb8b (synthetic checkpoint, `live-selection-synthetic.txt`): no raw tokens, unchecking
  Control PATCHes `["Treatment"]` and the heatmap re-renders with one group, 0 console errors. Checklist rows
  were made compact (9a4c076): `#inspector label`'s 12 px margin had leaked into radio and checklist rows.
- **Start page (60beb8b):** checkpoints grouped as Prepared in Team, Saved checkpoints, Autosaves, newest
  first, each with its date and source (`h8/selection/picker-mock-chromium-1440.png`).
- **Journey review (Fable 5.1 via Fabric claude-b, merged a62befa; `nexo-journey-review.md`, 71 captures in
  `h8/journeys/`):** nine journeys (open, add, edit, statistics, arrange, finish and Figure page, export, save
  and reopen, phone) on the mock build, findings ranked P1–P3 with file/line or capture. Each finding was checked
  against the code before changing anything; the verdict and outcome per finding are in the review's last
  section. Fixed with tests (red on the previous code in `h8/journey-fixes/`): **Data-tab changes are
  undoable** (P1, 3035694: undo/redo PATCHes the inputs back to the API and reloads the form); **the Publication
  export scope says it is Team's Export studio** and Volcano waits for the study design (P1, 339143e); group
  comparison opens on Statistics; Move to tab is titled, leaves out the current tab and says where the card
  went; paste and downloads are confirmed (339143e); **a failed autosave gives its reason and a Retry now
  pill** (a33b9b6); the status band follows the Figure page mode; gated library rows explain themselves inline
  (c5ecb4c). Not reproduced: the phone inspector (tapping a card opens it; the run then toggled it closed with
  the rail button). Kept as Team does: the plot editor's own undo and Apply palette, Export-only finished
  plots, 15 s / 60 s autosave. The six P2s left after the first pass were fixed in a second pass (below).
- **Suites and deploy (`h8/journey-fixes/suites-mac-82d9aea.txt`):** tsc, vitest 198/198, build (app 86 KB gz +
  vendor 60 KB gz + CSS 9 KB gz), all 13 Playwright suites in Chromium and WebKit exit 0 (182 PASS lines).
  Deployed at 045e4af: nginx 401 without credentials, Team :3952 200, protected paths unchanged against ebee653.
  Live on the synthetic checkpoint, Chromium and WebKit (`h8/journey-fixes/live-data-undo-synthetic.txt`):
  changing the violin's lipid and pressing Ctrl+Z sends one PATCH each way, the form and the plot return to the
  first lipid, Redo is available, 0 console errors.
- **Second pass, the remaining P2s (each confirmed in code first; red runs in `h8/journey-fixes/red-p2-*.txt`):**
  statistics now follow Data changes. Before, they were only re-checked when the Statistics tab opened, so a
  card kept the previous lipid's p-value brackets. Now the canvas asks the server after each change and drops
  stale results in the same undo step (663be64). The card header shows "Statistics" or "Statistics out of date"
  (663be64). Canvas tools gained Arrange selected cards: align edges and distribute, from the already tested
  `align.ts` (00285ff). The Draft chip says how many plots are left to finish, and the Figure page Plots tab has
  a count and a Finish button per row (ba703df). The Checkpoints dialog lists the open checkpoint first, marked
  Current, and closes after saving with a toast that names the checkpoint now open (35f6f2f). The phone
  view-only banner is compact and stays dismissed for the browser session (3bf8555). What is left from the
  review is P3 polish, listed in its verification table.
- **Second-pass suites (`h8/journey-fixes/suites-mac-3bf8555.txt`):** tsc, vitest 198/198, build, all 13
  Playwright suites in Chromium and WebKit exit 0 (192 PASS lines).
- **Live check of the second pass (`h8/journey-fixes/live-statistics-added-violin-synthetic.txt`):** on the
  synthetic checkpoint, with the study design confirmed, a violin added from the Library first showed that the
  Statistics tab had never worked for added cards (since H5): it sent the node id, and the server answered
  "Statistics are available for violin cards only". The mock accepted any id, so the suites stayed green. Fixed
  in 91bfdd6 with one helper for the server-facing id and a stricter mock (red run in
  `red-p2-library-violin-statistics.txt`). Live afterwards, Chromium and WebKit: describe, apply, the card marker,
  the Data change that marks it out of date with one check request, and Undo back to the first lipid with the
  marker restored; 0 console errors.
- **Suites after the fix (`h8/journey-fixes/suites-mac-91bfdd6.txt`):** tsc, vitest 199/199, build, all 13
  Playwright suites in Chromium and WebKit exit 0 (194 PASS lines).

## More downloads from this analysis

Team's inspector Export tab mirrors the download buttons the module draws next to the plot
(`www/team/js/canvas_inspector_export.js:88`). Nexo now does the same through the API:
`GET /sessions/{id}/cards/{instanceId}/downloads` lists `{id, label}` and
`GET …/downloads/{downloadId}` runs that button's own `downloadHandler` (R/frontends/api/export.R).
Which buttons belong to a card: the nearest container around the plot in the module's markup, or inside
the renderUI wrapper that draws it; a renderUI block of buttons counts where its placeholder sits; buttons
in another tab pane belong to other plots; only handlers the card registered are listed. Labels are Team's
(`data-export-label`, `aria-label`, then the button text, so "CSV", "PDF", "Plot data (CSV)").
A sweep over the 58 catalog cards on the synthetic checkpoint (evidence `h8/more-downloads/sweep-58-cards-rtx.txt`):
82 downloads served, 22 refused with the module's own message (no lipids pass the filters on 12 synthetic
lipids, longitudinal plots without time points, and Team's own failures: Circos PDF
`unused argument (include_title = TRUE)` and the BQC/outlier PDF). Three cards have no button (LSEA and the
two guided QC views). A finished card offers its snapshot only, as in Team.

## Live journeys (the real API, not the mock)

The mock had hidden real-API bugs three times (H6, the H8 null label, statistics on added violins), so
`tests/dual-ui/test_nexo_live_journeys.cjs` runs Paula's canvas work against a running API: open, confirm the
study design, add and draw one card of each kind, Data change and Undo, statistics, finish and the Figure page,
exports through the API, named save and reopen. It is opt-in (`NEXO_LIVE_BASE`), refuses non-synthetic
checkpoints, and deletes the checkpoint it saves. Green in Chromium and WebKit
(`h8/live-journeys/live-journeys-synthetic.txt`). Its first runs found two more bugs, fixed with mock tests that
were red first:

- **The pathway network never drew** (`red-live-pathway-network.txt`, 4a0aa58): the card asked the API for a
  PNG, which a visNetwork card cannot make; the mock answered any format. The card now draws Team's widget
  payload with the vis-network build Team ships (R visNetwork 2.1.4, vendored like Plotly by
  `scripts/vendor-visnetwork.sh` and `deploy-nexo.sh`). The wheel and the arrow keys stay with the canvas (Nexo
  v0); the network keeps its own zoom buttons. Frozen, it is the image of the drawing; Finish captures it, which
  Team cannot.
- **Zoomed out, an edited card kept its old figure** (`red-live-zoomed-out-image.txt`, ec54bd5): below 50 %
  every card is frozen (H7, kept), and a frozen card showed the previous inputs' figure while the inspector said
  Up to date. Image cards now fetch the image for their current inputs; Plotly cards retake their snapshot.

The mock is stricter so the suites catch this class of bug: it refuses unknown cards for statistics and formats
a card does not render, and creates cards with every schema default, as the server does.

Suites after these fixes (`h8/live-journeys/suites-mac-d52c09c.txt`): tsc, vitest 202/202, build, all 13 mock
Playwright suites in Chromium and WebKit exit 0 (200 PASS lines).

## All of Team's canvas: the complete fixture and the 58 plots

Phase 1 now carries Team's whole canvas inventory, not a demo subset. The remaining P3 gaps from
`nexo-team-gap-audit.md` landed (queued-add cancel, help, study-design badge, per-card restore progress, "Plot
changed — export again", ZIP upload on the start page, illustration export, rounded rectangle, page guides,
plot list by tab, condition swatches). The classic synthetic checkpoint has no time points and only 12 lipids, so
11 catalog entries could never draw on it. `tests/dual-ui/fixtures/nexo-complete-synthetic.zip` (76 lipids × 24
samples, Control/Treatment × T1–T3, produced by Team's own export code; see `nexo-complete-fixture.md`) covers
them. `NEXO_RENDER_FIXTURE=complete Rscript tests/dual-ui/test_api_render_all.R` on the RTX
(`h8/complete-fixture/render-all-58-rtx.txt`): **57 of 58 drawn, 0 silent, 0 failed**; the classic fixture is
unchanged at 44/7/7/0.

The 58th, Composition · donut (filtered), is a Team production bug: `5_barchart_module.R` passes an undefined
`ncols` to the donut, so the module fails with "invalid 'type' (closure) of argument" in Team too. Nexo shows the
module's message on the card. The fix belongs in `R/modules`, which phase branches do not touch; it is listed for
Max.

## Simulated pilot

Paula and Steph cannot take part, so the closing pilot is simulated (`nexo-pilot-simulation.md`).
`tests/dual-ui/pilot/pilot_figure1.cjs` plays Paula rebuilding Figure 1 and Steph reviewing it on a desktop and a
phone, through what a user sees. It passes 32 of 32 steps in Chromium and WebKit, against the mock and against the
real API on the complete synthetic checkpoint, with 0 console errors (`h8/pilot-simulation/`). Its first runs
found four app problems, now fixed with tests that were red first:
- Figure page selects showing internal values.
- Figure 1 panel B ignoring a finished library copy of the 2D PCA, a trap Team shares.
- 11 px chrome labels on phones.
- A mock that could not save after statistics.

Two P3 frictions inherited from Team were fixed next, also red first. A template layout now says how many texts
and shapes it hides and that Free shows them. Choosing a palette applies it at once, so there is no separate Apply
palette button (Team keeps one).

## Reopening a checkpoint saved by Team: every saved card draws

A real 24-card checkpoint saved by Team (kept on the RTX, not in git) opened in Nexo with every card showing
"Couldn't bring back …". Two causes, both fixed red then green:

- **Saved cards were never re-created.** Team's browser re-creates a checkpoint's module instances when it
  restores the canvas; the headless API did not, so every saved card answered 404 "Unknown card." The synthetic
  round trip had hidden it: `test_api_roundtrip.R` called `api_card_create` itself before rendering. Now the
  first request for a card the open canvas holds re-creates it from its saved source and inputs, as a restore
  that never dirties the session (`api_card_saved`, `api_card_restore` in `R/frontends/api/cards.R`). Older
  canvases keep a family's own view as a node with no instance (id = source, e.g. `logratio_tab-logratioPlot`);
  both sides call it `tcinstance_fixed_<id>` (`api_card_fixed_id`, `fixedInstanceId` in `api/instance.ts`).
- **Nexo's text limit was stricter than Team's.** Nexo refused text values over 4096 bytes; Team keeps a canvas
  plot setting up to 100000 characters (`plot_instances.R`). A long saved heatmap lipid selection made the
  legacy dashboard cards fail. Nexo now uses Team's limit, and a restore drops a saved value this build refuses
  instead of losing the card.

Tests: `tests/dual-ui/test_api_restore_cards.R` (Team-style ids, a fixed family node, saved inputs kept, session
not dirty, unknown ids still 404, Team's text limit) and `api/instance.test.ts`. Evidence:
`docs/integration/nexo-phase1-evidence/h8/restore-saved-cards/`.

Two more found on the same checkpoint, also red then green: a Plotly card queued for its first image showed
"Could not update" (its status read the "Restoring …" placeholder as an error; now `bodyStatus()` in
`cardStatus.ts`), and the fixed logratio node drew every feature because the family view's run-time inputs
(`sel_<class group>`) were not restored (`api_card_family_view_inputs`); it now shows the saved selection.

Measured on that checkpoint at `1c48e3e`, cold API, through the tunnel, 1440×900, read-only (no edits, no saves):

| | Chromium | WebKit |
|---|---|---|
| Session open on the server (`POST /sessions`) | 7.3 s | 7.3 s |
| Cards on screen | 8.8 s | 8.7 s |
| Visible cards drawn | 10.0 s | 9.8 s |
| Each further card (serial, one R process): median / worst | 1.4 s / 12.5 s | 1.1 s / 12.8 s |
| Whole canvas drawn after zooming out and panning | ≈ 54 s | ≈ 50 s |

24 of 24 cards draw at the API (`200`), 0 console errors, 0 error badges in the browser. The worst card is PCA
loadings · 2D (12.5 s, smart labels on 2000 lipids from the saved settings). The whole-canvas time is the sum of
serial renders: the API draws one card at a time.
