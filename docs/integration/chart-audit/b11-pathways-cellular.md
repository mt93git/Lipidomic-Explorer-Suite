# Chart audit · b11-pathways-cellular (Lipid pathways, cellular organization)

Auditor: Opus 5.5 (first round). Protocol: `docs/integration/nexo-chart-audit-plan.md`, checks 1–11 plus 12
"Layout" (1440×900 and 1024×768, every Inspector tab with every section open). Script:
`node tests/dual-ui/chart-audit/audit_b11-pathways-cellular.cjs [outputName …]` (Chromium, Vite :5191 started by
this task, audit API 127.0.0.1:3961, checkpoint `nexo-complete-synthetic`; saves `audit-b11-pathways-cellular-synthetic`
and deletes it). The script follows `audit_b03-qc-b.cjs` (same rows, same evidence names), built from
`audit_b10-longitudinal.cjs` (header-chrome Duplicate, row 12). Additions: controls found by input id; a visNetwork
signature (the live canvas) and row **1b network-pan** for pathwayVisNetwork. Raw results:
`b11-pathways-cellular/results-*.json`. Screenshots: `b11-pathways-cellular/<output>-<check>.png`.

Setup note: `~/nexo-vendor/vis` was copied to `public/vendor/vis/`, but the app loads
`<repo>/frontends/nexo/public/vendor/vis-network.min.js` (what `frontends/nexo/scripts/vendor-visnetwork.sh` writes).
The first pathwayVisNetwork run therefore began with "Network viewer unavailable. Run scripts/vendor-visnetwork.sh,
then reload." (`b11-pathways-cellular/pathwayVisNetwork-1-before-generate.png`). That message is correct, and it is
local setup, not a Nexo bug. The two files were copied to `public/vendor/` and the plot was re-run.

