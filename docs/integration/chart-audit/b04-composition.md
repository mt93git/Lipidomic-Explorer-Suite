# Chart audit · b04-composition (Composition)

Auditor: Opus 5.5 (claude-b), first round. Protocol: `docs/integration/nexo-chart-audit-plan.md` checks 1–11 plus
check 12 "Layout". Script: `node tests/dual-ui/chart-audit/audit_b04-composition.cjs [outputName …]` (Chromium
1440×900, Vite :5184 from `vite.audit.config.mjs`, audit API 127.0.0.1:3961, checkpoint `nexo-complete-synthetic`
only; saves `audit-b04-composition-synthetic` and deletes it). Raw results: `b04-composition/results-*.json`; console logs `b04-composition/run1.log` (all four plots' first pass: barPlotUnfiltered), `run2.log` (barPlotFiltered, donutPlotUnfiltered, donutPlotFiltered), `run3.log` (barPlotUnfiltered and donutPlotFiltered again, with PATCH/save traces). `run4.log` (barPlotUnfiltered after the F1 fix: AUDIT OK, 12 checks, 0 failed). Runs 3–4 overwrote run 1's barPlotUnfiltered screenshots.
Screenshots: `b04-composition/<output>-<check>.png`.

Script notes (differences from `audit_b03-qc-b.cjs`, same checks and evidence names otherwise):
- Duplicate is clicked in the card header chrome (`.card-actions`): cards have no footer any more.
- The Library opens from the rail only when it is hidden (it can be open by default); the two **filtered** plots
  are gated behind "Confirm study design…" in the Library, so the script confirms the design as a user does
  (Experimental unit = Animal, Sample relationship = independent; `<output>-1-design-gate.png`), like the layout sweep.
- Check 4 also requires Team's two `renderUI` controls, `barGroupMode` ("Group By:", module
  `R/modules/5_barchart_module.R:332`) and `barDisplayColumns` ("Display Columns (Subset):", `:552`), to be in the
  Data tab (they are `allowedInputs` without static markup).
- Check 12 runs the layout sweep's own detector (`inspect()` read from `tests/dual-ui/test_nexo_layout_sweep.cjs`:
  spill / overlap / escape) on every Inspector tab with every `<details>` and disclosure opened, at 1440×900 and
  1024×768, plus the card chrome and its open "More card actions" menu. Screenshots `<output>-12-layout-<w>-<tab>.png`
  (Inspector element; it scrolls, so the image shows its top).

Mock layout sweep (`NEXO_SWEEP_ONLY` = the four sources of this batch), before and again after the F1 fix (same result):

```
PASS chromium:1024x768 barchart-donutPlotUnfiltered
PASS chromium:1024x768 barchart-donutPlotFiltered
PASS chromium:390x844 phone
SUMMARY offenders=0 sources=4 engines=chromium
```

