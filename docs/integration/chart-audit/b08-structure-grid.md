# Chart audit · b08-structure-grid (Structural grid)

Auditor: Opus 5.5 (claude-b), first round, 2026-11-07. Protocol: `docs/integration/nexo-chart-audit-plan.md`,
checks 1–11 plus check 12 "Layout". Script: `node tests/dual-ui/chart-audit/audit_b08-structure-grid.cjs [outputName …]`
(Chromium 1440×900, Vite :5188 with `vite.audit.config.mjs`, audit API `127.0.0.1:3961` running aad45f68, checkpoint
`nexo-complete-synthetic`; saves `audit-b08-structure-grid-synthetic` and deletes it, 200 each time). Raw results:
`b08-structure-grid/results-*.json`. Screenshots: `b08-structure-grid/<output>-<check>.png` (all ≤ 180 KB).

How the script works a plot like a user: the four plots need the study design (`needs: de`). The Library shows each
as "Requires configuration · Confirm study design…"; the script clicks that row, picks Animal / independent in the
dialog, confirms, then clicks the row's Add (see note N1). Duplicate is the header chrome button (cards have no
footer); remove is the card's ⋯ menu. Check 12 re-uses the layout sweep's own in-page rules (`inspect()` read from
`tests/dual-ui/test_nexo_layout_sweep.cjs`: spill, overlap, escape) on the real API schema, every Inspector tab with
every `<details>` opened, plus card header and ⋯ menu, at 1440×900 and 1024×768.

Mock layout sweep (`NEXO_SWEEP_ONLY=` the four sources), before and after the fix:

```
PASS chromium:1024x768 structural_grid_tab-diffAllPlot
PASS chromium:390x844 phone
SUMMARY offenders=0 sources=4 engines=chromium
```

## Summary

| Plot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| heatmapPlot | PASS | PASS | PASS | FAIL→fixed (R unverified) | PASS | N/A | PASS | PASS | PASS | PASS | PASS | PASS |
| dotplotPlot | PASS | PASS | PASS | FAIL→fixed (R unverified) | PASS | N/A | PASS | PASS | PASS | PASS | PASS | PASS |
| mergedPlot | PASS | PASS | PASS | FAIL→fixed (R unverified) | PASS | N/A | PASS | PASS | PASS | PASS | PASS | PASS |
| diffAllPlot | PASS | PASS | PASS | FAIL→fixed (R unverified) | PASS | N/A | PASS | PASS | PASS | PASS | PASS | PASS |

The one checklist FAIL is the same in all four (F1): Team's "Log2FC Threshold (abs):" is missing from Nexo's Data tab. Fixed
test first in `R/frontends/api/` and `frontends/nexo/`; the audit API still runs aad45f68, so the live re-check of
#4 waits for the coordinator to run the R test and deploy. F2 (the Statistics Console dialog opened from the Data
tab: blank Close button, report lines run together) was found during #4 and is fixed and re-checked live.

## Findings (batch-wide)

- **F1 (Nexo gap, fixed; R part not run on the M1).** Team's drawer has "Log2FC Threshold (abs):"
  (`gridLog2fcThresh`, a `numericInput` built in `renderUI`, `R/modules/12_structural_grid_module.R:305-322`); it
  filters the data of all four plots (`:397`, `:513`). It is not in the catalog's `allowedInputs` (Team's
  `plot_instances.R`, not editable here) and `api_card_schema` drops controls outside `allowedInputs` unless they are
  "computed", so Nexo's Data tab never offered it. Evidence: check #4 of every plot, e.g.
  `Team renderUI controls missing from the Data tab: gridLog2fcThresh`.
  Fix, following the `bqcSamples` precedent: `api_is_computed_id` (`R/frontends/api/schema.R`) now includes
  `gridLog2fcThresh`, so the schema offers it marked `computed` and `api_card_update` accepts it (type and `min = 0`
  still checked by `api_validate_inputs`); the client's `isComputedId`/`validateComputed`
  (`src/state/computed.ts`) keep it in Nexo's member (finite number ≥ 0) and re-send it after a reopen; the
  Inspector's computed section (`ComputedControls.tsx`) shows numeric computed controls as a number field with Team's
  label, help and bounds, refusing an empty or out-of-range value with "Enter a number of at least 0." without
  sending it.
  - Red `fff4526c`: vitest `FAIL src/state/computed.test.ts > the structural grid Log2FC threshold is a computed
    control: a finite number >= 0` / `AssertionError: expected false to be true` (`isComputedId('gridLog2fcThresh')`);
    full run `Test Files 1 failed | 99 passed (100)`, `Tests 1 failed | 461 passed (462)`. R test
    `tests/dual-ui/test_api_computed_controls.R` (computed-id vector + new section 7: schema offers it on
    `structural_grid_tab-heatmapPlot` after `api_design(s, "Animal", "independent", TRUE)`, computed, type number,
    min 0; PATCH 0.5 accepted, explicit and live; −1 refused) written, **not run (no R on the M1)**.
  - Green `2b87f1a0`: vitest `Test Files 100 passed (100)`, `Tests 462 passed (462)`; `tsc --noEmit` clean; mock
    `test_nexo_inspector.cjs` 40 PASS / 0 FAIL (`H3 OK`), `test_nexo_card_chrome.cjs` 29 PASS / 0 FAIL (`H6-0 OK`);
    sweep `SUMMARY offenders=0 sources=4`. **Coordinator: run `Rscript tests/dual-ui/test_api_computed_controls.R`
    and re-run check #4 after deploy.**
