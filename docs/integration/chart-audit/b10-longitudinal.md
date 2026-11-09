# Chart audit · b10-longitudinal (Longitudinal time courses), first round

Auditor: Opus 5.5 (claude-b). Protocol: `docs/integration/nexo-chart-audit-plan.md`, checks 1–11 plus 12 "Layout".
Script: `node tests/dual-ui/chart-audit/audit_b10-longitudinal.cjs [outputName …]` (Chromium 1440×900, Vite :5190 with
`NEXO_AUDIT_API=http://127.0.0.1:3962`, checkpoint `nexo-complete-synthetic`; saves `audit-b10-longitudinal-synthetic`
and deletes it after each plot, every delete answered 200). Raw results: `b10-longitudinal/results-all.json` (full run,
all five plots, after fix F1 and before F3), `b10-longitudinal/results-index_plot.json` (index_plot rerun, after F3).
Screenshots: `b10-longitudinal/<output>-<check>.png` (all ≤ 400 KB).

The API runs aad45f68. The frontend fixes (F1, F3) ran live through Vite. The R fix (F2) is **not deployed and not run**,
because the M1 has no R.

## Batch-wide facts (apply to every plot below)

- **Time points:** the synthetic checkpoint *has* time points. The session's `deState.timepoints` is `true`, which is Team's own
  gate `team_canvas_timepoints_available()` (`R/frontends/team/plot_instances.R:547`, TimePoint T1/T2/T3). So
  "Unavailable" was **not** a correct answer, and no check is N/A for lack of time points.
- **Generate Analysis:** Team builds time courses only after the module's "Generate Analysis" (`submit_longitudinal_btn`,
  `eventReactive` at `R/modules/11_longitudinal_module.R:1341`). Each plot also `req()`s a selector that the module
  builds after that step (`selectedMacroclass` … at `:3316`, `:3331`, `:3346`, `:3361`). Team Canvas shows this as a "run"
  need on the card: "Needs Generate Analysis" plus a "Generate analysis" button (`www/team/js/canvas_catalog.js:143`). The
  script records what the card says first, then presses the button in the Data tab.
- **Plot size:** the image height comes from Team's own Plot Height slider (`plotHeight`, default 550, `:3281`), not
  from the card. A 620×550 image therefore sits contained in a 618×682 body, which is how Team draws it.

### F1 (Nexo bug, fixed): all five time courses were "Unavailable" in the Library
The Library showed "Unavailable · needs two or more time points" for all five plots (`catalog.ts` `availability` reads
`design.timePointsReady`). The real API never sends that field (`R/frontends/api/session.R:382` `api_design_state`).
Team's answer travels in `deState.timepoints`. Fix: `withTimePoints(design, deState)` fills `timePointsReady` from
`deState.timepoints === true` when the session opens, when the design is confirmed and when analysis settings are
applied. Red `6a3e0c2d` (`TypeError: (0 , withTimePoints) is not a function`, 1 failed | 5 passed). Green `e0538fec`:
vitest 100 files / 462 tests, `tsc --noEmit` clean, mock suites `test_nexo_inspector.cjs` 40 PASS (H3 OK) and
`test_nexo_card_chrome.cjs` 29 PASS (H6-0 OK). After the fix all five tiles are enabled.

### F3 (Nexo bug, fixed): a new time-course card said only "The plot inputs are unavailable for this session."
The card showed a red "Could not update" with the API's generic 422 text (`macroclass_plot-1-before-generate.png`).
Team Canvas instead names the step and offers its button. Fix (`src/runNeeds.ts`, `cards.ts` `renderFailed`): for these
five outputs, when the API returns that exact refusal, the card shows Team Canvas's wording "Needs Generate Analysis. The
time points are there. …" and a **Generate analysis** button that presses `submit_longitudinal_btn`. It is not offered
read-only. The card reads "Needs settings" (amber), not failed. Pressing it draws the plot (live:
`macroclass_plot-1-run-need.png` → `macroclass_plot-1-run-need-generated.png`; index_plot rerun #1 "state=waiting"). Red
`fcb4e35c` (`Cannot find module './runNeeds'`). Green `4090560e`: vitest 101 files / 465 tests, tsc clean, inspector 40
PASS, card chrome 29 PASS.

### F2 (Nexo bug, R fix written, not run): module buttons named by their input id
In every plot's Data tab, Team's time-course designer shows two buttons labelled `btn_del_case_case_<n>`
(`macroclass_plot-4-data-changed.png`). In Team they are icon-only × buttons beside "Timecourse 1/2"
(`R/modules/11_longitudinal_module.R:1305`). `api_button_text()` found no text, so the schema fell back to the id. Fix:
`api_button_icon_label()` (`R/frontends/api/schema.R`) names a remove-type icon button by its action plus the text beside
it ("Remove Timecourse 1"). Red `45d532a0`, test `tests/dual-ui/test_api_schema_icon_buttons.R`. Green `1949cbb3`.
**Neither has been run (no R on the M1); the coordinator must run** `Rscript tests/dual-ui/test_api_schema_icon_buttons.R` and
`Rscript tests/dual-ui/test_api_schema_actions.R`. Check 4 stays FAIL until then.

### F4 (Nexo gap, open): Team's time-course designer cannot be edited in Nexo
Team's designer lets the user drag cohorts between a source bucket and the "Timecourse i" buckets (`sortable::rank_list`,
inputs `case_bucket_<id>`, `R/modules/11_longitudinal_module.R:1265-1320`) and remove single items with a ×
(`Shiny.setInputValue(…delete_timecourse_item…)`, `:1290`). Nexo's Data tab offers "Add Timecourse" and the per-case
remove buttons, but not the bucket contents. The default design (two time courses built by the module) draws. A user
cannot change which cohorts or time points each time course compares. This is a feature-sized gap (a sortable-bucket
control plus `allowedInputs` for `case_bucket_*`, which `R/frontends/team/plot_instances.R` owns), not fixed here.