## barPlotUnfiltered · Composition · unfiltered (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Draft 100 % and zoomed out (frozen tier image): `b04-composition/barPlotUnfiltered-1-draws.png`, `b04-composition/barPlotUnfiltered-1-zoomed-out.png` — stacked bars per sample, error bars, class legend, title "Unfiltered Composition (Absolute (intensity))" |
| 2 | Matches Team | PASS | Module `POST …/render` 620×680 PNG (29 KB) for the same inputs; card shows its own render 620×380 (catalog `defaultSize`) at 618×342; `barValueMode` = catalog default "Absolute (intensity)" |
| 3 | Size | PASS | 620→780→450 px wide, redrawn each time, nothing overflows the body: `b04-composition/barPlotUnfiltered-3-larger.png`, `b04-composition/barPlotUnfiltered-3-smaller.png` |
| 4 | Data tab | PASS | All 13 controls of Team's markup present (module tabs Unfiltered/Filtered and Barplot/Donutplot shown as their labels) plus both renderUI controls: "Group By: Lipid Main Class / Lipid Category" and "Display Columns (Subset)" (sample checklist). Value Mode → "Absolute (%)" redrew (`b04-composition/barPlotUnfiltered-4-data-changed.png`). Only radios/checkboxes/slider: no free value to refuse (N/A) |
| 5 | Appearance | PASS | Image plot: Label renames the card, Background applied (rgb 255,244,224), Size; no Plotly-only control that would silently do nothing (`b04-composition/barPlotUnfiltered-5-appearance.png`) |
| 6 | Statistics | N/A | Team has no statistics for composition plots; the tab says "Statistics are available for independent violin copies." |
| 7 | Export | PASS | Card PNG 219 KB; SVG disabled with the reason "This figure is a raster image; SVG is not available."; Team CSV `…Barchart_Unfiltered_Data_Rep.csv` 20 KB and Team PDF `…Barchart_Unfiltered_Rep.pdf` 5.7 KB (valid %PDF); card PDF 193 KB; `b04-composition/barPlotUnfiltered-7-export-dialog.png` |
| 8 | Finish | PASS | Snapshot 450×220 in a 448×182 body; Edit figure → live PNG: `b04-composition/barPlotUnfiltered-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate (header chrome) keeps label and `barValueMode=Absolute (%)`; remove + Undo brings it back drawn: `b04-composition/barPlotUnfiltered-9-duplicate.png` |
| 10 | Save and reopen | **FAIL (run 1) → fixed; PASS (runs 2, 4)** | Run 1: label and background kept, but **Value Mode came back as "Absolute (intensity)"** in the Inspector and on the plot: `reopened barValueMode=other, saved Absolute (%)` (`b04-composition/barPlotUnfiltered-10-reopened.png` was overwritten by run 2; the run-1 image showed the title "Unfiltered Composition (Absolute (intensity))"). Run 2 (with PATCH/save tracing): PASS, `barValueMode=Absolute (%)` reopened (`b04-composition/barPlotUnfiltered-10-reopened.png`). Checkpoint deleted (200) both times. See F1 |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders on Data / Appearance / Statistics / Export at 1440×900 and 1024×768 (all sections open), card header and More menu clean: `b04-composition/barPlotUnfiltered-12-layout-*.png` |

Findings:
- **F1 (Nexo bug, fixed):** in run 1 a Data-tab change did not survive Save → reopen; a minimal probe
  (`tests/dual-ui/chart-audit/probe_b04-reopen.cjs`) and run 2 passed, and run 2's trace (`b04-composition/run3.log`)
  showed why the flow matters: check 5's toolbar **Undo** undoes the *Data change* (PATCH `"Absolute (intensity)"`)
  and **Redo** 500 ms later re-sends `"Absolute (%)"`. Root cause: `frontends/nexo/src/canvas.ts` decided whether to
  send restored inputs by comparing the target with `c.inputs`, which `restoreInputs` updated only when the PATCH
  answered. A Redo before the Undo's answer (slow shared API in run 1) looked like no change and was never sent; the
  late Undo answer left the server at "intensity" while the document said "%", and reopening right after a save can
  reuse the live session (`R/frontends/api/storage.R:107`), which showed the server's value. Fix: a restore sets the
  card's inputs when it is sent, and an earlier restore that answers after a later one is ignored. Red `018a6c07`
  (new mock knob `__nexoPrefetchMock.patchDelayMs` + H8b in `test_nexo_inspector.cjs`:
  `AssertionError [ERR_ASSERTION]: PATCHes after a fast Undo/Redo: ["PC(16:0/18:1)"]`), green `13c17f83`
  (`PASS H8b chromium/webkit fast-undo-redo-ends-at-the-redone-value-on-the-server`; `test_nexo_inspector.cjs` 42 PASS,
  `test_nexo_card_chrome.cjs` 29 PASS, vitest 100 files / 461 tests, `tsc --noEmit` clean; mock layout sweep still
  `SUMMARY offenders=0 sources=4`).
- Side observation (not changed): Label and Background edits are not canvas Undo steps here (Undo skipped them and
  undid the earlier Data change); to confirm against the intended history design.

Live re-run after the fix (run 4): all 12 checks PASS, `barValueMode=Absolute (%)` reopened.

Auditor (Opus 5.5): AGREE

Adversary (Astra): —

## barPlotFiltered · Composition · filtered (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Gated in the Library behind "Confirm study design…" (`b04-composition/barPlotFiltered-1-design-gate.png`); after confirming, Draft 100 % and zoomed out (frozen tier image): `b04-composition/barPlotFiltered-1-draws.png`, `b04-composition/barPlotFiltered-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Module render 620×680 (28 KB) for the same inputs; card render 620×380 at 618×342; `barOrientation` = catalog default `sample_x`; the Data tab opens on Team's "Filtered" module tab (catalog `shownBy`) |
| 3 | Size | PASS | 620→780→450 px wide, a new render requested each time, nothing overflows: `b04-composition/barPlotFiltered-3-larger.png`, `b04-composition/barPlotFiltered-3-smaller.png` (the "smaller" image caught the card while "Loading figure…" — the script's redraw wait fired on the new image URL; the drawn small card is visible in `-4-data-changed.png` and `-8-finished.png`) |
| 4 | Data tab | PASS | 13 Team controls + renderUI "Group By" and "Display Columns (Subset)"; Orientation → "Classes on X" redrew (`b04-composition/barPlotFiltered-4-data-changed.png`, taken while the Inspector still said "Updating…"); no free value to refuse (N/A) |
| 5 | Appearance | PASS | Image plot: Label, Background, Size (`b04-composition/barPlotFiltered-5-appearance.png`) |
| 6 | Statistics | N/A | No statistics in Team for this plot; tab says "Statistics are available for independent violin copies." |
| 7 | Export | PASS | Card PNG 258 KB; SVG disabled with the raster reason; Team CSV `…Barchart_Filtered_Data_Rep.csv` 16 KB, Team PDF `…Barchart_Filtered_Rep.pdf` 5 KB; card PDF 215 KB; `b04-composition/barPlotFiltered-7-export-dialog.png` |
| 8 | Finish | PASS | Snapshot 450×220 in a 448×182 body; Edit figure → live PNG: `b04-composition/barPlotFiltered-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps `barOrientation=class_x`: `b04-composition/barPlotFiltered-9-duplicate.png` |
| 10 | Save and reopen | PASS | Reopened: label, `barOrientation=class_x`, background kept (`b04-composition/barPlotFiltered-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders, 8 tab views (1440×900, 1024×768) + card chrome and More menu: `b04-composition/barPlotFiltered-12-layout-*.png` |

Findings / notes:
- Library (outside check 12's Inspector/card scope): the gate note "Confirm study design…" under the second
  "Composition share ·…" tile is clipped on the left ("ıfirm study design…", `b04-composition/barPlotFiltered-1-design-gate.png`). Presentation note for the designer.
- At 450×220 Team's own PNG crops its title and the top of the legend (the image is `object-fit: contain`, so the
  crop is in the module's render at that size, not in the card): note for the designer (minimum card size).

Auditor (Opus 5.5): AGREE

Adversary (Astra): —

## donutPlotUnfiltered · Composition share · unfiltered (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Six donuts (one per sample) + class legend, title "Unfiltered Composition (Donut Plot)": `b04-composition/donutPlotUnfiltered-1-draws.png`, `b04-composition/donutPlotUnfiltered-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Module render 620×680 (40 KB); card render 620×380 at 618×342; `showDonutStats` = catalog default `false` |
| 3 | Size | PASS (Team module clips below 620 px — title and legend cropped at 450 px wide; its facet titles are cut at every tested width; same PNG as Team) | 620→780→450 px, redrawn each time: `b04-composition/donutPlotUnfiltered-3-larger.png`, `b04-composition/donutPlotUnfiltered-3-smaller.png` |
| 4 | Data tab | **FAIL → fixed (R, not run here)** | 13 Team controls + both renderUI controls present; "Show Donut Proportion" redrew (`b04-composition/donutPlotUnfiltered-4-data-changed.png`). But Value Mode offers **four** choices (`b04-composition/donutPlotUnfiltered-1-draws.png`, Inspector) where Team's browser shows two: on a donut the module narrows them with `updateRadioButtons` to "Absolute (%)" / "Normalized (%)" (`R/modules/5_barchart_module.R:309-321`). Picking "Absolute (intensity)" in Nexo was accepted and then silently put back to a % mode by the module. See F2 |
| 5 | Appearance | PASS | Image plot: Label, Background, Size (`b04-composition/donutPlotUnfiltered-5-appearance.png`) |
| 6 | Statistics | N/A | No statistics in Team |
| 7 | Export | PASS | Card PNG 432 KB; SVG disabled with the raster reason; Team CSV `…Donut_Unfiltered_Data_Rep.csv` 4.5 KB, Team PDF `…Donut_Unfiltered_Rep.pdf` 34 KB; card PDF 364 KB; `b04-composition/donutPlotUnfiltered-7-export-dialog.png` |
| 8 | Finish | PASS | `b04-composition/donutPlotUnfiltered-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps `showDonutStats=true`: `b04-composition/donutPlotUnfiltered-9-duplicate.png` |
| 10 | Save and reopen | PASS | `showDonutStats=true`, label, background kept (`b04-composition/donutPlotUnfiltered-10-reopened.png`); checkpoint deleted |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders, 8 tab views + card chrome and More menu: `b04-composition/donutPlotUnfiltered-12-layout-*.png` |

Findings:
- **F2 (Nexo/API bug, fixed in R, not run on the M1):** `api_card_schema` applied the choices a module sends at run
  time only to controls with **no** markup options (`R/frontends/api/schema.R:160`), so a radio Team narrows
  (Value Mode on a donut) kept its four markup choices. Now run-time choices replace a radio's markup choices too,
  and `api_card_update` (which validates against the same schema) refuses an intensity mode on a donut with
  "Invalid value for barValueMode: …". Red `531e5981` (R test added to `tests/dual-ui/test_api_schema_choices.R`,
  expected red `Error: donut barValueMode offers: Absolute (intensity) | Absolute (%) | Normalized (intensity) | Normalized (%)`),
  green `e430f10a`. **Neither was run (no R on the M1): the coordinator runs `Rscript tests/dual-ui/test_api_schema_choices.R`.**
  Risk to check there: a saved value that the module no longer offers is now refused instead of accepted.
- Presentation note: the donut facet titles are cut ("ntrol_Synthetic plasma_…") — Team's ggplot strip labels at
  this size (module render), not changed here.

Auditor (Opus 5.5): OPEN – F2 fix written but not run (R); re-check the Value Mode choices on the live API after the coordinator's run

Adversary (Astra): —

## donutPlotFiltered · Composition share · filtered (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | **FAIL (server 500, cause not visible from the M1)** | After confirming the study design, the card's first render `POST …/cards/tcinstance_…/render` answers **HTTP 500** `{"error":"500 - Internal server error"}` and the card shows "Could not update · Request failed (500)". Reproduced in both runs (23:0x and 23:2x, two different instances). `barPlotFiltered` behind the same gate and with the same filtered data draws, so the failure is specific to the filtered donut: Team's `output$donutPlotFiltered` (`R/modules/5_barchart_module.R:1001`) or the API's render of it. Team draws this plot inside a renderUI-sized `plotOutput` (`donutPlotFilteredUI`, `:967-997`), like the unfiltered donut that renders fine. Needs the audit API's log for that render |
| 1b | Draws (probe) | FAIL | `tests/dual-ui/chart-audit/probe_b04-donutfiltered.cjs` (23:20): first render 500; the Inspector already shows Value Mode "Absolute (%)" (Team's donut observer moved it), so checking it sends nothing; "Single Replicates (Group Order)" → PATCH 200, render 500 again. No input tried makes it draw: `b04-composition/donutPlotFiltered-1-draws.png` (card "Request failed (500)") |
| 2–10, 12 | — | not reached | The script stops a plot whose first render fails (no drawn card to check) |
| 11 | Console | FAIL | `Failed to load resource: the server responded with a status of 500` (the render above) |

Findings:
- **F3 (Nexo, open, not fixed):** with the card in error ("Request failed (500)", red "Data & settings" badge), the
  Inspector status line says **"Up to date"** (`b04-composition/donutPlotFiltered-1-draws.png`): the status follows
  the PATCH (200), not the failed render. The Inspector should say the plot could not be drawn.
- F2 applies here too (four Value Mode choices on a donut).

Auditor (Opus 5.5): OPEN – render 500 on every attempt; the coordinator reads the API log for `barchart-donutPlotFiltered` render (error text is not returned to the client)

Adversary (Astra): —

## Fixes in this round

| Finding | Plot | Red | Green | Run |
|---|---|---|---|---|
| F1 fast Undo/Redo restore race (Data value lost on save/reopen) | barPlotUnfiltered | `018a6c07` | `13c17f83` | mock E2E red/green, vitest, tsc, inspector + card chrome suites |
| F2 run-time radio choices (Value Mode on donuts) | donutPlotUnfiltered (also donutPlotFiltered) | `531e5981` | `e430f10a` | R, **not run** on the M1 — coordinator runs `Rscript tests/dual-ui/test_api_schema_choices.R` |


## Open (for the coordinator / next round)

1. F2: run the R test; check that no saved checkpoint carries a radio value the module no longer offers.
2. donutPlotFiltered: render HTTP 500 for every input tried — read the audit API log; then re-audit checks 2–12.
3. F3: Inspector says "Up to date" while the card shows a render error.
4. Designer notes: Team's PNGs crop title/legend at 450×220; donut facet labels cut; Library gate note clipped.

## Coordinator check (2026-11-07, integration of round 1)

- **F2 run on the RTX** (`tests/dual-ui/test_api_schema_choices.R`, R 4.x, production tree). Red at `531e5981`:
  `Error: donut barValueMode offers: Absolute (intensity) | Absolute (%) | Normalized (intensity) | Normalized (%)`.
  Green at the round's tip: `PASS schema radio choices narrowed by the module at run time replace the markup's`.
- **donutPlotFiltered 500 is Team's own behaviour.** The audit API log shows
  `simpleError in min(ncols, n_facets): invalid 'type' (closure) of argument` for every render. In the production
  module the filtered-donut branch (`R/modules/5_barchart_module.R`, the `renderPlot` after "Calculate dynamic ncols")
  computes `n` but never assigns `ncols <- min(4, n)` as the other branches do, so `ncols = ncols` passes a function
  and `R/utils_vis.R:1242` fails. Team's card fails the same way. Not fixed here (module code); proposal for Max's
  module: add `ncols <- min(4, n)` after `if (is.na(n) || n <= 0) n <- 1` in that branch. Open on the Nexo side: the
  API answers 500 with a generic body instead of the module's message (and F3, the Inspector's "Up to date").

## Round 2 (2026-11-08, API 96b8742d)

Auditor: Opus 5.5, round 2. API `http://127.0.0.1:3961` (`/api/v1/health` → commit `96b8742d`), app from this branch on
Vite :5286 (`vite.audit.config.mjs`), checkpoint `nexo-complete-synthetic` only. Script
`NEXO_AUDIT_BASE=http://127.0.0.1:5286 node tests/dual-ui/chart-audit/audit_b04-composition.cjs <output>`; this round
adds to check 4 the donut Value Mode choices (`valueModes`) and an `AUDIT_DEBUG=1` request log. Raw results:
`b04-composition/results-donutPlotUnfiltered.json`, `b04-composition/results-donutPlotFiltered.json`.

### donutPlotUnfiltered · Composition share · unfiltered (png), round 2

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `b04-composition/donutPlotUnfiltered-1-draws.png`, `b04-composition/donutPlotUnfiltered-1-zoomed-out.png` (zoomed out: frozen tier image) |
| 2 | Matches Team | PASS | Module render 620×680 (40 072 B); card image 620×380 shown at 618×342; `showDonutStats` = catalog default `false` |
| 3 | Size | PASS (Team module clips below 620 px — title and legend cropped at 450 px wide; its facet titles are cut at every tested width; same PNG as Team) | 620→780→450 px, redrawn each time: `b04-composition/donutPlotUnfiltered-3-larger.png`, `b04-composition/donutPlotUnfiltered-3-smaller.png` |
| 4 | Data tab | **PASS (F2 live; after fix R2-F1)** | 13 Team controls + renderUI `barGroupMode` / `barDisplayColumns`; **Value Mode offers exactly "Absolute (%) \| Normalized (%)"**, Team's run-time choices for a donut (`R/modules/5_barchart_module.R:309-321`): round 1's F2 is live. "Show Donut Proportion" → PATCH `{"showDonutStats":true}`, redrawn (`b04-composition/donutPlotUnfiltered-4-data-changed.png`). Before fix R2-F1 the PATCH was never sent (below) |
| 5 | Appearance | PASS | Label, Background, Size (image plot) (`b04-composition/donutPlotUnfiltered-5-appearance.png`) |
| 6 | Statistics | N/A | Team has no statistics for this plot ("Statistics are available for independent violin copies.") |
| 7 | Export | PASS | Card PNG 431 938 B; SVG disabled with the raster reason; Team CSV `…Donut_Unfiltered_Data_Rep.csv` 4 531 B, Team PDF `…Donut_Unfiltered_Rep.pdf` 34 187 B; card PDF 363 888 B; `b04-composition/donutPlotUnfiltered-7-export-dialog.png` |
| 8 | Finish | **PASS (after fix R2-F1)** | Snapshot 450×220 in a 448×182 body; Edit figure → live PNG (`b04-composition/donutPlotUnfiltered-8-finished.png`). Before the fix: `page.waitForFunction: Timeout 180000ms exceeded` waiting for the finished state (two runs) |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps `showDonutStats=true`; remove + Undo restores it drawn (`b04-composition/donutPlotUnfiltered-9-duplicate.png`). Before the fix it read `false` |
| 10 | Save and reopen | PASS | Save carries `showDonutStats:true`; reopened with label and background (`b04-composition/donutPlotUnfiltered-10-reopened.png`); `audit-b04-composition-synthetic` deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders over 8 tab views (1440×900 and 1024×768: Data, Appearance, Statistics, Export) + card chrome and More menu: `b04-composition/donutPlotUnfiltered-12-layout-*.png`. Mock sweep: see "Mock layout sweep (round 2)" |

Findings:
- **R2-F1 (Nexo bug, fixed):** a Data change followed at once by another Inspector tab never reached the server.
  `SchemaForm` debounces a change for 250 ms and its unmount cleanup cleared that timer, so switching to
  Appearance right after ticking "Show Donut Proportion" dropped the change silently: no PATCH at all
  (`AUDIT_DEBUG` log: the only card requests after check 3 were the autosave/checkpoint POSTs), the save carried
  `showDonutStats:false`, check 9 duplicated the old value and check 8's Finish timed out. The same loss hit b11
  (`node_color_map` back to `sat_zscore`). Reproduced in the browser by hand (tick, then Appearance at once → back on
  Data the box is unticked, no PATCH). Fix: the cleanup sends the pending change (`frontends/nexo/src/ui/forms/SchemaForm.tsx`).
  Red `f07f3a3` (`test_nexo_inspector.cjs`, new H8c: `AssertionError [ERR_ASSERTION]: PATCHes after a Data change and an immediate tab switch: []`),
  green `9fd674f` (`test_nexo_inspector.cjs` 44 PASS / 0 FAIL incl. `PASS H8c chromium|webkit data-change-then-tab-switch-still-reaches-the-server`;
  `test_nexo_card_chrome.cjs` 29 PASS / 0 FAIL; vitest 120 files / 563 tests passed; `tsc --noEmit` clean). Live re-run
  after the fix: `AUDIT OK: 12 checks, 0 failed`.
- Side observation (unchanged from round 1, not changed): the toolbar Undo in check 5 undid the Data change
  (PATCH `showDonutStats:false`), not the Label/Background edit just made; Redo sent `true` again.
- Presentation (unchanged): Team's donut facet titles are cut at this size ("_Synthetic pla"), module render.

Auditor (Opus 5.5): AGREE

### donutPlotFiltered · Composition share · filtered (png), round 2

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | **FAIL (Team's module)** | After "Confirm study design…", every render is `POST …/cards/tcinstance_…/render` → **HTTP 500 `{"error":"500 - Internal server error"}`** (live API, two runs and the probe `tests/dual-ui/chart-audit/probe_b04-donutfiltered.cjs`); the card says **"Request failed (500)"** (`b04-composition/donutPlotFiltered-1-draws.png`). Cause (coordinator check): Team's filtered-donut `renderPlot` never assigns `ncols` (`R/modules/5_barchart_module.R`, branch after "Calculate dynamic ncols"; `R/utils_vis.R:1242` then fails with `invalid 'type' (closure) of argument`). Not fixed here (module code) |
| 1b | API body | **FAIL → fixed (R, not run here)** | The API answered plumber's generic body while the module's message was available (R2-F2 below) |
| 2–3, 5, 7–10, 12 | — | N/A | The card cannot draw (Team's module error), so there is no plot to compare, resize, style, export, finish, duplicate or reopen |
| 4 | Data tab | PASS (partial) | Value Mode offers only "Absolute (%) \| Normalized (%)" here too (F2 live; `b04-composition/donutPlotFiltered-1-draws.png`); Single Replicates (Group Order) → PATCH 200, render 500 again. A redraw cannot be shown (N/A) |
| 6 | Statistics | N/A | No statistics in Team |
| 11 | Console | FAIL | `Failed to load resource: the server responded with a status of 500 (Internal Server Error)`: the render above (a 422 after R2-F2) |

Findings:
- **R2-F2 (Nexo API bug, fixed in R, not run on the M1):** when Team's module stops with an R error while drawing,
  `api_card_render` caught only `req()`/`validate()` refusals, so the `simpleError` reached plumber, which answers
  500 with a generic body and Nexo can only say "Request failed (500)". Now any other module error becomes
  `api_unprocessable` (422) with the module's text, `"Team's module could not draw this plot: invalid 'type' (closure) of argument"`
  (`R/frontends/api/cards.R` `api_render_module_error`). A render worker forwards it like any 422 (`pool.R api_pool_finish`),
  and the card body shows `error.message` (`frontends/nexo/src/cards.ts renderFailed`), so no frontend change is needed.
  The API's own refusals and `session_lost` keep their class. Red `24dc983` (`tests/dual-ui/test_api_render_module_error.R`,
  expected red: `Error: filtered donut render failed with class simpleError/error/condition, not api_unprocessable: invalid 'type' (closure) of argument`),
  green `9f960cd`. **Neither was run (no R on the M1): coordinator runs `Rscript tests/dual-ui/test_api_render_module_error.R`
  (and `test_api_engine.R`, `test_api_pool.R`), then restarts the audit API; the card should then show Team's message instead of "Request failed (500)".**
  If Max fixes the module (`ncols <- min(4, n)`), part 1 of the test prints a NOTE and part 2 still checks the rule.
- Round 1's F3 (Inspector says "Up to date" while the card shows the render error) is still visible in
  `b04-composition/donutPlotFiltered-1-draws.png`. It belongs to the parallel "Inspector status line" task: recorded, not fixed here.

Auditor (Opus 5.5): OPEN – Team's module bug (`ncols`, proposal for Max) keeps the card from drawing; R2-F2 written but not run (R)

### Checkpoints (round 2)

`GET /api/v1/checkpoints` (2026-11-08): no `audit-b04-*` checkpoint is left (each run deleted its own, 200). The
list also holds five `autosave` entries (store autosaves of audit sessions, two within this round's runs), which are
not `audit-*` names, so they were left alone.

### Fixes in round 2 (both batches)

| Finding | Plot | Red | Green | Run |
|---|---|---|---|---|
| R2-F1 Data change lost when leaving the Data tab within the 250 ms debounce | donutPlotUnfiltered, pathwayPlot, pathwayVisNetwork | `f07f3a3` | `9fd674f` | mock `test_nexo_inspector.cjs` red/green (H8c), card chrome, vitest, tsc; live b04 re-run 12/12 |
| R2-F2 module error while drawing answered a generic 500 | donutPlotFiltered | `24dc983` | `9f960cd` | R, **not run** (coordinator: `Rscript tests/dual-ui/test_api_render_module_error.R`) |
| R2-F3 served schema had `uploads=[]` (run.R did not load export.R) | pathwayPlot, pathwayVisNetwork (b11) | `4393ec5` | `9b9434d` | R, **not run** (coordinator: `Rscript tests/dual-ui/test_api_run_engine_uploads.R`) |
| R2-F4 Data tab remounted from a stale cached schema and sent the old value back | pathwayVisNetwork (b11); any card | `3e0d3e1` | `c11f276` | vitest red/green, tsc, inspector 44/0, card chrome 29/0; live b11 re-run keeps `fc`. Landed after the b04 live run (additive: it only updates the cache) |

Astra review 2026-11-08: `barchart-donutPlotUnfiltered` check 3 (both rounds) now reads "PASS (Team module clips below 620 px …; same PNG as Team)": the cropped title/legend at 450 px and the cut facet titles are Team's module render, which the card shows unchanged.
