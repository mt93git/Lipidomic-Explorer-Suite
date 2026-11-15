# Chart audit · b07-structure (Structural analysis)

Auditor: Opus 5.5. Round 1. Protocol: `docs/integration/nexo-chart-audit-plan.md` (checks 1–11) plus check 12
"Layout". Script: `node tests/dual-ui/chart-audit/audit_b07-structure.cjs [outputName …]` (Chromium 1440×900, Vite
:5187 started by this task, audit API 127.0.0.1:3961, checkpoint `nexo-complete-synthetic` only; saves
`audit-b07-structure-synthetic` and deletes it after each plot, all deletes answered 200). Raw results:
`b07-structure/results-*.json`. Screenshots: `b07-structure/<output>-<check>.png` (all ≤ 400 KB).

**Status (round 1, 2026-11-07 23:12–23:55):** all five plots reached. 1 AGREE (diffAcylPlot), 4 OPEN.

| Plot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | Auditor |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| summaryPlot | P | P | P | P* | P | N/A | **F** | **F** | P* | **F** | **F** | P | OPEN (F2, F3) |
| speciesPlotPlot | **F** | – | – | – | – | – | – | – | – | – | **F** | – | OPEN (F4) |
| networkPlot | P† | P | P | P | P | N/A | P* | P | P | P | P | P | OPEN (F1 to run, F5) |
| propPlotPlot | P | P* | P | P* | P | N/A | P | P* | P | P | P | P | OPEN (F6) |
| diffAcylPlot | P | P | P | P | P | N/A | P | P | P | P | P | P | AGREE |

P = PASS, F = FAIL, * = see the plot's notes, † = after confirming the design (F1), – = not reached.

How the plots are reached, as a user: Summary, Species and Acyl chain remodeling are `needs: "de"`; the Library
shows "Confirm study design…" on them; the script confirms (Experimental unit Animal, Sample relationship
independent) and then adds the plot. Summary, Species and the network only draw after the module's own
"Initiate Structural Analysis" (a Data-tab module action); before it the card shows Team's placeholder
"Click 'Initiate Structural Analysis' in the left sidebar…" (`speciesPlotPlot-1-before-actions.png`). The script
clicks it in the Inspector and proves the card redraws (`<output>-1-before-actions.png` → `<output>-1-draws.png`).

Mock layout sweep (check 12, mock):
`NEXO_PLOTLY_JS=<repo>/frontends/nexo/public/vendor/plotly.min.js NEXO_SWEEP_ONLY=structural_tab-summaryPlot,structural_tab-speciesPlotPlot,structural_tab-networkPlot,structural_tab-propPlotPlot,structural_tab-diffAcylPlot node tests/dual-ui/test_nexo_layout_sweep.cjs`
→ exit 0, last lines:

```
PASS chromium:1024x768 structural_tab-summaryPlot
PASS chromium:1024x768 structural_tab-speciesPlotPlot
PASS chromium:1024x768 structural_tab-networkPlot
PASS chromium:1024x768 structural_tab-propPlotPlot
PASS chromium:390x844 phone
SUMMARY offenders=0 sources=5 engines=chromium
```
(11 PASS lines; diffAcylPlot PASS at 1440×900 and 1024×768.)

Front-end gates (no `frontends/nexo` code changed in this task): `npx vitest run` → `Test Files 100 passed (100)`,
`Tests 461 passed (461)`; `npx tsc --noEmit -p .` clean.

Script notes (differences from b03, not weakened checks): controls are found by id because Team repeats labels
("Text Size:" and "Violin Dot Size:" twice); Duplicate is the card-header button (cards have no footer); the
Library is opened only when closed and the plot is found with "Search plots" (the gated tiles are not visible
otherwise). Two first-run assertions of mine were wrong and were corrected before the evidence runs: #5 treated any
`.plot-editor` as Plotly-only (the colour-blind preview uses that class and is valid for images) — it now checks
for "Plot title"/"Color palette"; the network #3 check expected the plain wheel to zoom (the canvas pans on wheel
and zooms on Ctrl+wheel) and the image src to stay the same (zooming fetches the image at the new scale).

## Fixes