- **N1 (Nexo, UX, not fixed – for decision).** Clicking a gated Library row ("Confirm study design… (Structural grid
  · selected class heatmap)") and confirming only confirms the design: the row turns "Ready" and the user must click
  it again to add the plot (`src/ui/Library/Library.tsx:113-116`). The older `canvas.ts` dialog
  (`src/canvas.ts:431`) added the plot after confirming. Not a checklist FAIL; the row's label names the plot, so a
  user may expect it to be added.
- **F2 (Nexo bug, fixed).** The module action "Show Statistic Detail" (Data tab) opens Team's Statistics Console
  (`show_statistics_modal`, `R/modules/97_statistics_module.R:138-`). In Nexo (a) its footer showed one blank white
  button: the dialog sits inside `#inspector [role=tabpanel]`, whose button rule (`src/ui/shell.css:234`, ID
  specificity) set `background: var(--paper)` while `dialog button.primary` set the text to `var(--paper)`; (b) the
  report is Team's `<pre>`, which the sanitiser dropped, so its lines ran together
  (`b08-structure-grid/heatmapPlot-4-action.png`). Fix: the Inspector rule skips dialog buttons
  (`:not(dialog button)`); `sanitizeModalHtml` keeps `<pre>` bare (no id/class/style/handlers; content sanitised as
  before); `.module-dialog-body pre` wraps and scrolls. Live re-check on the audit API: Close is white on
  rgb(35, 82, 115), the report reads line by line (`b08-structure-grid/heatmapPlot-4-action-fixed.png`). The old
  expectation `'<pre>x</pre><code>y</code>' → 'xy'` became `'<pre>x</pre>y'` (pre kept, code still dropped).
  - Red `780ac690`: `× module dialog inside the Inspector > no Inspector tab-panel button rule that sets a background
    reaches a dialog button` (`expected [ Array(1) ] to deeply equal []`), `× … keeps the console report's line
    breaks`, `× sanitizeModalHtml > keeps a console <pre> with its line breaks and no attributes`.
  - Green `b0624cbd`: vitest `Test Files 101 passed (101)`, `Tests 465 passed (465)`; `tsc --noEmit` clean; mock
    `test_nexo_inspector.cjs` 40 PASS / 0 FAIL, `test_nexo_card_chrome.cjs` 29 PASS / 0 FAIL; sweep
    `SUMMARY offenders=0 sources=4`.
  - Residual (designer): the `<pre>` still draws in the sans UI font (another rule wins over the monospace family),
    so Team's column alignment in the method summary is approximate. The Copy Report button is not offered (Team's
    footer buttons are not module inputs); "Close" replaces "Return to Structural Grids".
- **N3 (presentation, for the designer).** Nexo's Data tab shows every control of Team's drawer at once, including
  ones Team hides by `conditionalPanel` until they apply: Low/Mid/High colours while "Custom Grid Colors" is off,
  "P-value Cutoff Slider" while visibility is "Significant Only", both Stars Size and P-Value Size, and the
  multi-class mappings on the single-class plots; "Legacy Label Size" is hidden by Team (`display: none`,
  module `:45-47`) but shown by Nexo. The renderUI "Lipid Class:" select sits at the end of the tab, not after "Use
  Lipid Category" as in Team. `b08-structure-grid/mergedPlot-4-data-changed.png`,
  `b08-structure-grid/heatmapPlot-4-action.png`. Every control works; this is order and noise, not a gap.