**Fix (F4, Opus 5.5, branch `router/20261108-082754-0ef524`, topic timecourse-designer):** the Data tab now has a
"Time courses" control, one bucket per Team rank_list, items and order read from the module's rendered designer after
the settled session (`api_schema_rank_buckets`, `R/frontends/api/schema.R`; the real case ids are random per session and
never hard-coded). Each item has ↑/↓, a **Move…** menu ("Move to Timecourse 2", Enter/arrows/Escape) and a × remove;
each bucket an "Add cohort…" select fed by Team's cloning source bucket; drag works as a bonus. A change sets
`case_bucket_<id>` as sortable's JS sends it (item ids in order) and presses Team's Generate Analysis in the same PATCH
(Team applies the designer only on that button), so the card redraws. A remove sets the shortened bucket instead of
`delete_timecourse_item`: Team's delete observer first syncs the buckets and then drops the index, so sending both would
remove two items, and a repeated `{case_id, item_idx}` would be skipped as an unchanged value. Buckets are computed
controls (`api_is_computed_id`), stored in Nexo's checkpoint member, never in the instance inputs; `plot_instances.R`
is unchanged, so a Nexo checkpoint still opens in Team. "Add Timecourse" re-reads the schema and shows the new empty
bucket. Evidence `docs/integration/nexo-phase1-evidence/h9/timecourse-designer/`. R test
`tests/dual-ui/test_api_timecourse_designer.R` **not run** (no R on the M1).

### Check 11 (open): the first render logs a 422 in the console
Before Generate Analysis, the first render, and the first render of each duplicate, gets the API's 422. The browser logs
it as "Failed to load resource: … 422". With F3 the card explains the 422, but the console entry remains. Options for the coordinator:
the API answers a run need with a 200 and a `needs` payload instead of a 422, or Nexo skips rendering until the button is
pressed. The second needs the API to say whether the button was pressed. allmetrics_plot does not log it, because Team
draws its own placeholder there.

**Fix (check 11, client-side gating, same branch):** once a time-course card has shown "Needs Generate Analysis", Nexo
asks for no further render of that card instance (resize, tier change, prefetch, input change) until a PATCH presses
the module button (`src/runNeeds.ts` `markRunNeed`/`clearRunNeedIfPressed`, `cards.ts` `awaitingRun`). The first render
of a new card or duplicate still gets one 422, because only the API knows whether the button was pressed; removing that
last entry needs the API to answer a run need without an error status.

### Check 12 (mock sweep)
`NEXO_PLOTLY_JS=$PWD/frontends/nexo/public/vendor/plotly.min.js NEXO_SWEEP_ONLY=<the five sources> node tests/dual-ui/test_nexo_layout_sweep.cjs`:
```
PASS chromium:1024x768 longitudinal_tab-index_plot
PASS chromium:1024x768 longitudinal_tab-struct_plot
PASS chromium:1024x768 longitudinal_tab-allmetrics_plot
PASS chromium:390x844 phone
SUMMARY offenders=0 sources=5 engines=chromium
```
(1440×900 also PASS for all five.) Note on evidence: the `<output>-12-<width>-data.png` images are element screenshots of
the scrolled Inspector, so only its visible top is painted. The verdict comes from the DOM rules (spill / overlap / escape,
the same as the sweep), which cover the whole panel with every `<details>` open.