- **F1 (Nexo API bug, fixed in R, not run here):** `structural_tab-networkPlot` had `needs = NULL` in
  `R/frontends/api/catalog.R:38`, but Team wraps its renderer in the independent-design gate
  (`R/frontends/team/inferential_network_adapter.R:9`, `guided_local_inference_allowed`). So the Library added
  "Correlation network" with no "Confirm study design…" step and the card could only draw Team's
  "Correlation network requires a confirmed independent study design. Repeated observations cannot be treated as
  independent." (first run, 23:33, before the design was confirmed; that screenshot was overwritten by the evidence run, the message is quoted from it). Same gate and
  same gap for `fla_tab-plotCircos` (`catalog.R:47`, b09), fixed in the same line set. `needs = "de"` is the gate
  Nexo's Library already uses (`frontends/nexo/src/catalog.ts:13`, `design.allowed` =
  `shared$inference_allowed(FALSE)`, `R/frontends/api/session.R:383`).
  Red `bb6948cf` (test in `tests/dual-ui/test_api_catalog.R`; expected
  `Error: structural_tab-networkPlot: needs NULL, expected "de" (Team's independent-design gate)`), green
  `507c5583` (expected `PASS catalog network gates: networkPlot and plotCircos need a confirmed independent design`).
  **R is not available on the M1: the coordinator runs `Rscript tests/dual-ui/test_api_catalog.R`.** The live API
  (aad45f68) still has the old catalog, so the script confirms the design through a gated row
  (`designVia: 'Structural remodeling shifts'`) before adding the network.

## diffAcylPlot · Acyl chain remodeling (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Study design confirmed in the Library, then added; draws without a module action: `b07-structure/diffAcylPlot-1-draws.png`; zoomed out (frozen tier image) `b07-structure/diffAcylPlot-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Module render for 620×680 comes back 620×420 (27.8 KB): the module fixes the plot height itself; the card shows the same 620×420 image contained in 618×682 (diverging forest plot, title "Differential Acyl Chain Remodeling: Treatment_T1+…"); `diff_p_cutoff` = catalog default 0.05 |
| 3 | Size | PASS | 620→780→390 px wide, redrawn each time, nothing overflows the body: `b07-structure/diffAcylPlot-3-larger.png`, `b07-structure/diffAcylPlot-3-smaller.png` |
| 4 | Data tab | PASS | All 52 controls of Team's structural markup present (incl. sub-tabs, colours, choice lists); module actions present (Initiate Structural Analysis, Show Statistic Detail ×4, Load Species Plot, Apply Custom Colors, …). "P-value Cutoff:" 0.1 → redrew (`b07-structure/diffAcylPlot-4-data-changed.png`); 2 refused: "Could not update the plot: Invalid value for diff_p_cutoff: above the maximum 0.5" (API 400, plot kept; `b07-structure/diffAcylPlot-4-data-invalid.png`) |
| 5 | Appearance | PASS | Image plot: Label, Background, Size (+ colour-blind preview); no Plotly-only control; canvas Undo/Redo of the label: `b07-structure/diffAcylPlot-5-appearance.png` |
| 6 | Statistics | N/A | No Nexo statistics workflow ("Statistics are available for independent violin copies."); Team's "Show Statistic Detail" is offered as a Data-tab module action (present, not exercised in this round) |
| 7 | Export | PASS | Card PNG 339 KB; SVG disabled with "This figure is a raster image; SVG is not available."; Team "Diff CSV" `Differential_Acyl_Chain_Expression_….csv` 2.3 KB and "Diff PDF" 5.8 KB (%PDF); card PDF 205 KB; `b07-structure/diffAcylPlot-7-export-dialog.png` |
| 8 | Finish | PASS | Snapshot 423×420 in a 421×460 body, no false "Plot changed" notice; Edit figure → live PNG: `b07-structure/diffAcylPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Header Duplicate keeps label, background and `diff_p_cutoff=0.1`; remove + Undo brings it back drawn: `b07-structure/diffAcylPlot-9-duplicate.png` |
| 10 | Save and reopen | PASS | Reopened `audit-b07-structure-synthetic`: label, `diff_p_cutoff=0.1`, background kept (`b07-structure/diffAcylPlot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 1440×900 and 1024×768, Data/Appearance/Statistics/Export with every `<details>` open, card header: 0 offenders (`b07-structure/diffAcylPlot-12-layout-1440-data.png`, `…-1024-data.png`, `…-1440-card.png`, `…-1024-card.png`); mock sweep PASS |