**Status (first round, 2026-11-08 00:34):** all five plots audited, 12 rows each plus row 1b for the network.
stressPlot, cpiPlot, polarPlot: AGREE. pathwayPlot, pathwayVisNetwork: OPEN (F1's R half unrun; F3).
Nexo fixes: F1 hidden state inputs (`06aafa87` red / `bd666d84` green; includes R), F2 network PNG/PDF export
(`dc66fab4` / `5ca23946`), F4 Legend section without a legend (`deb480f8` / `8a630f28`). Script commits:
`51ee82f3`, `0677e337`, `3d25abe6`, `a3269a0e`. The four run logs' results are in `b11-pathways-cellular/results-*.json`
(the final pathwayPlot run is `results-pathwayPlot.json`).

## stressPlot · Organelle stress proxies (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Drawn on add, no module action needed. Draft 100 % `b11-pathways-cellular/stressPlot-1-draws.png`; zoomed out (frozen tier image) `b11-pathways-cellular/stressPlot-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Module `POST …/render` 620×680 PNG (71 KB) for the same inputs; the card shows its own render 900×720, contained at 898×682: four violin panels (ER curvature, ER saturation, peroxisomal, plus the cohort panel), nothing cropped by Nexo |
| 3 | Size | PASS | 900→1060→648 px wide, redrawn each time, nothing overflows: `b11-pathways-cellular/stressPlot-3-larger.png`, `b11-pathways-cellular/stressPlot-3-smaller.png` |
| 4 | Data tab | PASS | All 15 controls in Team's markup are present, plus the run-time `selectedBaseline`. "Scatter Dot Size" (`pointSize`) 4 → 6 redrew (`b11-pathways-cellular/stressPlot-4-data-changed.png`). Invalid −1 refused with "Could not update the plot: Invalid value for pointSize: below the minimum 1" (`b11-pathways-cellular/stressPlot-4-data-invalid.png`) |
| 5 | Appearance | PASS | Image plot: Label, Background, Size, presets. No Plotly-only control that would silently do nothing; canvas Undo/Redo of the label (`b11-pathways-cellular/stressPlot-5-appearance.png`) |
| 6 | Statistics | N/A | No Statistics tab in Team for this module (its significance format is a Data control); the tab says "Statistics are available for independent violin copies." |
| 7 | Export | PASS | Card PNG 710 KB; SVG disabled with the reason "This figure is a raster image; SVG is not available."; Team CSV `subcellular_stress_metrics_….csv` 9.7 KB and Team PDF 57 KB; card PDF 582 KB (`b11-pathways-cellular/stressPlot-7-export-dialog.png`) |
| 8 | Finish | PASS | Snapshot 702×498 in a 700×460 body; Edit figure returns the live PNG (`b11-pathways-cellular/stressPlot-8-finished.png`) |
| 9 | Duplicate / remove / undo | PASS | The duplicate (header-chrome Duplicate) keeps `pointSize=6` and the label; remove + Undo brings it back drawn (`b11-pathways-cellular/stressPlot-9-duplicate.png`) |
| 10 | Save and reopen | PASS | Saved `audit-b11-pathways-cellular-synthetic` and reopened it in a new page: label, `pointSize=6` and background kept (`b11-pathways-cellular/stressPlot-10-reopened.png`). Checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at 1440×900 and 1024×768, all 4 tabs with every section open, plus the card chrome and its ⋯ menu (`b11-pathways-cellular/stressPlot-12-1440-data.png`, `b11-pathways-cellular/stressPlot-12-1024-data.png`) |

Findings:
- Presentation note (Team's own output, not changed): in the bottom panel the first letter of the title "Organelle
  stress profile comparisons across cohorts" is cut at the left edge ("rganelle…", `b11-pathways-cellular/stressPlot-1-draws.png`).
  It is inside the module's PNG (`R/modules/14_cellular_org_module.R:855`, the patchwork title), so it goes to the designer and Max as a proposal.
- A first run timed out on row 4: the script filled `pointSize` before opening the Data tab's sections. Row 4 now opens
  them first (script commit `3d25abe6`). This was not a Nexo defect.

Auditor (Opus 5.5): AGREE

## pathwayPlot · Lipid pathway map (plotly)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Drawn on add. Draft 100 % `b11-pathways-cellular/pathwayPlot-1-draws.png`; zoomed out (frozen tier image) `b11-pathways-cellular/pathwayPlot-1-zoomed-out.png` |
| 2 | Matches Team | PASS | The same 5 `scatter` traces as the module's own `POST …/render`; title "Lipid Pathway Map" (size 20); nodes, ΔC labels and the "Saturation Change (Z-score)" colour bar as Team draws them |
| 3 | Size | PASS (4 of 5 runs) | 620→780→390 px, redrawn each time (`b11-pathways-cellular/pathwayPlot-3-larger.png`, `b11-pathways-cellular/pathwayPlot-3-smaller.png`). One run reported "4 element(s) overflow the card body", but its screenshot shows the card mid re-render ("Loading figure…") with nothing outside it. The count was taken between Plotly's relayout and the API render at the new width: a timing issue in the measurement, with no visible defect |
| 4 | Data tab | PASS (after fix F1) | All 27 controls in Team's markup are present, and so are Team's run-time controls (`active_classes_select` "Classes to Display", `move_node_select`, `edge_to_remove`, `add_edge_source`, `add_edge_target`) and the module actions (presets Default (18) / All (28) / Scratch, Move Node, Add Custom Node, Remove/Add Edge). "Map Node Color to" → Log2 Fold Change redrew (`b11-pathways-cellular/pathwayPlot-4-data-changed.png`). Selects and radios only, so there is no free value to refuse. Defect F1, below |
| 5 | Appearance | **PASS after fix F4** | Final run: Label; Background; Plot title on the plot; Base size 16 and text colour #aa0000 on the plot; plot background #f0f0ff; 6 palettes → 6 distinct colourings; Healthy in grey; grid toggle; Undo/Redo; Reset → "Lipid Pathway Map" (`b11-pathways-cellular/pathwayPlot-5-appearance.png`). Earlier runs: (a) the script looked for "Chart font size", which F3 Typography now calls "Base size" (`frontends/nexo/src/ui/PlotEditor/Typography.tsx:15`; script fixed in `a3269a0e`, not a Nexo defect); (b) "legend position not applied": defect F4. Orientation is enabled (the map's traces are cartesian `scatter`) |
| 6 | Statistics | N/A | Team has no Statistics tab for the pathway module (its significance markers are Data controls); the tab says "Statistics are available for independent violin copies." |
| 7 | Export | PASS | Card PNG 238 KB, SVG 37 KB, card PDF 134 KB; Team CSV `Lipid_Pathway_Visualization_Data_….csv` 2.3 KB and Team PDF 4.2 KB (`b11-pathways-cellular/pathwayPlot-7-export-dialog.png`). In the first run SVG read as disabled because the script checked it while the PNG download still held the buttons busy; the script now waits for that |
| 8 | Finish | PASS | Snapshot 423×460 in a 421×460 body; Edit figure returns the live plotly (`b11-pathways-cellular/pathwayPlot-8-finished.png`) |
| 9 | Duplicate / remove / undo | PASS | The duplicate keeps `node_color_map=fc` and the label; remove + Undo brings it back drawn (`b11-pathways-cellular/pathwayPlot-9-duplicate.png`) |
| 10 | Save and reopen | PASS | Reopened: label, `node_color_map=fc` and background kept (`b11-pathways-cellular/pathwayPlot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors (all five runs) |
| 12 | Layout | PASS | 0 offenders at 1440×900 and 1024×768, all 4 tabs with every section open, card chrome and ⋯ menu (`b11-pathways-cellular/pathwayPlot-12-1440-data.png`, `b11-pathways-cellular/pathwayPlot-12-1024-data.png`) |

Findings:
- **F1 (Nexo bug, fixed; the R part is not run here):** the Data tab of both pathway plots shows five unlabelled text
  boxes holding raw JSON (`["TG","DG",…]`, `{}`, `[]`, `[]`, `{}`), visible in `b11-pathways-cellular/pathwayVisNetwork-1b-network-pan.png`.
  They are Team's state carriers `active_classes_json`, `custom_nodes_json`, `added_edges_json`, `removed_edges_json`
  and `position_overrides_json`, kept in a `display: none` div that Team never shows (`R/modules/13_pathway_module.R:70-77`).
  Typing in one rewrites the pathway layout without any validation in view. Fix: `R/frontends/api/schema.R` marks a labelless
  text/textarea input inside a `display:none` block `hidden` (a dashboard selection bar's hidden wire input stays shown),
  and Nexo's `formControls` draws no field for a hidden control. The value is still sent and saved.
  Red `06aafa87` (`AssertionError: expected [ 'active_classes_json', …(2) ] to deeply equal [ 'classLabelFormat' ]`,
  `Tests 1 failed | 5 passed (6)`), green `bd666d84` (vitest `Test Files 100 passed (100)`, `Tests 462 passed (462)`, tsc
  clean; `test_nexo_inspector.cjs` 40 PASS / 0 FAIL, `test_nexo_card_chrome.cjs` 29 PASS / 0 FAIL).
  **The R test `tests/dual-ui/test_api_schema_hidden.R` and the `schema.R` change could not be run on the M1 (no R):
  the coordinator must run them.** Until the API runs this change, the audit API (aad45f68) does not send `hidden`, so the boxes still show there.
  Row 4 of the script skips catalog inputs marked `hidden` (Team does not show them either).
- **F4 (Nexo bug, fixed):** Team's map sets `showlegend = FALSE` on every trace and in the layout (its key is a colour
  bar; `R/modules/13_pathway_module.R:1369-1522`). Nexo's Appearance still offered the Legend section, whose nine
  positions and "Show legend" silently did nothing ("legend position not applied"). `PlotEditor.tsx` now shows the
  Legend section only if some trace can appear in a legend; a legend hidden only at layout level keeps it.
  Red `deb480f8` (`AssertionError: expected '<div class="plot-editor">…' not to contain 'aria-label="Legend position"'`,
  `Tests 1 failed | 2 passed (3)`), green `8a630f28` (vitest `Tests 465 passed (465)`, tsc clean; inspector 40/0,
  card chrome 29/0; pathwayPlot on the real API: 12 checks, 0 failed).
- **F3 (Nexo gap, OPEN, not fixed in this round):** in its "Options & Configuration" section, Team offers
  "Download Layout JSON" (`download_config`) and "Upload Layout JSON (.json)" (`upload_config`, a fileInput)
  (`R/modules/13_pathway_module.R:171-173`). Nexo has neither. The upload is not in the card's `allowedInputs`
  (built in `R/frontends/team/plot_instances.R`, outside what this task may edit). The download sits in the sidebar,
  not next to the plot, so `api_card_downloads` (`R/frontends/api/export.R:137`, nearest download links around the plot)
  does not list it. The same applies to pathwayVisNetwork. Decision needed: list the module's configuration downloads
  as well, and accept a file input in the Data tab.
  **Fix (topic pathway-layout-json, Opus 5.5, R half unrun):** generic rule (`R/frontends/api/export.R`
  `api_config_id`): in a module's static UI, a download link or file input whose id ends in `config` is a configuration
  control of every card of that module; today that picks up only pathway_tab `download_config` and `upload_config`.
  `api_card_downloads` appends those downloads (Team's label "Download Layout JSON", served by the module's own
  downloadHandler, `application/json`), so the Export tab lists it. The card schema carries `uploads`
  (id, Team's label "Upload Layout JSON (.json):", accept `.json`); the Data tab shows a file input, and
  `POST /api/v1/sessions/<id>/cards/<instanceId>/uploads/upload_config` ({name, content}) accepts a `.json` file of at
  most 256 KiB that parses (`jsonlite::parse_json`, text only), writes it to a temp file and sets the module's input to Shiny's fileInput data.frame
  (name, size, type, datapath); Team's own observer applies it to its `*_json` layout inputs, which are in
  `allowedInputs`, so the layout is saved with the instance and a Nexo checkpoint opens in Team with it. A file that
  does not parse gets 400 with Team's message ("Error loading layout JSON: ..."); a non-.json name, an oversized file or
  an unknown input id get 400. Nexo's member keeps the uploaded file (`nexo.nodes[<id>].inputs.upload_config =
  {name, content}`), carried to a duplicate and saved/reopened with the checkpoint, never re-sent (the instance inputs
  already hold the layout). Tests: `tests/dual-ui/test_api_pathway_layout_json.R` (unrun here, no R on the M1),
  `frontends/nexo/src/state/layoutUpload.test.ts`, `tests/dual-ui/test_nexo_pathway_layout_json.cjs`;
  evidence `docs/integration/nexo-phase1-evidence/h9/pathway-layout-json/`.

Auditor (Opus 5.5): OPEN – F1's R half (schema.R + test_api_schema_hidden.R) not run here, for the coordinator, and until then the JSON boxes still show on the live API; F3 (Team's layout JSON download/upload missing in Nexo)

## pathwayVisNetwork · Interactive pathway network (visnetwork)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Team's visNetwork is drawn live by vis-network in the card: Draft 100 % `b11-pathways-cellular/pathwayVisNetwork-1-draws.png`; zoomed out it becomes the frozen tier image of the drawn network, `b11-pathways-cellular/pathwayVisNetwork-1-zoomed-out.png`. Run 2 began with "Network viewer unavailable…" because of the vendor setup (see the note at the top); run 4 drew on add |
| 1b | Pans inside the card | PASS | A drag of 90,−50 px inside the network pans the network view; its own zoom-in button zooms it. The canvas world transform (`translate(-300px, 24px) scale(1)`) and the card position do not change (`b11-pathways-cellular/pathwayVisNetwork-1b-network-pan.png`). The mouse wheel over the network scrolls the canvas (world → `translate(-300px, 324px)`), as designed and documented in `frontends/nexo/src/network/visData.ts:21-29` (canvas owns the wheel, `zoomView: false`, Team's navigation buttons kept) |
| 2 | Matches Team | PASS | The module's `POST …/render` gives 18 nodes / 17 edges; the card draws them on a 618×682 canvas (non-blank, 9 405 inked samples). Team's options otherwise unchanged (physics, navigation buttons, tooltips as text) |
| 3 | Size | PASS | 620→780→390 px wide; the network is redrawn at each size (`b11-pathways-cellular/pathwayVisNetwork-3-larger.png`, `b11-pathways-cellular/pathwayVisNetwork-3-smaller.png`) |
| 4 | Data tab | PASS (after F1) | The same 27 markup controls, run-time controls and module actions as pathwayPlot. "Map Node Color to" → Log2 Fold Change redrew the network (`b11-pathways-cellular/pathwayVisNetwork-4-data-changed.png`). The JSON-box defect F1 applies here too (visible in `b11-pathways-cellular/pathwayVisNetwork-1b-network-pan.png`) |
| 5 | Appearance | PASS | Network card: Label, Background, Size only, with no Plotly controls that would do nothing on a network (`b11-pathways-cellular/pathwayVisNetwork-5-appearance.png`); canvas Undo/Redo of the label |
| 6 | Statistics | N/A | No Statistics tab in Team |
| 7 | Export | **PASS after fix F2** | Before the fix, Download PNG gave no file in 180 s (`page.waitForEvent: Timeout 180000ms exceeded while waiting for event "download"`). After it: card PNG 329 KB and card PDF 160 KB; SVG disabled with "This figure is a raster image; SVG is not available."; Team registers no download next to the network (`b11-pathways-cellular/pathwayVisNetwork-7-export-dialog.png`) |
| 8 | Finish | PASS | Snapshot 421×460 in a 421×460 body (the canvas image, as `cards.ts` takes it); Edit figure returns the live network (`b11-pathways-cellular/pathwayVisNetwork-8-finished.png`) |
| 9 | Duplicate / remove / undo | PASS | The duplicate keeps `node_color_map=fc`; remove + Undo brings it back drawn (`b11-pathways-cellular/pathwayVisNetwork-9-duplicate.png`) |
| 10 | Save and reopen | PASS | Reopened: label, `node_color_map=fc` and background kept, network drawn (`b11-pathways-cellular/pathwayVisNetwork-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at 1440×900 and 1024×768 (`b11-pathways-cellular/pathwayVisNetwork-12-1440-data.png`, `b11-pathways-cellular/pathwayVisNetwork-12-1024-data.png`) |

Findings:
- **F2 (Nexo bug, fixed):** the Inspector's Download PNG (and so PDF) of a live network card produced no file.
  `imageSource` (`frontends/nexo/src/ui/Dialogs/ExportDialog.tsx`) looked only for the card's `<img>` and threw "Wait for
  the figure to load.", but a live network card draws on a `.network canvas`. It now falls back to that canvas, as
  Finish already did (`cards.ts`). Red `dc66fab4` (`TypeError: imageSource is not a function`, `Tests 2 failed (2)`), green `5ca23946` (vitest `Tests 464 passed (464)`,
  tsc clean; `test_nexo_inspector.cjs` 40 PASS / 0 FAIL, `test_nexo_card_chrome.cjs` 29 PASS / 0 FAIL).
- F1 and F3 (pathwayPlot section) apply to this card as well.

Auditor (Opus 5.5): OPEN – F1's R half unrun (coordinator); F3 (layout JSON download/upload missing)

## cpiPlot · Peroxidation index (CPI) (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Drawn on add: `b11-pathways-cellular/cpiPlot-1-draws.png`; zoomed out (frozen tier image) `b11-pathways-cellular/cpiPlot-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Module `POST …/render` 620×680 PNG (38 KB) for the same inputs; the card shows its own render 620×720, contained at 618×682, nothing cropped. The card opens on Team's sub-tab "Peroxidation Proxy (CPI)" (`org_tabs`) |
| 3 | Size | PASS | 620→780→390 px, redrawn each time (`b11-pathways-cellular/cpiPlot-3-larger.png`, `b11-pathways-cellular/cpiPlot-3-smaller.png`) |
| 4 | Data tab | PASS | All 15 markup controls plus the run-time `selectedBaseline`. `pointSize` 4 → 6 redrew (`b11-pathways-cellular/cpiPlot-4-data-changed.png`). Invalid −1 refused with "Could not update the plot: Invalid value for pointSize: below the minimum 1"; the plot is not redrawn (`b11-pathways-cellular/cpiPlot-4-data-invalid.png`) |
| 5 | Appearance | PASS | Image plot: Label, Background, Size, presets; canvas Undo/Redo (`b11-pathways-cellular/cpiPlot-5-appearance.png`) |
| 6 | Statistics | N/A | No Statistics tab in Team; significance format is a Data control |
| 7 | Export | PASS | Card PNG 336 KB, card PDF 164 KB; SVG disabled with its reason; Team CSV `cpi_ferroptosis_vulnerability_….csv` 1.3 KB, Team PDF 18 KB (`b11-pathways-cellular/cpiPlot-7-export-dialog.png`) |
| 8 | Finish | PASS | Snapshot 423×498 in a 421×460 body; Edit figure returns the live PNG (`b11-pathways-cellular/cpiPlot-8-finished.png`) |
| 9 | Duplicate / remove / undo | PASS | The duplicate keeps `pointSize=6`; remove + Undo brings it back drawn (`b11-pathways-cellular/cpiPlot-9-duplicate.png`) |
| 10 | Save and reopen | PASS | Reopened with label, `pointSize=6` and background (`b11-pathways-cellular/cpiPlot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at 1440×900 and 1024×768 (`b11-pathways-cellular/cpiPlot-12-1440-data.png`, `b11-pathways-cellular/cpiPlot-12-1024-data.png`) |

Auditor (Opus 5.5): AGREE

## polarPlot · Storage vs structural map (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Drawn on add: "Lipidomic Phenotypic Trajectory Map", quadrants, Control/Treatment legend (`b11-pathways-cellular/polarPlot-1-draws.png`); zoomed out (frozen tier image) `b11-pathways-cellular/polarPlot-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Module `POST …/render` 620×680 PNG (48 KB); the card shows its own render 620×720, contained at 618×682; sub-tab "M1/M2 Lipid Proxy (Exploratory)" |
| 3 | Size | PASS | 620→780→390 px, redrawn each time (`b11-pathways-cellular/polarPlot-3-larger.png`, `b11-pathways-cellular/polarPlot-3-smaller.png`) |
| 4 | Data tab | PASS | All 15 markup controls plus `selectedBaseline`. "Scatter Dot Size" 4 → 6 redrew (`b11-pathways-cellular/polarPlot-4-data-changed.png`). Invalid −1 refused with "Could not update the plot: Invalid value for pointSize: below the minimum 1" (`b11-pathways-cellular/polarPlot-4-data-invalid.png`) |
| 5 | Appearance | PASS | Image plot: Label, Background, Size, presets; canvas Undo/Redo (`b11-pathways-cellular/polarPlot-5-appearance.png`) |
| 6 | Statistics | N/A | No Statistics tab in Team |
| 7 | Export | PASS | Card PNG 439 KB, card PDF 383 KB; SVG disabled with its reason; Team CSV `phenotypic_polarization_scores_….csv` 2.3 KB, Team PDF 7.2 KB (`b11-pathways-cellular/polarPlot-7-export-dialog.png`) |
| 8 | Finish | PASS | Snapshot 423×498 in a 421×460 body; Edit figure returns the live PNG (`b11-pathways-cellular/polarPlot-8-finished.png`) |
| 9 | Duplicate / remove / undo | PASS | The duplicate keeps `pointSize=6`; remove + Undo brings it back drawn (`b11-pathways-cellular/polarPlot-9-duplicate.png`) |
| 10 | Save and reopen | PASS | Reopened with label, `pointSize=6` and background (`b11-pathways-cellular/polarPlot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at 1440×900 and 1024×768 (`b11-pathways-cellular/polarPlot-12-1440-data.png`, `b11-pathways-cellular/polarPlot-12-1024-data.png`) |

Note: when an invalid value is refused, the card status reads `error` until a valid value is entered (the message
says why); the previous plot stays visible. This is the same behaviour as in earlier batches, not a defect.

Auditor (Opus 5.5): AGREE

## Mock layout sweep (check 12)

`NEXO_PLOTLY_JS=<repo>/frontends/nexo/public/vendor/plotly.min.js NEXO_SWEEP_ONLY=pathway_tab-pathwayPlot,pathway_tab-pathwayVisNetwork,cellular_org_tab-stressPlot,cellular_org_tab-cpiPlot,cellular_org_tab-polarPlot node tests/dual-ui/test_nexo_layout_sweep.cjs`
(run after both fixes), last lines:

```
PASS chromium:1024x768 cellular_org_tab-stressPlot
PASS chromium:1024x768 cellular_org_tab-cpiPlot
PASS chromium:1024x768 cellular_org_tab-polarPlot
PASS chromium:390x844 phone
SUMMARY offenders=0 sources=5 engines=chromium
exit 0
```

## Coordinator check (2026-11-08, integration of round 1)

- **F1 R half run on the RTX.** The test's selection-bar fixture carried `data-selection-input="1"`; Team's markup
  (and `api_schema_from_doc`, which keeps only bars whose attribute starts with the card prefix) uses the full input
  id, so the fixture now says `"p-sel"`. Red against the schema before this round:
  `Error: isTRUE(by_id$active_classes_json$hidden) is not TRUE`. Green with the round's `schema.R`: the three PASS
  lines (hidden carriers, labelled/visible controls, dashboard selection bars stay shown).
- Merged with b06's group-comparison token rule: `formControls` drops a control the API marks `hidden` or Team's
  known carrier `gc_baseline_confirmation`.

## Round 2 (2026-11-08, API 96b8742d)

Auditor: Opus 5.5, round 2. API `http://127.0.0.1:3961` (`/api/v1/health` → commit `96b8742d`), app from this branch on
Vite :5286, checkpoint `nexo-complete-synthetic` only. Script
`NEXO_AUDIT_BASE=http://127.0.0.1:5286 node tests/dual-ui/chart-audit/audit_b11-pathways-cellular.cjs pathwayPlot pathwayVisNetwork`.
This round adds check **4b "layout-json"** (F1 + F3): no visible `*_json` box in the Data tab; Export → "Download
Layout JSON" (parsed); Team's Move Node (first node, X 123, Y −45) changes `position_overrides_json` and redraws;
upload the downloaded file into "Upload Layout JSON (.json):" and the layout returns; a `.csv` and a 300 KiB `.json`
are refused with a message. `AUDIT_DEBUG=1` logs card requests. Raw results: `b11-pathways-cellular/results-pathwayPlot_pathwayVisNetwork.json`.

API check by hand (one session, closed afterwards), pathway_tab-pathwayPlot on the live API:
`GET …/cards/<id>/schema` → `uploads = []`; the five carriers `active_classes_json`, `custom_nodes_json`,
`added_edges_json`, `removed_edges_json`, `position_overrides_json` all `hidden: true`; `GET …/downloads` →
`downloadPlotCSV, downloadPlotPDF, download_config`.

### pathwayPlot · Lipid pathway map (plotly), round 2

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Drawn on add: `b11-pathways-cellular/pathwayPlot-1-draws.png`; zoomed out (frozen tier image) `b11-pathways-cellular/pathwayPlot-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Same 5 `scatter` traces as the module's own render; title "Lipid Pathway Map" (size 20) |
| 3 | Size | PASS | 620→780→390 px, redrawn each time: `b11-pathways-cellular/pathwayPlot-3-larger.png`, `b11-pathways-cellular/pathwayPlot-3-smaller.png` |
| 4 | Data tab | PASS (after fix R2-F1, b04) | 27 markup controls + Team's run-time controls (`active_classes_select`, `move_node_select`, `edge_to_remove`, `add_edge_source`, `add_edge_target`) + module actions; "Map Node Color to" → `fc`: PATCH `{"node_color_map":"fc"}`, reply `node_color_map=fc` (`b11-pathways-cellular/pathwayPlot-4-data-changed.png`). Before R2-F1 the change was lost (duplicate/reopen read `sat_zscore`) |
| 4b-F1 | Hidden JSON carriers | **PASS (F1 live)** | No `*_json` box in the Data tab with every section open (`b11-pathways-cellular/pathwayPlot-4b-layout-moved.png`); the API marks all five `hidden: true` |
| 4b-F3 | Layout JSON download / upload | **FAIL → fixed (R, not run here)** | Download PASS: Export lists Team's "Download Layout JSON", `pathway_layout_config.json` 240 B parses (18 active classes, overrides `[]`). Move Node PASS: TG → (123,−45), layout input `{"TG":[123,-45]}`, redrawn (`b11-pathways-cellular/pathwayPlot-4b-layout-moved.png`, TG at the far right). **Upload FAIL (`b11-pathways-cellular/pathwayPlot-4b-layout-no-upload.png`): the Data tab has no "Upload Layout JSON (.json):" field; the API's card schema says `uploads=[]`** (R2-F3). So upload, layout return and the `.csv` / >256 KiB refusals could not run live. Frontend half on the mock (`test_nexo_pathway_layout_json.cjs`, chromium + webkit): 12 PASS (export lists and parses the layout, upload redraws and keeps the layout, Team's message for a broken file, `.csv` → "Upload a .json file.", Undo/Redo, duplicate, no console errors); the 256 KiB limit is unit-tested (`frontends/nexo/src/state/layoutUpload.test.ts:18`, "The file is larger than 256 KiB.") |
| 5 | Appearance | PASS | Label, Background, title, Base size 16 and colour #aa0000, plot bg #f0f0ff, 6 palettes → 6 colourings, Healthy in grey, grid, orientation, Undo/Redo, Reset → "Lipid Pathway Map" (`b11-pathways-cellular/pathwayPlot-5-appearance.png`) |
| 6 | Statistics | N/A | Team has no Statistics tab for the pathway module |
| 7 | Export | PASS | Card PNG 213 373 B, SVG 37 286 B, card PDF 123 236 B; Team CSV 2 327 B, Team PDF 4 224 B, **Team "Download Layout JSON" 264 B** (`b11-pathways-cellular/pathwayPlot-7-export-dialog.png`) |
| 8 | Finish | PASS | Snapshot 423×460 in a 421×460 body; Edit figure → live plotly (`b11-pathways-cellular/pathwayPlot-8-finished.png`) |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps `node_color_map=fc` (after R2-F1 and R2-F4; before them it read `sat_zscore`); remove + Undo restores it drawn (`b11-pathways-cellular/pathwayPlot-9-duplicate.png`) |
| 10 | Save and reopen | PASS | Reopened with label, `node_color_map=fc` and background (`b11-pathways-cellular/pathwayPlot-10-reopened.png`); `audit-b11-pathways-cellular-synthetic` deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at 1440×900 and 1024×768, 4 tabs each, card chrome (`b11-pathways-cellular/pathwayPlot-12-1440-data.png`, `b11-pathways-cellular/pathwayPlot-12-1024-data.png`); mock sweep below |

Findings:
- **R2-F3 (Nexo API bug, fixed in R, not run on the M1):** the layout upload never reached the Data tab on the real
  API. `api_card_schema` (`R/frontends/api/schema.R:280`) lists a card's file inputs only if
  `api_card_upload_controls` exists, but that function lives in `export.R`, which `run.R` does not load with its
  engine files: only `plumber.R` sources it, with `local = TRUE` (the router's environment). So the served schema
  always said `uploads = []`, while `tests/dual-ui/test_api_pathway_layout_json.R` passed because it loads `engine.R`,
  which does load `export.R`. Fix: `run.R` adds `export.R` to `api_engine_files` (render workers boot with the same list).
  Red `4393ec5` (`tests/dual-ui/test_api_run_engine_uploads.R` loads the engine from run.R's own list; expected red
  `Error: pathway_tab-pathwayPlot: the schema served by run.R's engine lists uploads [], not upload_config`),
  green `9b9434d`. **Not run (no R on the M1): coordinator runs `Rscript tests/dual-ui/test_api_run_engine_uploads.R` and
  `test_api_pathway_layout_json.R`, restarts the audit API, then re-runs check 4b** (the upload, the layout returning and
  the `.csv` / 300 KiB refusals live).
- R2-F1 (b04 section): a Data change just before leaving the Data tab was dropped. Here `node_color_map=fc` was
  lost in every pre-fix run (checks 9/10 read `sat_zscore`); after `9fd674f` the PATCH goes out when 4b leaves the tab
  and duplicate/reopen keep `fc` (`AUDIT_DEBUG` trace: every PATCH reply `node_color_map=fc`). Script note: check 4's "redrew" was satisfied before the PATCH was sent (debug log),
  so it is a weak signal for a redraw; the duplicate/reopen values are the real proof.

- **R2-F4 (Nexo bug, fixed):** after R2-F1, pathwayVisNetwork still lost `fc`. `AUDIT_DEBUG` trace: PATCH
  `{"node_color_map":"fc"}` → reply `fc`; back on the Data tab the form remounted from the schema cached at first read
  (`sat_zscore`), and the next submit before Move Node sent `{"node_color_map":"sat_zscore"}` (reply `sat_zscore`).
  The Data tab's schema cache never took the values the server confirmed. Fix: the cache moves to
  `frontends/nexo/src/ui/Inspector/schemaCache.ts` and `DataTab` writes each confirmed PATCH's inputs into it (`cacheInputs`).
  Red `3e0d3e1` (`npx vitest run src/ui/Inspector/schemaCache.test.ts`: `Error: Cannot find module './schemaCache'`,
  `Test Files 1 failed (1)`), green `c11f276` (vitest 121 files / 565 tests passed, `tsc --noEmit` clean,
  `test_nexo_inspector.cjs` 44 PASS / 0 FAIL, `test_nexo_card_chrome.cjs` 29 PASS / 0 FAIL). Live re-run after it: both
  pathway plots keep `fc` through duplicate and reopen; `AUDIT FAIL: 27 checks, 2 failed`, the two being 4b (R2-F3 only).

Auditor (Opus 5.5): OPEN – F1 live (PASS); F3 download and Move Node pass, but the upload is missing on the live API until R2-F3 (R, unrun) is deployed

### pathwayVisNetwork · Interactive pathway network (visnetwork), round 2

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `b11-pathways-cellular/pathwayVisNetwork-1-draws.png`, `b11-pathways-cellular/pathwayVisNetwork-1-zoomed-out.png` |
| 1b | Pans inside the card | PASS | A drag of 90,−50 pans the network and its zoom button zooms it; the canvas transform and the card do not move; the wheel scrolls the canvas, by design (`b11-pathways-cellular/pathwayVisNetwork-1b-network-pan.png`) |
| 2 | Matches Team | PASS | Module render 18 nodes / 17 edges, drawn on a 618×682 canvas (10 986 inked samples) |
| 3 | Size | PASS | 620→780→390 px, redrawn each time (`b11-pathways-cellular/pathwayVisNetwork-3-larger.png`, `-3-smaller.png`) |
| 4 | Data tab | PASS (after R2-F1) | Same controls and actions as pathwayPlot; "Map Node Color to" → `fc` redrew (`b11-pathways-cellular/pathwayVisNetwork-4-data-changed.png`) |
| 4b-F1 | Hidden JSON carriers | **PASS (F1 live)** | No `*_json` box in the Data tab (`b11-pathways-cellular/pathwayVisNetwork-4b-layout-moved.png`) |
| 4b-F3 | Layout JSON download / upload | **FAIL → fixed (R, not run here)** | Download 240 B parses; Move Node TG → (123,−45) changes the layout and redraws (`b11-pathways-cellular/pathwayVisNetwork-4b-layout-moved.png`); no upload field, `uploads=[]` (R2-F3, same as pathwayPlot) |
| 5 | Appearance | PASS | Network card: Label, Background, Size only; canvas Undo/Redo (`b11-pathways-cellular/pathwayVisNetwork-5-appearance.png`) |
| 6 | Statistics | N/A | No Statistics tab in Team |
| 7 | Export | PASS | Card PNG 88 791 B, card PDF 49 022 B; SVG disabled with "This figure is a raster image; SVG is not available."; Team CSV 2 327 B, Team PDF 4 224 B, Team "Download Layout JSON" 264 B (`b11-pathways-cellular/pathwayVisNetwork-7-export-dialog.png`) |
| 8 | Finish | PASS | Snapshot 421×460 in a 421×460 body; Edit figure → live network (`b11-pathways-cellular/pathwayVisNetwork-8-finished.png`) |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps `node_color_map=fc` (after R2-F1 and R2-F4); remove + Undo restores it drawn (`b11-pathways-cellular/pathwayVisNetwork-9-duplicate.png`) |
| 10 | Save and reopen | PASS | Reopened with label, `node_color_map=fc` and background, network drawn (`b11-pathways-cellular/pathwayVisNetwork-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at 1440×900 and 1024×768 (`b11-pathways-cellular/pathwayVisNetwork-12-1440-data.png`, `-12-1024-data.png`) |

Findings: R2-F3, R2-F1 and R2-F4 as for pathwayPlot (R2-F4 was first seen on this card).

Auditor (Opus 5.5): OPEN – F1 live (PASS); F3 upload missing on the live API until R2-F3 (R, unrun) is deployed

### Mock layout sweep (round 2, both batches)

`NEXO_PLOTLY_JS=<repo>/frontends/nexo/public/vendor/plotly.min.js NEXO_SWEEP_ONLY=barchart-donutPlotUnfiltered,barchart-donutPlotFiltered,pathway_tab-pathwayPlot,pathway_tab-pathwayVisNetwork node tests/dual-ui/test_nexo_layout_sweep.cjs` (exit 0), last lines:

```
PASS chromium:1024x768 barchart-donutPlotUnfiltered
PASS chromium:1024x768 barchart-donutPlotFiltered
PASS chromium:1024x768 pathway_tab-pathwayPlot
PASS chromium:1024x768 pathway_tab-pathwayVisNetwork
PASS chromium:390x844 phone
SUMMARY offenders=0 sources=4 engines=chromium
```

### Checkpoints (round 2)

`GET /api/v1/checkpoints`: no `audit-b11-*` checkpoint is left (each run deleted its own, 200). The `autosave`
entries are not `audit-*` names and were left alone.