- **Team behaviour (recorded, not fixed).** The structural-grid drawer is shared: `label_type`, `pointSize`,
  stars/p-value sizes are offered for every plot, though `mergedPlot` ignores `label_type` (module `renderPlot`
  `:776-`), as in Team. At 620 px the diffAllPlot subtitle runs past the right edge and the "Class Contour" legend
  title overlaps it (`b08-structure-grid/diffAllPlot-10-reopened.png`); the module's own render at the same size draws
  the same (ggplot, Team's module).

## heatmapPlot · Structural grid · selected class heatmap (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Design confirmed in the Library, then added; Draft 100 % and zoomed out (frozen tier image): `b08-structure-grid/heatmapPlot-1-draws.png`, `b08-structure-grid/heatmapPlot-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Module render 620×680 PNG (20 KB) for the same inputs; card 620×720 shown at 618×682: "Heatmap Grid: Triacylglycerol", "Position: BOTH \| Mean Log2FC per Cell", stars; `textSize` = catalog default 12 |
| 3 | Size | PASS | 620→780→390 px, redrawn each time, nothing overflows: `b08-structure-grid/heatmapPlot-3-larger.png`, `b08-structure-grid/heatmapPlot-3-smaller.png` |
| 4 | Data tab | **FAIL → fixed (F1)** | All 20 controls of Team's markup present (module tabs as Single/All Classes View, Heatmap/Dotplot Grid, Merged/Filtered); renderUI `lipid_class` present; **`gridLog2fcThresh` missing**. "Plot Base Text Size" 16 redrew (`b08-structure-grid/heatmapPlot-4-data-changed.png`); −3 refused: "Could not update the plot: Invalid value for textSize: below the minimum 6", status "Update failed" (`b08-structure-grid/heatmapPlot-4-data-invalid.png`). Module action "Show Statistic Detail" → Statistics Console dialog (F2: blank Close button and flattened report, `b08-structure-grid/heatmapPlot-4-action.png`; fixed, `b08-structure-grid/heatmapPlot-4-action-fixed.png`) |
| 5 | Appearance | PASS | Image plot: Label renames the card, Background applied (rgb 255,244,224), Size; no Plotly-only control that would do nothing; canvas Undo/Redo of the label. `b08-structure-grid/heatmapPlot-5-appearance.png` |
| 6 | Statistics | N/A | Team has no statistics tab for this plot (its "Show Statistic Detail" is a module action, check 4); tab says "Statistics are available for independent violin copies." |
| 7 | Export | PASS | Card PNG 270 KB; SVG disabled with the reason "This figure is a raster image; SVG is not available."; Team CSV `GridData_GL_TAG_….csv` 1 KB, Team PDF `HeatmapGrid_GL_TAG_….pdf` 6 KB (%PDF); card PDF 134 KB; `b08-structure-grid/heatmapPlot-7-export-dialog.png` |
| 8 | Finish | PASS | Snapshot 423×498 in a 421×460 body; Edit figure → live PNG: `b08-structure-grid/heatmapPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Header Duplicate keeps label and `textSize=16`; remove + Undo brings it back drawn: `b08-structure-grid/heatmapPlot-9-duplicate.png` |
| 10 | Save and reopen | PASS | Reopened in a new page: "Audit heatmapPlot", `textSize=16`, background kept (`b08-structure-grid/heatmapPlot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors (the 400 of the refused −3 PATCH is a network response, surfaced as the toast) |
| 12 | Layout | PASS | 0 offenders at 1440×900 and 1024×768, 4 tabs each, all sections open, card header and ⋯ menu: `b08-structure-grid/heatmapPlot-12-layout-1440-data.png`, `…-1440-card.png`, `…-1024-data.png`, `…-1024-card.png` |

Auditor (Opus 5.5): OPEN – F1 fixed in code (`fff4526c` red, `2b87f1a0` green) but the R test is unrun and the live
re-check of #4 needs the fixed API. F2 fixed (`780ac690` red, `b0624cbd` green) and re-checked live.

Adversary (Astra): —

## dotplotPlot · Structural grid · selected class dotplot (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `b08-structure-grid/dotplotPlot-1-draws.png`, `b08-structure-grid/dotplotPlot-1-zoomed-out.png` (frozen tier image) |
| 2 | Matches Team | PASS | Module render 620×680 (33 KB); card 620×720 at 618×682: "Dotplot Grid: Triacylglycerol", "Position: BOTH \| Size = abs(Mean LFC)"; `pointSize` = catalog default 6 |
| 3 | Size | PASS | 620→780→390 px, redrawn: `b08-structure-grid/dotplotPlot-3-larger.png`, `b08-structure-grid/dotplotPlot-3-smaller.png` |
| 4 | Data tab | **FAIL → fixed (F1)** | As heatmapPlot: all markup controls and `lipid_class` present, `gridLog2fcThresh` missing. "Base Dot Size (Dotplot)" 10 redrew (`b08-structure-grid/dotplotPlot-4-data-changed.png`); −2 refused: "Invalid value for pointSize: below the minimum 2" (`b08-structure-grid/dotplotPlot-4-data-invalid.png`); "Show Statistic Detail" → dialog (`b08-structure-grid/dotplotPlot-4-action.png`) |
| 5 | Appearance | PASS | `b08-structure-grid/dotplotPlot-5-appearance.png` |
| 6 | Statistics | N/A | As heatmapPlot |
| 7 | Export | PASS | Card PNG 347 KB; SVG disabled with reason; Team CSV 1 KB, Team PDF `DotplotGrid_GL_TAG_….pdf` 7 KB; card PDF 181 KB; `b08-structure-grid/dotplotPlot-7-export-dialog.png` |
| 8 | Finish | PASS | `b08-structure-grid/dotplotPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps `pointSize=10`: `b08-structure-grid/dotplotPlot-9-duplicate.png` |
| 10 | Save and reopen | PASS | `pointSize=10`, label, background kept: `b08-structure-grid/dotplotPlot-10-reopened.png`; deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at both sizes: `b08-structure-grid/dotplotPlot-12-layout-1440-data.png`, `…-1024-data.png`, `…-1440-card.png`, `…-1024-card.png` |

Auditor (Opus 5.5): OPEN – as heatmapPlot (F1 live re-check after the R test and deploy; F2 fixed).

Adversary (Astra): —

## mergedPlot · Structural grid · all classes (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `b08-structure-grid/mergedPlot-1-draws.png`, `b08-structure-grid/mergedPlot-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Module render 620×680 (42 KB); card 620×720 at 618×682: "Merged Classes Grid", "Position: BOTH \| Colored by Class", 9 classes; `position` = catalog default `both` |
| 3 | Size | PASS | 620→780→390 px, redrawn (render requests and new image each time). The "smaller" screenshot caught the next image loading ("Loading figure…"): `b08-structure-grid/mergedPlot-3-smaller.png`, `b08-structure-grid/mergedPlot-3-larger.png` |
| 4 | Data tab | **FAIL → fixed (F1)** | As above, `gridLog2fcThresh` missing. Position → sn-1 redrew (`b08-structure-grid/mergedPlot-4-data-changed.png`); radio, no free value to refuse. First run used "Numeric P-Value", which this plot ignores (Team's module), so it was re-run with Position (`results-mergedPlot.json`) |
| 5 | Appearance | PASS | `b08-structure-grid/mergedPlot-5-appearance.png` |
| 6 | Statistics | N/A | As heatmapPlot |
| 7 | Export | PASS | Card PNG 314 KB; SVG disabled with reason; Team CSV `MergedClassesGrid_….csv` 2.6 KB, Team PDF 8.4 KB; card PDF 276 KB; `b08-structure-grid/mergedPlot-7-export-dialog.png` |
| 8 | Finish | PASS | `b08-structure-grid/mergedPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps `position=sn1`: `b08-structure-grid/mergedPlot-9-duplicate.png` |
| 10 | Save and reopen | PASS | `position=sn1`, label, background kept: `b08-structure-grid/mergedPlot-10-reopened.png`; deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at both sizes: `b08-structure-grid/mergedPlot-12-layout-1440-data.png`, `…-1024-data.png`, `…-1440-card.png`, `…-1024-card.png` |

Auditor (Opus 5.5): OPEN – as heatmapPlot (F1 live re-check; F2 fixed).

Adversary (Astra): —

## diffAllPlot · Structural grid · differential overview (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `b08-structure-grid/diffAllPlot-1-draws.png`, `b08-structure-grid/diffAllPlot-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Module render 620×680 (72 KB); card 620×720 at 618×682: "Differential Expression of All Classes", size/colour/alpha legends; `all_color_map` = the module's renderUI default `db_lfc` (not in catalog defaults) |
| 3 | Size | PASS (Team module clips below 620 px — at 390×520 the subtitle runs off the right edge and "Class Contour" overlaps it, whole at 620×720; same PNG as Team) | `b08-structure-grid/diffAllPlot-3-larger.png`, `b08-structure-grid/diffAllPlot-3-smaller.png` |
| 4 | Data tab | **FAIL → fixed (F1)** | `gridLog2fcThresh` missing; the renderUI multi-class controls (Map Dot Size/Color/Transparency, Hide Non-Significant) are present. "Map Dot Color to" → Carbon Length L2FC redrew; the screenshot `b08-structure-grid/diffAllPlot-4-data-changed.png` caught the card while a newer render was still "Updating…" (subtitle still "Color: Double Bond L2FC"); the reopened card shows "Color: Carbon Length L2FC" (`b08-structure-grid/diffAllPlot-10-reopened.png`). Select, no free value to refuse |
| 5 | Appearance | PASS | `b08-structure-grid/diffAllPlot-5-appearance.png` |
| 6 | Statistics | N/A | As heatmapPlot |
| 7 | Export | PASS | Card PNG 571 KB; SVG disabled with reason; Team CSV `FilteredAllClassesGrid_….csv` 5.9 KB, Team PDF 14 KB; card PDF 291 KB; `b08-structure-grid/diffAllPlot-7-export-dialog.png` |
| 8 | Finish | PASS | `b08-structure-grid/diffAllPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps `all_color_map=carbon_lfc`: `b08-structure-grid/diffAllPlot-9-duplicate.png` |
| 10 | Save and reopen | PASS | `all_color_map=carbon_lfc`, label, background kept: `b08-structure-grid/diffAllPlot-10-reopened.png`; deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at both sizes: `b08-structure-grid/diffAllPlot-12-layout-1440-data.png`, `…-1024-data.png`, `…-1440-card.png`, `…-1024-card.png` |

Auditor (Opus 5.5): OPEN – as heatmapPlot (F1 live re-check; F2 fixed). Subtitle clipped and legend title overlap at 620 px
are Team's ggplot (recorded above).

Adversary (Astra): —

## Still open after this round

1. Run `tests/dual-ui/test_api_computed_controls.R` (R) on the fix `2b87f1a0`, deploy to the audit API, re-run
   `audit_b08-structure-grid.cjs` for check #4 (the field "Log2FC Threshold (abs):" in the Data tab, a change redraws,
   −1 refused).
2. F2 residual for the designer: the console `<pre>` is not monospace.
3. N1 (gated row adds nothing after confirming) and N3 (conditional controls always shown): decisions for the
   coordinator / designer.

# Round 2 (2026-11-08, API 96b8742d)

Auditor: Opus 5.5, second round. Audit API `127.0.0.1:3962` (health: `commit 96b8742d…`, synthetic checkpoint
`nexo-complete-synthetic` only), Vite `:5287` with `vite.audit.config.mjs`, Chromium 1440×900. Script:
`node tests/dual-ui/chart-audit/audit_b08-structure-grid.cjs [outputName …]` (default base now `:5287`). New in the
script for this round (F1 re-check): check #4 finds the threshold field in the Data tab, sets 0 → 0.5 and waits for a
new image, types −1 and asserts a visible `role=alert` message, `aria-invalid`, **0 PATCH** and no redraw; #9 asserts
the duplicate's threshold, #10 the reopened threshold and downloads the saved ZIP (`/api/v1/checkpoints/<id>/download`,
unzipped in `<tmp>`): `team-canvas-v1.json` must not carry `gridLog2fcThresh`, `nexo-canvas-v1.json` must carry 0.5.
The save itself goes through Team's validator (`api_checkpoint_save` → `api_canvas_validate`, the
`team-canvas-state-ack` gate, `R/frontends/api/storage.R:90-93`): a 200 save is a canvas Team accepted. Console
errors now carry their source URL. Each save is `audit-b08-structure-grid-synthetic`, deleted at the end (200).

Mock layout sweep (`NEXO_SWEEP_ONLY=` the four sources), after the fixes of this round:

```
PASS chromium:1024x768 structural_grid_tab-diffAllPlot
PASS chromium:390x844 phone
SUMMARY offenders=0 sources=4 engines=chromium
```

## Round 2 findings (batch-wide)

- **F1 re-checked live: PASS.** The field is in the Data tab, at the top of the computed section, as
  "Log2FC Threshold (abs)" with Team's tooltip sentence as help text under it (Nexo's `splitLabel` moves a label's
  help sentence out and drops the colon before it, as for every helped label; Team shows "Log2FC Threshold (abs):" plus
  an info icon). `min=0 step=0.1`, value 0 = Team's default (`12_structural_grid_module.R:305-322`). 0 → 0.5 redraws
  the card; −1 is refused in place (no request); duplicate and save/reopen keep 0.5; the saved ZIP keeps it out of
  Team's canvas and in Nexo's member. Evidence per plot below, e.g.
  `b08-structure-grid/heatmapPlot-4-threshold-changed.png`, `b08-structure-grid/heatmapPlot-4-threshold-invalid.png`.
- **F3 (Nexo bug, new, fixed).** Refusing −1 said **"Enter a number from 0 to null."**: the live schema sends
  `"max": null` for Team's `numericInput` without a max, and `phrases.numberBounds` (`src/ui/strings.ts:93`) tested
  `!== undefined`. Now null is absent: "Enter a number of at least 0." (re-checked live on 3962).
  - Red `522c945`: `× numberBounds > treats a null bound as absent` / `AssertionError: expected 'Enter a number from 0
    to null.' to be 'Enter a number of at least 0.'`; full run `Test Files 2 failed | 118 passed (120)`, `Tests 2 failed
    | 563 passed (565)` (with the F2 test below; `tsc` red on the test's `null` argument until the signature widens).
  - Green `beba50f`: vitest `Test Files 120 passed (120)`, `Tests 565 passed (565)`; `tsc --noEmit` clean; mock
    `test_nexo_inspector.cjs` 42 PASS / 0 FAIL (`H3 OK`), `test_nexo_card_chrome.cjs` 29 PASS / 0 FAIL (`H6-0 OK`);
    sweep `SUMMARY offenders=0 sources=4`.
  - Not changed (type debt, recorded): `SchemaControl.min/max/step` are typed `number | undefined`
    (`src/api/types.ts:23`) though the API sends `null`; only the message needed the fix.
- **F2 residual (fixed, one CSS selector).** The Statistics Console `<pre>` drew in the UI font because
  `#inspector pre{font-family:var(--font)…}` (`src/ui/shell.css:5`, ID specificity) beat `.module-dialog-body pre`
  (the dialog sits inside `#inspector` in the DOM). The rule now also reads `#inspector .module-dialog-body pre`
  (`src/ui/shell.css:288`), so the report is monospace with Team's columns aligned, margin 0 and the dialog's own
  background: `b08-structure-grid/heatmapPlot-4-action.png`. Red `522c945`
  (`× … draws the console report in a monospace font even inside the Inspector` / `expected [ '.module-dialog-body pre' ]
  to include '#inspector .module-dialog-body pre'`), green `beba50f` (counts above).

## Round 2 · heatmapPlot · Structural grid · selected class heatmap (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Design confirmed in the Library (Animal, independent), then added; Draft 100 % and zoomed out (frozen tier image): `b08-structure-grid/heatmapPlot-1-draws.png`, `b08-structure-grid/heatmapPlot-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Module render 620×680 PNG (20 330 B) for the same inputs; card image 620×720 shown at 618×682; `textSize` = catalog default 12 |
| 3 | Size | PASS | 620→780→390 px, redrawn each time, nothing overflows: `b08-structure-grid/heatmapPlot-3-larger.png`, `b08-structure-grid/heatmapPlot-3-smaller.png` |
| 4 | Data tab | **PASS** (F1 live; F3 fixed) | All 20 markup controls, renderUI `lipid_class` and **`gridLog2fcThresh`** present. "Log2FC Threshold (abs)" 0→0.5 redrew (`b08-structure-grid/heatmapPlot-4-threshold-changed.png`); −1 refused in place: "Enter a number of at least 0." (before `beba50f`: "Enter a number from 0 to null."), `aria-invalid`, 0 PATCH, no redraw, state current (`b08-structure-grid/heatmapPlot-4-threshold-invalid.png`). "Plot Base Text Size" 16 redrew (`b08-structure-grid/heatmapPlot-4-data-changed.png`); −3 refused: "Could not update the plot: Invalid value for textSize: below the minimum 6" (`b08-structure-grid/heatmapPlot-4-data-invalid.png`). "Show Statistic Detail" → Statistics Console, monospace report, readable Close (`b08-structure-grid/heatmapPlot-4-action.png`) |
| 5 | Appearance | PASS | Label renames the card, Background rgb(255, 244, 224), canvas Undo/Redo; image plot, no Plotly-only control: `b08-structure-grid/heatmapPlot-5-appearance.png` |
| 6 | Statistics | N/A | Team has no statistics tab for this plot (its console is a module action, #4); tab: "Statistics are available for independent violin copies." |
| 7 | Export | PASS | Card PNG 269 943 B; SVG disabled: "This figure is a raster image; SVG is not available."; Team CSV `GridData_GL_TAG_….csv` 1 030 B, Team PDF `HeatmapGrid_GL_TAG_….pdf` 6 191 B; card PDF 211 917 B: `b08-structure-grid/heatmapPlot-7-export-dialog.png` |
| 8 | Finish | PASS | Snapshot 423×498 in a 421×460 body; Edit figure → live PNG: `b08-structure-grid/heatmapPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Header Duplicate keeps label, `textSize=16`, **`gridLog2fcThresh=0.5`**; remove + Undo brings it back drawn: `b08-structure-grid/heatmapPlot-9-duplicate.png` |
| 10 | Save and reopen | PASS | Saved through Team's validator (200); reopened in a new page: "Audit heatmapPlot", `textSize=16`, **`gridLog2fcThresh=0.5`**, background kept (`b08-structure-grid/heatmapPlot-10-reopened.png`); ZIP members `state.json, shared-state-v1.json, team-canvas-v1.json, data_files/…, nexo-canvas-v1.json`: Team canvas without `gridLog2fcThresh`, Nexo member 0.5; checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors (the 400 of the refused −3 PATCH is a network response surfaced as the toast) |
| 12 | Layout | PASS | 0 offenders at 1440×900 and 1024×768, 4 tabs each, every section open, card header and ⋯ menu: `b08-structure-grid/heatmapPlot-12-layout-1440-data.png`, `…-1440-card.png`, `…-1024-data.png`, `…-1024-card.png` |

Auditor (Opus 5.5): AGREE – F1 live and complete (field, redraw, −1 refused, duplicate, reopen, Team-valid ZIP);
F3 and the F2 residual fixed (`522c945` red, `beba50f` green).

Adversary (Astra): —

## Round 2 · dotplotPlot · Structural grid · selected class dotplot (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `b08-structure-grid/dotplotPlot-1-draws.png`, `b08-structure-grid/dotplotPlot-1-zoomed-out.png` (frozen tier image) |
| 2 | Matches Team | PASS | Module render 620×680 (32 523 B); card image 620×720 shown at 618×682; `pointSize` = catalog default 6 |
| 3 | Size | PASS | 620→780→390 px, redrawn: `b08-structure-grid/dotplotPlot-3-larger.png`, `b08-structure-grid/dotplotPlot-3-smaller.png` |
| 4 | Data tab | **PASS** (F1 live; F3 fixed) | All 20 markup controls, `lipid_class`, `gridLog2fcThresh` present. Threshold 0→0.5 redrew (`b08-structure-grid/dotplotPlot-4-threshold-changed.png`); −1 refused: "Enter a number of at least 0.", 0 PATCH, no redraw (`b08-structure-grid/dotplotPlot-4-threshold-invalid.png`). "Base Dot Size (Dotplot)" 10 redrew (`b08-structure-grid/dotplotPlot-4-data-changed.png`); −2 refused: "Could not update the plot: Invalid value for pointSize: below the minimum 2" (`b08-structure-grid/dotplotPlot-4-data-invalid.png`); "Show Statistic Detail" → console dialog (`b08-structure-grid/dotplotPlot-4-action.png`) |
| 5 | Appearance | PASS | `b08-structure-grid/dotplotPlot-5-appearance.png` |
| 6 | Statistics | N/A | As heatmapPlot |
| 7 | Export | PASS | Card PNG 346 630 B; SVG disabled with the reason; Team CSV 1 030 B, Team PDF `DotplotGrid_GL_TAG_….pdf` 7 101 B; card PDF 292 457 B: `b08-structure-grid/dotplotPlot-7-export-dialog.png` |
| 8 | Finish | PASS | Snapshot 423×498 in a 421×460 body: `b08-structure-grid/dotplotPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps `pointSize=10`, `gridLog2fcThresh=0.5`: `b08-structure-grid/dotplotPlot-9-duplicate.png` |
| 10 | Save and reopen | PASS | Team-validated save (200); reopened `pointSize=10`, `gridLog2fcThresh=0.5`, label, background: `b08-structure-grid/dotplotPlot-10-reopened.png`; ZIP: Team canvas without the threshold, Nexo member 0.5; deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at both sizes: `b08-structure-grid/dotplotPlot-12-layout-1440-data.png`, `…-1024-data.png`, `…-1440-card.png`, `…-1024-card.png` |

Auditor (Opus 5.5): AGREE – as heatmapPlot.

Adversary (Astra): —

## Round 2 · mergedPlot · Structural grid · all classes (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `b08-structure-grid/mergedPlot-1-draws.png`, `b08-structure-grid/mergedPlot-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Module render 620×680 (41 571 B); card image 620×720 shown at 618×682; `position` = catalog default `both` |
| 3 | Size | PASS | 620→780→390 px, redrawn: `b08-structure-grid/mergedPlot-3-larger.png`, `b08-structure-grid/mergedPlot-3-smaller.png` |
| 4 | Data tab | **PASS** (F1 live; F3 fixed) | All 20 markup controls and `gridLog2fcThresh` present. Threshold 0→0.5 redrew (`b08-structure-grid/mergedPlot-4-threshold-changed.png`); −1 refused: "Enter a number of at least 0.", 0 PATCH, no redraw (`b08-structure-grid/mergedPlot-4-threshold-invalid.png`). Position → sn-1 redrew (`b08-structure-grid/mergedPlot-4-data-changed.png`); "Show Statistic Detail" → console dialog (`b08-structure-grid/mergedPlot-4-action.png`) |
| 5 | Appearance | PASS | `b08-structure-grid/mergedPlot-5-appearance.png` |
| 6 | Statistics | N/A | As heatmapPlot |
| 7 | Export | PASS | Card PNG 259 809 B; SVG disabled with the reason; Team CSV `MergedClassesGrid_….csv` 2 030 B, Team PDF 7 333 B; card PDF 220 421 B: `b08-structure-grid/mergedPlot-7-export-dialog.png` |
| 8 | Finish | PASS | `b08-structure-grid/mergedPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps `position=sn1`, `gridLog2fcThresh=0.5`: `b08-structure-grid/mergedPlot-9-duplicate.png` |
| 10 | Save and reopen | PASS | Team-validated save (200); reopened `position=sn1`, `gridLog2fcThresh=0.5`, label, background: `b08-structure-grid/mergedPlot-10-reopened.png`; ZIP: Team canvas without the threshold, Nexo member 0.5; deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at both sizes: `b08-structure-grid/mergedPlot-12-layout-1440-data.png`, `…-1024-data.png`, `…-1440-card.png`, `…-1024-card.png` |

Auditor (Opus 5.5): AGREE – as heatmapPlot.

Adversary (Astra): —

## Round 2 · diffAllPlot · Structural grid · differential overview (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `b08-structure-grid/diffAllPlot-1-draws.png`, `b08-structure-grid/diffAllPlot-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Module render 620×680 (71 984 B); card image 620×720 shown at 618×682. Same-size comparison (below): the card's image and the module's own PNG are **byte-identical** at 620×720 (default inputs, sha256 `c3d4f481b499…`; colour = Carbon Length L2FC, `a5e50a54749f…`) and at 390×520 (`dac7c630ebe8…`): `b08-structure-grid/diffAllPlot-2-team-620.png`, `…-2-team-620-carbon.png`, `…-2-team-small-carbon.png`, `…-2-card-small-carbon.png` |
| 3 | Size | PASS (Team module clips below 620 px — at 390×520 the subtitle runs off the right edge and "Class Contour" overlaps it, whole at 620×720; same PNG as Team) | 620→780→390 px, redrawn: `b08-structure-grid/diffAllPlot-3-larger.png`, `b08-structure-grid/diffAllPlot-3-smaller.png` |
| 4 | Data tab | **PASS** (F1 live; F3 fixed) | All 20 markup controls, `gridLog2fcThresh` and the renderUI multi-class controls (`all_size_map`, `all_color_map`, `all_alpha_map`, `hide_non_sig_all_classes`) present. Threshold 0→0.5 redrew (`b08-structure-grid/diffAllPlot-4-threshold-changed.png`); −1 refused: "Enter a number of at least 0.", 0 PATCH, no redraw (`b08-structure-grid/diffAllPlot-4-threshold-invalid.png`). "Map Dot Color to" → Carbon Length L2FC redrew (`b08-structure-grid/diffAllPlot-4-data-changed.png`); "Show Statistic Detail" → console dialog (`b08-structure-grid/diffAllPlot-4-action.png`) |
| 5 | Appearance | PASS | `b08-structure-grid/diffAllPlot-5-appearance.png` |
| 6 | Statistics | N/A | As heatmapPlot |
| 7 | Export | PASS | Card PNG 571 136 B; SVG disabled with the reason; Team CSV `FilteredAllClassesGrid_….csv` 5 883 B, Team PDF 14 418 B; card PDF 490 319 B: `b08-structure-grid/diffAllPlot-7-export-dialog.png` |
| 8 | Finish | PASS | `b08-structure-grid/diffAllPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps `all_color_map=carbon_lfc`, `gridLog2fcThresh=0.5`: `b08-structure-grid/diffAllPlot-9-duplicate.png` |
| 10 | Save and reopen | PASS | Team-validated save (200); reopened `all_color_map=carbon_lfc`, `gridLog2fcThresh=0.5`, label, background: `b08-structure-grid/diffAllPlot-10-reopened.png`; ZIP: Team canvas without the threshold, Nexo member 0.5; deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at both sizes: `b08-structure-grid/diffAllPlot-12-layout-1440-data.png`, `…-1024-data.png`, `…-1440-card.png`, `…-1024-card.png` |

**Subtitle clip / legend title overlap: Team behaviour, not a Nexo bug.** Round 1 placed it "at 620 px"; it is not
there: at 620×720 Team's PNG shows the whole subtitle "Position: BOTH | Size: Carbon Length L2FC | Color: Carbon Length
L2FC" and a clear "Class Contour" title (`b08-structure-grid/diffAllPlot-2-team-620-carbon.png`). The defect is on the
**narrow** card (390×520, the size check #3 leaves and #10 reopens): the subtitle runs past the right edge and the
"Class Contour" legend title draws over it. Team's own render at 390×520 draws exactly that, byte for byte the image
the card shows (`b08-structure-grid/diffAllPlot-2-team-small-carbon.png` = `…-2-card-small-carbon.png`,
`b08-structure-grid/diffAllPlot-10-reopened.png`). Cause: Team's ggplot (`R/modules/12_structural_grid_module.R:964-973`,
`labs()` with a long one-line `paste0` subtitle; legends at ggplot's default right) at a narrow device; Nexo requests the card's size and draws
what Team returns. Proposal for Max's module (not implemented): wrap the subtitle (`\n` between the Size and Color
parts) or put the legends at the bottom below a width. A Nexo-side option for the designer: a minimum requested width
for this plot so the card letterboxes rather than asks Team for a 390 px figure.

Auditor (Opus 5.5): AGREE – F1 live and complete; the narrow-card clip is Team's ggplot (same bytes as Team's render).

Adversary (Astra): —

## Round 2 · N1 and N3 (re-checked live; recommendation, not implemented)

**N1 – gated row adds nothing after confirming: still so on 96b8742d.** Library → "Structural grid · differential
overview · Requires configuration · Confirm study design…" (`b08-structure-grid/diffAllPlot-N1-1-gated-row.png`) →
"Confirm study design" dialog, Animal / independent (`b08-structure-grid/diffAllPlot-N1-2-design-dialog.png`) →
Confirm: the dialog closes, **0 cards on the canvas**, and all four structural grid tiles now read "Ready"
(`b08-structure-grid/diffAllPlot-N1-3-after-confirm.png`); a second click adds the plot.
`src/ui/Library/Library.tsx:113-116` (`onConfirmed` sets the session design and marks the `needs: 'de'` rows ready,
nothing else). **Recommendation:** remember which row opened the dialog and, when `design.allowed`, add that plot
right away (the same `add(entry)` the Ready row calls), as the older `canvas.ts` dialog did; keep the other rows
"Ready" without adding them. If the design is not allowed, keep today's behaviour (dialog says why, nothing added).
Test: Library unit/E2E "confirming from a gated row adds that row's plot once". Small (one pending-entry state).

**N3 – conditional controls always shown: still so.** On diffAllPlot's Data tab
(`b08-structure-grid/diffAllPlot-N3-data-tab.png`) Nexo shows Low/Mid/High colours while "Custom Grid Colors" is off
(`customScaleColors=false`), the "P-value Cutoff Slider" (0.05) while visibility is Team's default "Significant Only" (`:66-69`),
both "Stars Size" and "P-Value Size" whatever the annotation, "Legacy Label Size" that Team hides with
`display: none`, and the single-class "Lipid Class" picker alongside the multi-class mappings. Team gates these with
`conditionalPanel` (`R/modules/12_structural_grid_module.R:45-69`, `:85-91`). The catalog/schema carries no
condition for a control (`shownBy` is the output's tab, `R/frontends/api/catalog.R:106`), so Nexo cannot hide them
today. **Recommendation (two steps, API first):** (1) the API exports, per control, the `data-display-if` expression
of its enclosing `conditionalPanel` (Shiny writes it in the markup the catalog already parses) and a `hidden` flag for
Team's `display: none` wrappers; (2) Nexo evaluates a small safe subset (`input.x == 'v'`, `== true/false`, `!=`,
`&&`, `||`) against the card's current inputs and hides (not removes) what does not apply; anything it cannot parse
stays shown, so nothing Team offers can disappear. Every control keeps working today; this is noise, not a gap, so it
belongs to the designer / coordinator queue, not an audit FAIL.

## Round 2 · summary

| Plot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| heatmapPlot | PASS | PASS | PASS | PASS (F1 live; F3 fixed) | PASS | N/A | PASS | PASS | PASS | PASS | PASS | PASS |
| dotplotPlot | PASS | PASS | PASS | PASS (F1 live; F3 fixed) | PASS | N/A | PASS | PASS | PASS | PASS | PASS | PASS |
| mergedPlot | PASS | PASS | PASS | PASS (F1 live; F3 fixed) | PASS | N/A | PASS | PASS | PASS | PASS | PASS | PASS |
| diffAllPlot | PASS | PASS | PASS | PASS (F1 live; F3 fixed) | PASS | N/A | PASS | PASS | PASS | PASS | PASS | PASS |

Runs: `heatmapPlot` `AUDIT OK: 12 checks, 0 failed` (after `beba50f`); `dotplotPlot mergedPlot diffAllPlot`
`AUDIT OK: 36 checks, 0 failed`. Fixes this round: F3 + F2 residual, red `522c945`, green `beba50f`. Checkpoints:
no `audit-b08-*` left on 3962 (each run deleted its save, 200; the list shows only `nexo-complete-synthetic` and 5
autosaves, which were not touched).

## Still open after round 2

1. Adversary review of rounds 1–2 (Astra).
2. N1 and N3: decisions (recommendations above).
3. diffAllPlot narrow-card clip: Team's ggplot (proposal for the module owner; optional Nexo minimum render width for
   the designer).
4. Type debt: `SchemaControl.min/max/step` typed without `null` though the API sends it (`src/api/types.ts:23`).
5. Recorded only (other tasks' topics): none observed this round.

Astra review 2026-11-08: `structural_grid_tab-diffAllPlot` check 3 (both rounds) now reads "PASS (Team module clips below 620 px …; same PNG as Team)": round 2's byte comparison proves the clip is Team's, not that the narrow card is readable.