Findings / notes for the designer:
- At 390 px wide the module's own title and x-axis title are wider than the plot and ggplot clips them at both
  sides (`b07-structure/diffAcylPlot-4-data-invalid.png`). Team draws the same at that width (module output,
  `R/modules/8_structural_module.R` diffAcylPlot ~l.5986); not changed here.
- The module returns a fixed-height 420 px image, so a 720 px card letterboxes it (white bands above/below).

Auditor (Opus 5.5): AGREE

Adversary (Astra): —

## summaryPlot · Structural remodeling shifts (png)

Two runs (23:23 and 23:39), same result. Evidence from the second run (`b07-structure/results-summaryPlot.json`).

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Design confirmed, added; Team placeholder until "Initiate Structural Analysis" (Data-tab module action) → card redrew with the dot plot: `b07-structure/summaryPlot-1-before-actions.png` → `b07-structure/summaryPlot-1-draws.png`; zoomed out (frozen tier image) `b07-structure/summaryPlot-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Module render 620×680 (67.6 KB) for the same inputs; card image 620×720 contained at 618×682; "Key Structural Remodeling Shifts", legend, 30 class rows, nothing cropped; `textSize` = catalog default 10 |
| 3 | Size | PASS | 620→780→390 px wide, redrawn each time: `b07-structure/summaryPlot-3-larger.png`, `b07-structure/summaryPlot-3-smaller.png` |
| 4 | Data tab | PASS* | All 52 Team controls present; "Text Size:" (`textSize`) 14 → redrew (`b07-structure/summaryPlot-4-data-changed.png`); 2 refused: "Could not update the plot: Invalid value for textSize: below the minimum 6" (API 400; `b07-structure/summaryPlot-4-data-invalid.png`). *But see F2: right after, the card's own render answers **HTTP 500** `{"error":"500 - Internal server error"}` (twice, around the refused PATCH) and the card stays in error |
| 5 | Appearance | PASS | Image plot: Label, Background, Size; canvas Undo/Redo: `b07-structure/summaryPlot-5-appearance.png` |
| 6 | Statistics | N/A | "Statistics are available for independent violin copies."; Team's "Show Statistic Detail" is a Data-tab module action (present, not exercised) |
| 7 | Export | **FAIL** | `Download PNG` produced no download in 180 s: the card is in error after F2 |
| 8 | Finish | **FAIL** | the card never reaches "finished" in 180 s (same cause) |
| 9 | Duplicate / remove / undo | PASS* | Duplicate keeps label, background, `textSize=14`; remove + Undo restores it drawn (`b07-structure/summaryPlot-9-duplicate.png`). *The copy draws Team's placeholder "Click 'Initiate Structural Analysis'…" (F3), and the screenshot shows the original card behind it with the red "Data & settings" error status (F2) |
| 10 | Save and reopen | **FAIL** | Saved and reopened, the card never settles; it shows "Couldn't bring back Audit summaryPlot. Try again" (`b07-structure/summaryPlot-12-layout-1440-card.png`, taken on the reopened page); render 500 again. Checkpoint deleted (200) |
| 11 | Console | **FAIL** | `Failed to load resource: 500` (render, F2); three `409` on `/downloads` after reopen (session evicted by the other auditor sharing the API, not a Nexo defect) |
| 12 | Layout | PASS | 1440×900 and 1024×768, 4 Inspector tabs with every `<details>` open, card header: 0 offenders (`b07-structure/summaryPlot-12-layout-1440-data.png`, `…-1024-data.png`); mock sweep PASS |

Findings:
- **F2 (OPEN, API):** `textSize=14` on the 390 px card (after #3) makes the card's render answer HTTP 500 with the
  generic plumber body; the same inputs at the default 620×720 draw (the duplicate in #9). Team's renderPlot would
  print the R error in place of the plot; the API only maps `shiny.silent.error`/`validation` to a 422 with a
  message (`R/frontends/api/cards.R:304-313`), any other R condition from `getOutput` becomes a bare 500, and the
  card then stays in error for Export, Finish and the saved checkpoint. The R error text is only in the API log on
  the RTX (not reachable from the M1); not fixed in this round because a fix cannot be verified here. Proposed:
  coordinator reads the API log for `tcinstance_ecc4d2b61800` (23:40–23:49) and decides between catching the
  error as a 422 with its message, or a Team-side size floor.
- **F3 (FIXED by the module actions replay, merged; `tests/dual-ui/test_api_actions_replay.R` green on the RTX):** Duplicate and Save→reopen carry the inputs but not the module action presses: the copy
  shows "Click 'Initiate Structural Analysis'…" and the reopened card does not come back. A user must press
  Initiate again on each copy. The API records pressed actions only per instance (`s$acted`, `cards.R:231`).
  Needs a design decision (replay the pressed actions on duplicate/restore) — not fixed in this round.
  - **Fix (module-actions-replay, Nexo + API, R test unrun on the M1):** the pressed actions of a card are kept, in
    order, in Nexo's checkpoint member (`nodes[<node id>].actions`; never the instance inputs, so Team's validator and
    restore are unchanged and the checkpoint still opens in Team). The API replays them idempotently
    (`api_card_replay`, `POST .../cards/<id>/replay`): on a Duplicate before the copy is drawn, on a restored card of a
    reopened checkpoint (`api_card_restore`), and on session recovery. A failed replay leaves Team's placeholder and the
    Inspector asks to press the button again. Download buttons are never replayed. Evidence:
    `docs/integration/nexo-phase1-evidence/h9/module-actions-replay/`; tests `tests/dual-ui/test_api_actions_replay.R`
    (RTX), `src/state/actions.test.ts`, `tests/dual-ui/test_nexo_actions_replay.cjs`.

Auditor (Opus 5.5): OPEN – F2 render 500 at small size leaves the card in error (#7/#8/#10/#11 FAIL); F3 copies and reopened cards lose "Initiate Structural Analysis"

Adversary (Astra): —

## speciesPlotPlot · Species structural features (png)

Three runs (23:33, 23:37, 23:49); the last one is the evidence (`b07-structure/results-speciesPlotPlot_propPlotPlot_networkPlot.json`).

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | **FAIL** | Design confirmed, added: Team's placeholder "Click 'Initiate Structural Analysis'…" (`b07-structure/speciesPlotPlot-1-before-actions.png`). "Initiate Structural Analysis" → card redrew (`b07-structure/speciesPlotPlot-1-action-1.png`). "Load Species Plot" → render **HTTP 422**, card in error: "The plot inputs are unavailable for this session." (`b07-structure/speciesPlotPlot-1-action-2.png`) |
| 2–10, 12 | — | not reached | the script stops a plot whose card is not drawn (as b03) |
| 11 | Console | FAIL | `Failed to load resource: … 422` (the render above) |

Findings:
- **F4 (OPEN, Nexo gap — a Team control Nexo lacks):** Team's species plot needs "Select Shifts to Visualize:"
  (`selectedDetails`, a `selectInput` built by `output$classSelectorUI` renderUI after the analysis,
  `R/modules/8_structural_module.R:2308-2342`); `speciesPlot_event` does `req(isolate(input$selectedDetails))`
  (l.2345-2348), so without a selection Team draws nothing. `selectedDetails` is in the catalog's `allowedInputs`
  but the Nexo Data tab never shows the selector, before or after "Initiate Structural Analysis" (the Inspector in
  `speciesPlotPlot-1-action-2.png` goes from "Label Top % Extremes" straight to "Load Species Plot"). So in Nexo
  the species plot can never draw. Root cause still to locate (the renderUI is computed only after the action;
  either the Data tab does not re-read the schema's computed controls after a module action, or the API does not
  evaluate that renderUI) — not fixed in this round (time).
- Also seen in the same Inspector: a control labelled with its raw id "differential_view" (Team markup without a
  label); presentation note for the designer.
- **Fix (missing-controls-a, 2026-11-08; R unrun on M1):** root cause in two places. The API seeded renderUI inputs
  only on create, so after "Initiate Structural Analysis" `selectedDetails` stayed NULL (a browser binding would set
  Team's default, the first four shifts): `api_card_update` now runs `api_seed_rendered_inputs` after module actions
  (`R/frontends/api/cards.R`). And the Data tab never re-read the card schema after a module button: it now does, and
  the form takes controls that appear later. `selectedDetails` stays an instance input (allowedInputs). The raw
  "differential_view" heading now shows Team's tab title "Differential Acyl Chain Expression" (schema `groupLabel`).
  Tests: `tests/dual-ui/test_api_missing_controls_a.R` (to run on the RTX), vitest `missingControlsA.test.ts`, mock
  suite `tests/dual-ui/test_nexo_missing_controls_a.cjs` (Chromium + WebKit); evidence
  `docs/integration/nexo-phase1-evidence/h9/missing-controls-a/`.

Auditor (Opus 5.5): OPEN – no "Select Shifts to Visualize" (selectedDetails) control in Nexo, so the plot cannot draw; checks 2–10/12 not reached

Adversary (Astra): —

## networkPlot · Correlation network (png)

Evidence run 23:49 (`b07-structure/results-speciesPlotPlot_propPlotPlot_networkPlot.json`). The live API still has
`needs = NULL` (F1 fixed in R, not deployed), so the design is confirmed through the "Structural remodeling shifts"
gate first; without it (first run) the card drew only Team's "Correlation network requires a confirmed independent
study design…".

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS (after F1) | Design confirmed, added, "Initiate Structural Analysis" → redrew (`b07-structure/networkPlot-1-action-1.png`); the network draws ("Undirected Correlation Network: subclass", 9 class nodes, legend): `b07-structure/networkPlot-1-draws.png`; zoomed out `b07-structure/networkPlot-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Module render 620×680 (109 KB); card image 620×720 contained at 618×682; `networkLayout` = catalog default `stress` |
| 3 | Size + camera | PASS | 620→780→390 px wide, redrawn each time (`b07-structure/networkPlot-3-larger.png`, `b07-structure/networkPlot-3-smaller.png`). Network inside the card: it is a static PNG (no `<canvas>`, no `.vis-network`, no transform on the image), so nothing in the card competes with the canvas camera: wheel over the card pans the canvas, Ctrl+wheel zooms it (100 % → 400 %) and the image stays contained in the body |
| 4 | Data tab | PASS | All 52 Team controls present; "Graph Layout:" stress → fr redrew (`b07-structure/networkPlot-4-data-changed.png`); select/slider controls only ("Minimum Absolute Correlation (\|r\|)" is a 0.5–0.99 slider like Team) |
| 5 | Appearance | PASS | Image plot: Label, Background, Size; canvas Undo/Redo: `b07-structure/networkPlot-5-appearance.png` |
| 6 | Statistics | N/A | "Statistics are available for independent violin copies." |
| 7 | Export | PASS* | Card PNG 805 KB; SVG disabled with the raster reason; card PDF; `b07-structure/networkPlot-7-export-dialog.png`. *"More downloads from this analysis" offers CSV/PDF named `MainClass_AcylChain_Proportions_…` — the proportions plot's files, not the network's (F5) |
| 8 | Finish | PASS | Snapshot 423×498 in a 421×460 body; Edit figure → live PNG: `b07-structure/networkPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps label, background, `networkLayout=fr`; remove + Undo restores it drawn: `b07-structure/networkPlot-9-duplicate.png` |
| 10 | Save and reopen | PASS | Reopened: label, `networkLayout=fr`, background kept, the network draws (`b07-structure/networkPlot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors (the 23:37 run had two `409` on `/downloads` after reopen: session evicted by the other auditor) |
| 12 | Layout | PASS | 1440×900 and 1024×768, 4 tabs, every `<details>` open, card header: 0 offenders (`b07-structure/networkPlot-12-layout-1440-data.png`, `…-1024-data.png`, `…-1440-card.png`, `…-1024-card.png`); mock sweep PASS |