## macroclass_plot · Time course · main class (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | **FAIL → fixed (F1, F3)** | Before F1: Library "Unavailable · needs two or more time points" although Team reports time points. After F1: card red "The plot inputs are unavailable for this session." (`b10-longitudinal/macroclass_plot-1-before-generate.png`). After F3: "Needs Generate Analysis …" + button (`macroclass_plot-1-run-need.png`). Then drawn at 100 % (`macroclass_plot-1-draws.png`) and zoomed out as the frozen image (`macroclass_plot-1-zoomed-out.png`) |
| 2 | Matches Team | PASS | Module `POST …/render` 620×550 (25 KB) for the same inputs; card image 620×550 contained in 618×682; Glycerolipid trajectories with Team's title, subtitle and legend (`macroclass_plot-1-draws.png`) |
| 3 | Size | PASS | 620→780→390 px, redrawn each time, nothing overflows: `macroclass_plot-3-larger.png`, `macroclass_plot-3-smaller.png` |
| 4 | Data tab | **FAIL (F2, fix unrun) + gap F4** | All 13 Team controls present (allowedInputs `longitudinal_group_var`/`longitudinal_timepoint_var` shown as Grouping/Timepoint Variable); Plot Height 550→700 redrew (image 620×700); slider bounded 350–5000 like Team, so no out-of-range value can be entered. Defect: buttons `btn_del_case_case_673990`, `btn_del_case_case_934241` (`macroclass_plot-4-data-changed.png`) |
| 5 | Appearance | PASS | Image plot: Label renames the card, Background applied (255,244,224), Size; no Plotly-only control that would do nothing; canvas Undo/Redo of the label (`macroclass_plot-5-appearance.png`) |
| 6 | Statistics | N/A | Statistics tab is for violin/group comparison; tab says "Statistics are available for independent violin copies." Team's paired tests here are Data controls (Statistical Mode Choice, Show Statistic Detail) |
| 7 | Export | PASS | Card PNG 162 KB, card PDF 74 KB; SVG disabled with the reason "This figure is a raster image; SVG is not available."; Team CSV `longitudinal_lipid categories_GL.csv` 2.6 KB and PDF 6.5 KB (`macroclass_plot-7-export-dialog.png`) |
| 8 | Finish | PASS | Snapshot 423×700 (Plot Height 700) in a 421×460 body; Edit figure → live PNG (`macroclass_plot-8-finished.png`) |
| 9 | Duplicate / remove / undo | PASS | Duplicate (header chrome) keeps label and `plotHeight=700`. Like every new instance it needs Generate Analysis again: first state error/not drawn, drawn after the button (Team Canvas checks per instance too). Remove + Undo brings it back drawn (`macroclass_plot-9-duplicate.png`) |
| 10 | Save and reopen | PASS | Reopened in a new page: label, `plotHeight=700`, background kept, drawn at once (`macroclass_plot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | **FAIL (open)** | 4 × "Failed to load resource: … 422" from the first render and the duplicate's first render before Generate Analysis (see "Check 11" above) |
| 12 | Layout | PASS | 1440×900 and 1024×768, 4 Inspector tabs each, all sections open, card chrome and ⋯ menu: 0 offenders (`macroclass_plot-12-1440-data.png`, `macroclass_plot-12-1024-data.png`); mock sweep PASS |

Auditor (Opus 5.5): OPEN – F2 R fix to run (button labels), F4 designer gap, #11 422 in console

Adversary (Astra): —

## subclass_plot · Time course · subclass (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | **FAIL → fixed (F1, F3)** | As macroclass_plot: `subclass_plot-1-before-generate.png` (generic 422 text, before F3), then `subclass_plot-1-draws.png`, `subclass_plot-1-zoomed-out.png` (frozen image) |
| 2 | Matches Team | PASS | Module render 620×550 (25 KB) = card 620×550 contained in 618×682 |
| 3 | Size | PASS | 620→780→390 px redrawn: `subclass_plot-3-larger.png`, `subclass_plot-3-smaller.png` |
| 4 | Data tab | **FAIL (F2, fix unrun) + gap F4** | 13 controls present; Plot Height 700 redrew; buttons `btn_del_case_case_740439/575616` (`subclass_plot-4-data-changed.png`) |
| 5 | Appearance | PASS | `subclass_plot-5-appearance.png` |
| 6 | Statistics | N/A | As above |
| 7 | Export | PASS | PNG 163 KB, card PDF 74 KB, SVG disabled with the reason; Team CSV `longitudinal_lipid main classes_GL_TAG.csv` 2.7 KB, PDF 6.5 KB (`subclass_plot-7-export-dialog.png`) |
| 8 | Finish | PASS | 423×700 snapshot; Edit figure → live (`subclass_plot-8-finished.png`) |
| 9 | Duplicate / remove / undo | PASS | Keeps `plotHeight=700`; needs Generate Analysis again; Undo restores (`subclass_plot-9-duplicate.png`) |
| 10 | Save and reopen | PASS | `subclass_plot-10-reopened.png`; deleted (200) |
| 11 | Console | **FAIL (open)** | 4 × 422 before Generate Analysis |
| 12 | Layout | PASS | 0 offenders at both sizes (`subclass_plot-12-1440-data.png`, `subclass_plot-12-1024-data.png`); sweep PASS |

Auditor (Opus 5.5): OPEN – F2 R fix to run, F4 designer gap, #11 422 in console

Adversary (Astra): —

## index_plot · Time course · functional index (png)

Screenshots are from the rerun after F3 (`results-index_plot.json`); the full run's results are in `results-all.json`.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | **FAIL → fixed (F1, F3)** | Rerun: the card says "Needs Generate Analysis …" with the button, state waiting (`index_plot-1-before-generate.png`); drawn after it (`index_plot-1-draws.png`, `index_plot-1-zoomed-out.png`) |
| 2 | Matches Team | PASS | Module render 620×550 (21 KB) = card; PE/PC Index trajectories |
| 3 | Size | PASS | `index_plot-3-larger.png`, `index_plot-3-smaller.png` |
| 4 | Data tab | **FAIL (F2, fix unrun) + gap F4** | 13 controls; Plot Height 700 redrew; raw-id buttons (`index_plot-4-data-changed.png`) |
| 5 | Appearance | PASS | `index_plot-5-appearance.png` |
| 6 | Statistics | N/A | As above |
| 7 | Export | PASS (note) | Full run: PNG 213 KB, Team CSV `PC_Index.csv` 4.3 KB, PDF 6.5 KB, card PDF 157 KB. Rerun: PNG 162 KB, card PDF 116 KB, but **no "More downloads from this analysis" group** this time (`index_plot-7-export-dialog.png`). Not explained in this round: to re-probe |
| 8 | Finish | PASS | Rerun snapshot 423×700. (Full run: 423×550, i.e. Plot Height 700 not on the snapshot; see #10) |
| 9 | Duplicate / remove / undo | PASS | Keeps `plotHeight=700`; duplicate state waiting with the button (F3) until Generate; Undo restores (`index_plot-9-duplicate.png`) |
| 10 | Save and reopen | PASS (rerun) / FAIL (full run) | Rerun: `plotHeight=700`, label, background kept (`index_plot-10-reopened.png`). Full run: "reopened plotHeight=550, saved 700". Not reproduced; with #8's 550 snapshot it suggests the 700 was lost once before saving. Open to watch |
| 11 | Console | **FAIL (open)** | 4 × 422 before Generate Analysis |
| 12 | Layout | PASS | 0 offenders (`index_plot-12-1440-data.png`, `index_plot-12-1024-data.png`); sweep PASS |

Auditor (Opus 5.5): OPEN – F2 R fix to run, F4 designer gap, #11 422 in console, #7/#10 nondeterminism to re-probe

Adversary (Astra): —

## struct_plot · Time course · structure (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | **FAIL → fixed (F1, F3)** | `struct_plot-1-before-generate.png` (before F3), `struct_plot-1-draws.png`, `struct_plot-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Module render 620×550 (23 KB) = card |
| 3 | Size | PASS | `struct_plot-3-larger.png`, `struct_plot-3-smaller.png` |
| 4 | Data tab | **FAIL (F2, fix unrun) + gap F4** | 13 controls; Plot Height 700 redrew; raw-id buttons (`struct_plot-4-data-changed.png`) |
| 5 | Appearance | PASS | `struct_plot-5-appearance.png` |
| 6 | Statistics | N/A | As above |
| 7 | Export | PASS | PNG 168 KB, card PDF 74 KB, SVG disabled with the reason; Team CSV `longitudinal_structural features_GL_TAG_-_Total_Carbons.csv` 4.0 KB, PDF 6.6 KB (`struct_plot-7-export-dialog.png`) |
| 8 | Finish | PASS | 423×700 (`struct_plot-8-finished.png`) |
| 9 | Duplicate / remove / undo | PASS | `struct_plot-9-duplicate.png` |
| 10 | Save and reopen | PASS | `struct_plot-10-reopened.png`; deleted (200) |
| 11 | Console | **FAIL (open)** | 4 × 422 before Generate Analysis |
| 12 | Layout | PASS | 0 offenders (`struct_plot-12-1440-data.png`, `struct_plot-12-1024-data.png`); sweep PASS |

Auditor (Opus 5.5): OPEN – F2 R fix to run, F4 designer gap, #11 422 in console

Adversary (Astra): —

## allmetrics_plot · Time course · all metrics (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | **FAIL → fixed (F1)**, then PASS (Team placeholder) | After F1 the card draws at once, without a 422: Team's own "No significance data available." (`allmetrics_plot-1-before-generate.png`, `allmetrics_plot-1-draws.png`, `allmetrics_plot-1-zoomed-out.png`). Team returns that ggplot when the significance ledger is empty (`R/modules/11_longitudinal_module.R:3460-3466`). The synthetic data have no significant transitions |
| 2 | Matches Team | PASS (placeholder) | Module render 620×550, 3.2 KB = the same placeholder |
| 3 | Size | PASS | `allmetrics_plot-3-larger.png`, `allmetrics_plot-3-smaller.png` |
| 4 | Data tab | **FAIL (F2, fix unrun) + gap F4** | 13 controls; Plot Height change re-rendered; raw-id buttons (`allmetrics_plot-4-data-changed.png`) |
| 5 | Appearance | PASS | `allmetrics_plot-5-appearance.png` |
| 6 | Statistics | N/A | As above |
| 7 | Export | FAIL (Team behaviour) | Team CSV `downloadCSV` ("all_significant_lipids", `R/modules/11_longitudinal_module.R:3902-3913`) returns 90 B, a header-only file, because the ledger is empty. This is consistent with the placeholder and not a Nexo defect. Card PNG and PDF fine |
| 8 | Finish | PASS | 423×550 snapshot (`allmetrics_plot-8-finished.png`) |
| 9 | Duplicate / remove / undo | PASS | Duplicate drawn at once (no run need) (`allmetrics_plot-9-duplicate.png`) |
| 10 | Save and reopen | PASS | `allmetrics_plot-10-reopened.png`; deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders (`allmetrics_plot-12-1440-data.png`, `allmetrics_plot-12-1024-data.png`); sweep PASS |

Auditor (Opus 5.5): OPEN – F2 R fix to run, F4 designer gap; plot only shows Team's placeholder on the synthetic data (no significant transitions), so it is not proven with data

Adversary (Astra): —

## Fixes (this task)

| Finding | Red | Green | Where |
|---|---|---|---|
| F1 time courses "Unavailable" (deState.timepoints ignored) | `6a3e0c2d` | `e0538fec` | `frontends/nexo/src/catalog.ts`, `api.ts`, `ui/AnalysisSettings.tsx` |
| F2 icon-only buttons named by id | `45d532a0` (R, unrun) | `1949cbb3` (R, unrun) | `R/frontends/api/schema.R`, `tests/dual-ui/test_api_schema_icon_buttons.R` |
| F3 card does not name Generate Analysis | `fcb4e35c` | `4090560e` | `frontends/nexo/src/runNeeds.ts`, `cards.ts` |

Script commits: `8465e564` (script), `7a526a78` (row 12 reads the reopened page's Inspector; row 11 keeps the first page's
console errors after the reopen. `audit_b03-qc-b.cjs` had the same defect, where `page.auditErrors` lived on the closed page).

## Open (for the coordinator / Gerardo)

1. Run the R tests for F2 (`test_api_schema_icon_buttons.R`, `test_api_schema_actions.R`) and deploy; then re-check #4.
2. F4: Team's time-course designer (sortable cohort buckets, per-item ×) has no Nexo control. This needs a decision on a
   bucket control and on `case_bucket_*` joining `allowedInputs` (`R/frontends/team/plot_instances.R`, outside this task's files).
3. Check 11: the expected 422 before Generate Analysis is logged by the browser; pick API (200 + needs) or client-side gating.
4. index_plot: the one-off loss of Plot Height 700 before save (full run #8/#10) and the missing Team downloads in the rerun (#7).
5. Presentation for the designer: the card's "Generate analysis" button uses the plain message-body button style (it reads
   as text, `macroclass_plot-1-run-need.png`). The Inspector status line can still say "Up to date" while the card says
   "Needs settings".

## Coordinator check (2026-11-08, integration of round 1)

- **F2 run on the RTX** (production tree). Red at `45d532a0`:
  `Error: identical(label("btn_del_case_case_1"), "Remove Timecourse 1") is not TRUE`. Green at the round's tip:
  `PASS icon-only buttons are named by their icon's action and the text beside them`; `test_api_schema_actions.R` all PASS.