Findings:
- **F1 (fixed, see Fixes):** no design step in the Library for the network.
- **F5 (OPEN, API):** the network card lists the proportions downloads. Team has no download button for the
  network; `api_nearest_download_links` (`R/frontends/api/export.R:118-135`) climbs from the plot to the nearest
  ancestor that holds any download link and only skips links inside another `tab-pane`, so it reaches the
  proportions panel's CSV/PDF (`downloadPropCSV`/`downloadPropPDF`, module l.5306-5317). Expected: no
  "More downloads" group for the network. Not fixed in this round: a change to that walk affects every plot's
  downloads and cannot be verified without R; proposal: stop the walk at the plot's own card/panel container.

Auditor (Opus 5.5): OPEN – F1 fixed in R but not yet run/deployed (coordinator); F5 wrong "More downloads" on the network card

Adversary (Astra): —

## propPlotPlot · Acyl chain proportions (png)

Evidence run 23:49 (`b07-structure/results-speciesPlotPlot_propPlotPlot_networkPlot.json`; the 23:33 run gave the
same results except #5, which failed on my wrong `.plot-editor` assertion, see Script notes).

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Not gated, no module action needed: stacked acyl-chain bars per sample (S01–S24): `b07-structure/propPlotPlot-1-draws.png`; zoomed out `b07-structure/propPlotPlot-1-zoomed-out.png` |
| 2 | Matches Team | PASS* | Module render for 620×680 comes back 620×400 (27 KB): the module sets the height; the card shows the same 620×400 image contained in 618×682 (letterboxed). `prop_enable_donut` = catalog default false. *See F6 for the donut view |
| 3 | Size | PASS | 620→780→390 px wide, redrawn each time: `b07-structure/propPlotPlot-3-larger.png`, `b07-structure/propPlotPlot-3-smaller.png` |
| 4 | Data tab | PASS* | All 52 Team controls present (proportion choice lists, error-bar options, position select…). "Display as Donut Plot" on → the card redrew; the screenshot right after (`b07-structure/propPlotPlot-4-data-changed.png`) still shows the bars at the new size, the donut grid appears in the next renders (#8). Boolean, nothing to refuse |
| 5 | Appearance | PASS | Image plot: Label, Background, Size; canvas Undo/Redo: `b07-structure/propPlotPlot-5-appearance.png` |
| 6 | Statistics | N/A | "Statistics are available for independent violin copies." |
| 7 | Export | PASS | Card PNG 151 KB; SVG disabled with the raster reason; Team CSV `MainClass_AcylChain_Proportions_….csv` 15 KB, Team PDF 53 KB (%PDF); card PDF 107 KB; `b07-structure/propPlotPlot-7-export-dialog.png` |
| 8 | Finish | PASS* | Snapshot 423×**1800** in a 421×460 body: the donut grid is drawn at about a quarter of the card width and is unreadable (`b07-structure/propPlotPlot-8-finished.png`); Edit figure → live PNG. See F6 |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps label, background, `prop_enable_donut=true`: `b07-structure/propPlotPlot-9-duplicate.png` |
| 10 | Save and reopen | PASS | Reopened: label, `prop_enable_donut=true`, background kept (`b07-structure/propPlotPlot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 1440×900 and 1024×768, 4 tabs, every `<details>` open, card header: 0 offenders (`b07-structure/propPlotPlot-12-layout-1440-data.png`, `…-1024-data.png`, `…-1440-card.png`, `…-1024-card.png`); mock sweep PASS |

Findings:
- **F6 (OPEN, presentation):** the module computes its own image height (400 px for the bars, 1800 px for the
  donut grid, `output$propPlotPlot` renderPlot, module l.5042), ignoring the card's height; Team shows it in a
  scrolling panel, Nexo contains it in the card, so the donut view is a thin strip with unreadable labels. Not a
  science issue; for the designer (fit the card to the image's aspect, or let the card scroll/enlarge).

Auditor (Opus 5.5): OPEN – F6 donut view unreadable in the card (module-fixed 1800 px height); otherwise all checks pass

Adversary (Astra): —

Astra review 2026-11-08: F3 marked fixed (module actions replay, merged earlier; `tests/dual-ui/test_api_actions_replay.R` green on the RTX). Not re-graded here, for the coordinator's live re-run: F5 is fixed in the API (`d4502c2b`: a card lists only its own plot's downloads, so the network lists none; R test `tests/dual-ui/test_api_download_ownership.R` part 2 unrun) and F2 has a reproduction test (`tests/dual-ui/test_api_summary_textsize.R`, unrun).
