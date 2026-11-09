# Chart audit · b06-differential (Differential analysis, violin distributions, group comparison)

Auditor: Opus 5.5 (claude-b), first round. Protocol: `docs/integration/nexo-chart-audit-plan.md` checks 1–11 plus
check 12 "Layout". Checks: `node tests/dual-ui/chart-audit/audit_b06-differential.cjs [outputName …]` (Chromium
1440×900, Vite :5186 serving `vite.audit.config.mjs` with `NEXO_AUDIT_API=http://127.0.0.1:3962`, checkpoint
`nexo-complete-synthetic`; saves `audit-b06-differential-synthetic` and deletes it after each plot). The script follows
`audit_b03-qc-b.cjs` (same structure, checks and evidence names) and adds: the study design is confirmed through the
Library dialog first (unit Animal, independent; as `test_nexo_layout_sweep.cjs` does), the group comparison's
reference group is confirmed on the card, check 6 runs the group comparison statistics (results, CSV, report), and
check 12 opens every Inspector tab and every expandable section at 1440×900 and 1024×768 and runs the layout sweep's
rules (spill, overlap, escape; card chrome) plus "every slider stays inside the Inspector". Duplicate is pressed in the
card header chrome (cards have no footer any more). Raw results: `b06-differential/results-*.json`. Screenshots:
`b06-differential/<output>-<check>.png` (all ≤ 400 KB).

Mock layout sweep for this batch (`NEXO_PLOTLY_JS=<repo>/frontends/nexo/public/vendor/plotly.min.js
NEXO_SWEEP_ONLY=volcano_tab-volcanoPlot,lsea_tab-lseaPlot,logratio_tab-logratioPlot,group_comparison_tab-comparisonPlot
node tests/dual-ui/test_nexo_layout_sweep.cjs`), before any change in this task:

```
PASS chromium:1024x768 group_comparison_tab-comparisonPlot
PASS chromium:1024x768 logratio_tab-logratioPlot
PASS chromium:390x844 phone
SUMMARY offenders=0 sources=4 engines=chromium
```

## volcanoPlot · Differential volcano (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Study design confirmed in the Library dialog (Animal, independent), then added: Draft 100 % and zoomed out (frozen tier image): `b06-differential/volcanoPlot-1-draws.png`, `b06-differential/volcanoPlot-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Module render 620×680 (51 KB) for the same inputs; card 620×720 shown at 618×682; `pointSize` = catalog default 4. Title "Volcano Plot (Treatment_T1+Treatment_T2+Treatment_T3 vs Con…" is cut at the right edge at the 620 px default width: that is the module's ggplot title at that width (same in the module render); at 780 px it fits (`volcanoPlot-3-larger.png`). Note for the designer |
| 3 | Size | PASS | 620→780→390 px wide, redrawn each time, nothing overflows: `b06-differential/volcanoPlot-3-larger.png`, `b06-differential/volcanoPlot-3-smaller.png` |
| 4 | Data tab | PASS (after fix F1) | All 26 Team controls present (allowedInputs = Team markup); "Dot Size" 6 → redrew (`b06-differential/volcanoPlot-4-data-changed.png`); −3 refused: card state error, plot kept, "Could not update the plot: Invalid value for pointSize: below the minimum 0.1" (API 400; `b06-differential/volcanoPlot-4-data-invalid.png`). The five sliders (Label Top N, Weight abs(Log2FC), Weight −Log10P, Alpha, Dot Stroke) showed no value — see F1 |
| 5 | Appearance | PASS | Image plot: Label, Background, Size; no Plotly-only control that would silently do nothing (`b06-differential/volcanoPlot-5-appearance.png`); canvas Undo/Redo |
| 6 | Statistics | N/A | Team has no statistics for the volcano; the tab says "Statistics are available for independent violin copies." |
| 7 | Export | PASS | Card PNG 405 KB, SVG disabled with the reason "This figure is a raster image; SVG is not available.", card PDF 334 KB; Team CSV `volcano_data.csv` 33 KB and PDF `volcano_plot.pdf` 10 KB; `b06-differential/volcanoPlot-7-export-dialog.png` |
| 8 | Finish | PASS | Snapshot 423×498; Edit figure → live PNG; `b06-differential/volcanoPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate (card header) keeps label and `pointSize=6`; remove + Undo brings it back drawn: `b06-differential/volcanoPlot-9-duplicate.png` |
| 10 | Save and reopen | PASS | Saved `audit-b06-differential-synthetic`, reopened in a new page: label, `pointSize=6`, background kept (`b06-differential/volcanoPlot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors (the one HTTP 400 is the refused −3 of check 4) |
| 12 | Layout | PASS | 0 offenders at 1440×900 and 1024×768 over Data/Appearance/Statistics/Export with every section open; the 5 sliders (alpha, label weights…) stay inside the Inspector: `b06-differential/volcanoPlot-12-layout-<1440|1024>-<tab>.png`; mock sweep PASS (above) |

Findings:
- **F1 (Nexo bug, fixed):** single-value sliders in the Inspector (`<input type=range>` from Team's `sliderInput`)
  showed no value at all: a user moving "Alpha" or "Label Top N (or %)" could not see what they set; Team's
  sliderInput prints the value. Same on the violin plots' "Plot Height (px)" and LSEA's slider. The Inspector now prints
  the current value beside the slider (`<output for=…>`, `SchemaForm.tsx`, `.range-single` in `shell.css`; the
  slider keeps the full width minus the readout). Red `ef50a9d` (`AssertionError: expected '<form class="schema-form">
  <fieldset><…' to match /<output[^>]*for="labelThreshold"[^>]*>25<\/output>/`, Tests 2 failed (2)), green: see
  "Fixes" at the end.

Auditor (Opus 5.5): AGREE (with F1 fixed)

Adversary (Astra): —

## lseaPlot · Lipid set enrichment (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Design confirmed (Animal, independent); `b06-differential/lseaPlot-1-draws.png`, `b06-differential/lseaPlot-1-zoomed-out.png` (frozen tier image) |
| 2 | Matches Team | PASS | Module render 620×680 (24 KB) for the same inputs; card 620×720 shown at 618×682; `pointSize` = catalog default 5 |
| 3 | Size | PASS | 620→780→390 px, redrawn each time: `b06-differential/lseaPlot-3-larger.png`, `b06-differential/lseaPlot-3-smaller.png` |
| 4 | Data tab | PASS | All 13 controls of Team's markup present. The four allowedInputs Team builds in `renderUI` (`lseaGrouping` "Set Type", `splitBy` "Split Plots By", `topLipidsSortBy`, `numLipids`; `R/modules/7_lsea_module.R` l.155, 188, 285-289) are served as computed controls: the Data tab has one slider, and the module's only slider is `numLipids` (the static markup has none). "Point Size (Scale)" 8 → redrew (`b06-differential/lseaPlot-4-data-changed.png`); −3 refused: "Could not update the plot: Invalid value for pointSize: below the minimum 1" (`b06-differential/lseaPlot-4-data-invalid.png`) |
| 5 | Appearance | PASS | Image plot: Label, Background, Size (`b06-differential/lseaPlot-5-appearance.png`); canvas Undo/Redo |
| 6 | Statistics | N/A | Team has no statistics tab for LSEA (the enrichment test is the plot itself) |
| 7 | Export | PASS | Card PNG 361 KB, SVG disabled with the reason, card PDF 257 KB; no Team downloads next to this plot; `b06-differential/lseaPlot-7-export-dialog.png` |
| 8 | Finish | PASS | Snapshot 423×498; Edit figure → live PNG; `b06-differential/lseaPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps `pointSize=8`; remove + Undo restores it drawn: `b06-differential/lseaPlot-9-duplicate.png` |
| 10 | Save and reopen | PASS | Reopened: label, `pointSize=8`, background kept (`b06-differential/lseaPlot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at 1440×900 and 1024×768, all tabs and sections open: `b06-differential/lseaPlot-12-layout-<1440|1024>-<tab>.png`; mock sweep PASS |

Auditor (Opus 5.5): AGREE

Adversary (Astra): —

## logratioPlot · Violin distributions (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `b06-differential/logratioPlot-1-draws.png`, `b06-differential/logratioPlot-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Module render 620×680 (34 KB); card 620×720 shown at 618×682; `showBaseline` = catalog default false |
| 3 | Size | PASS | 620→780→390 px, redrawn: `b06-differential/logratioPlot-3-larger.png`, `b06-differential/logratioPlot-3-smaller.png` |
| 4 | Data tab | PASS | All 25 Team controls present; the renderUI allowedInputs (`selectedBaseline` "Baseline Reference (Violin View)", `featureLevel` "Analyze Features At", `selectedFeatures_flat`) are shown as computed controls (`logratioPlot-9-duplicate.png` shows the baseline picker). "Show Baseline (Y=0) Line" → redrew (`b06-differential/logratioPlot-4-data-changed.png`); no free numeric value to refuse (the two-ended ranges are number pairs bounded by Team's min/max) |
| 5 | Appearance | PASS | Image plot: Label, Background, Size (`b06-differential/logratioPlot-5-appearance.png`) |
| 6 | Statistics | N/A | No Statistics tab in Team for this plot: its local test (Statistical Mode Choice, Significance Label Format) is drawn by the module and set in the Data tab; "Show Statistic Detail" is a Data-tab module action |
| 7 | Export | PASS | Card PNG 280 KB, SVG disabled with the reason, card PDF 218 KB; Team CSV `Violin_Plots_Data_<date>.csv` 3.4 KB and PDF `Violin_Plots_<date>.pdf` 18 KB; `b06-differential/logratioPlot-7-export-dialog.png`. Team's drawer also has four "Batch Exports" (ZIP/CSV per Lipid Category and per Lipid Main Class); the API lists them for the group comparison card but not here — see F3 |
| 8 | Finish | **FAIL (not concluded)** | Three runs: after the export check, Finish leaves the card "Updating…"/"Up to date" and never "Finished" within 180 s (`b06-differential/logratioPlot-8-finish-failed.png`, run 4: Inspector open, Finish pressed, state `updating`). A fresh logratio card (probe: add, Finish) is "Finished" within 5 s. Run 2 and run 3 additionally saw the page come back on the autosave checkpoint (run 3: Vite reload caused by this task's own source edit; run 2: cause not established, the auditor's probe ran at the same time and may have evicted the session). Not reproduced on volcano/LSEA. Needs a re-run with the API to itself |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps label and inputs; remove + Undo restores it: `b06-differential/logratioPlot-9-duplicate.png` (the value read was `showBaseline=false` after the check-8 trouble) |
| 10 | Save and reopen | PASS | Reopened with label, inputs and background as saved (`b06-differential/logratioPlot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at both sizes; the "Plot Height (px)" slider stays inside the Inspector and (after F1) shows its value: `b06-differential/logratioPlot-12-layout-<1440|1024>-<tab>.png`; mock sweep PASS |

Auditor (Opus 5.5): OPEN – check 8 (Finish after export never finishes in the audit sequence) to re-run and diagnose

Adversary (Astra): —

## comparisonPlot · Lipid class comparison (catalog `html`; the card draws Team's group comparison message as Plotly)

Evidence is from run 5 (checks 1–8, design confirmed, reference group confirmed on the card) and run 2 (check 12).
Run 5 lost its page at 04:26:02 UTC to a Vite reload caused by this task's own source edit (fix F4), so its checks
9/10/12 were stopped. Run 2 lost its session (`409`) to this auditor's own concurrent probe. Run 6 got
`409 POST …/group-comparison/confirm` (session evicted by the other auditor sharing the API, or a stale token) and had
not concluded before the time limit.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Design confirmed (Animal, independent); the card asks "Confirm the reference group to compute the comparison." → Confirm reference group → drawn. `b06-differential/comparisonPlot-1-draws.png`, `b06-differential/comparisonPlot-1-zoomed-out.png` (frozen tier image) |
| 2 | Matches Team | PASS | The module answers Team's group comparison message (216 rows, groups Control/Treatment, `requiresConfirmation`, `inferenceAllowed`…); the card draws it with the port of Team's `draw()` (`groupComparison/model.ts`): 4 traces (violin, scatter), legend above, Ceramide panel, significance bracket |
| 3 | Size | **FAIL** | Larger: redrawn at 780 px (`b06-differential/comparisonPlot-3-larger.png`). Smaller (390 px): "4 element(s) overflow the card body" (the Plotly root and its `svg.main-svg` layers run past the body's right/bottom edge by more than 2 px): the figure is drawn at `node.width` and a fixed height (`model.ts` l.83: 380 px + legend for one panel, 420 px per row), not at the body's box. Not fixed in this round |
| 4 | Data tab | PASS (after fix F4) | All 25 Team controls present; the renderUI allowedInputs are computed controls (`selectedBaseline`, `featureLevel`, `selectedFeatures_flat`; `plotHeight` is a static slider in Team's logratio markup that this card's schema does not show, and Team's own group comparison does not read it). "Fold Change (Linear)" → redrew (`b06-differential/comparisonPlot-4-data-changed.png`). The Data tab showed an empty unlabeled text box at the top (`comparisonPlot-3-larger.png`): Team's hidden confirmation token — F4. Note: "Show Baseline (Y=0) Line", "Show only significant features", "Use Short Y-axis Title", "Panel height", "Panels per row" are in Team's drawer but Team's group comparison ignores them (they are not in the message settings, `R/frontends/team/group_comparison.R` l.21-33; `www/team/js/group_comparison.js` reads only method/comparison/scale/significance/test) — Team behaviour, recorded, not changed |
| 5 | Appearance | **FAIL** | "font size not on the plot (12)": Chart font size 16 set in the Appearance plot editor did not reach the drawn figure (`_fullLayout.font.size` stayed 12). The Appearance tab holds two `.plot-editor` blocks for this card (strict-mode violation in run 2), so the first one may not be the one that styles the figure; not diagnosed in this round |
| 6 | Statistics | PASS | Reference group confirmed on the card; 9 result rows (first: "Ceramide Treatment vs Control 0.000619 ***"); "Comparison CSV" `lipidomic-group-comparison.csv` 217 lines (header "Sample","GroupingVal","X_Grp","Facet_Grp","Feature","Plot_Value","P_Value","Significance","Is_Baseline"…); full report "GROUP COMPARISON — LOCAL STATISTICS / Test selection: auto / Test applied: Student's t-test (equal variance)"; `b06-differential/comparisonPlot-6-statistics.png`. Without the design confirmed (run 2) every row said "n/a unavailable: unpaired inference is not enabled" |
| 7 | Export | **FAIL (Nexo, fixed in R: F2; to verify)** | "More downloads from this analysis" lists CSV, PDF and **two "Download All PDFs (ZIP)" and two "Download Dataset (CSV)"** with identical names (`b06-differential/comparisonPlot-7-download-Download All PDFs (ZIP)-failed.png`); in Team they sit under "Batch Exports: Lipid Category" / "Batch Exports: Lipid Main Class". The script clicked by name (strict-mode, no file); it now clicks by position. Team CSV/PDF download (toast "Downloaded Violin_Plots_<date>.pdf") |
| 8 | Finish | PASS | Snapshot 423×460 in a 421×460 body; Edit figure → live Plotly; `b06-differential/comparisonPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | not concluded | run 5 stopped by the Vite reload; run 2 lost its session |
| 10 | Save and reopen | not concluded | same |
| 11 | Console | not concluded | run 5: 0 errors up to its stop; run 2: `409` and `500` after the eviction |
| 12 | Layout | PASS | run 2: 0 offenders at 1440×900 and 1024×768 over Data/Appearance/Statistics/Export (Group comparison section, results table, per-panel fieldsets): `b06-differential/comparisonPlot-12-layout-<1440|1024>-<tab>.png`; mock sweep PASS. The empty token box was not flagged by the rules (it fits its box) — F4 |

Findings:
- **F2 (Nexo/API bug, fixed in R, not run here):** downloads of one card that share a label are now qualified with the
  heading they sit under ("Download All PDFs (ZIP) · Batch Exports: Lipid Category"); unique labels are unchanged
  (`R/frontends/api/export.R`: `api_download_links` records the nearest preceding h1–h6, `api_qualify_download_labels`
  called by `api_card_downloads`). Red `8ee8ab0` (test `tests/dual-ui/test_api_download_labels.R`; expected red
  "could not find function api_qualify_download_labels"), green `dc2a43f`. **R cannot run on this machine: the
  coordinator runs `Rscript tests/dual-ui/test_api_download_labels.R` and `tests/dual-ui/test_api_export.R`.**
- **F3 (open):** the violin distributions card (same module) lists only CSV and PDF, while the group comparison card
  lists the four batch exports too; Team's drawer offers them for both. Which container `api_card_downloads` picks
  differs between the two cards; not changed in this round.
- **F4 (Nexo bug, fixed):** Team keeps `gc_baseline_confirmation` in a `display:none` textInput
  (`R/frontends/team/group_comparison.R` l.77) that the card's Confirm button fills; Nexo showed it as an empty,
  unlabeled text box at the top of the Data tab. `formControls` (`frontends/nexo/src/ui/forms/actions.ts`) drops it;
  its value is kept. Red `c557b11` (`AssertionError: expected [ 'gc_baseline_confirmation', …(1) ] to deeply equal
  [ 'panelHeight' ]`), green `cd5423d`.
- Size (#3) and Appearance font size (#5): open. For #5, `refreshEditor` (`frontends/nexo/src/cards.ts` l.583-588)
  rebuilds the group comparison figure and applies `applyEditor` and then `this.styled(…)` (the Nexo presentation
  preset); whether the preset's typography overrides the user's font size is a hypothesis, not verified. (The second
  `.plot-editor` is the colour-blind check `<details class="plot-editor pro-colour-blind">`, not a second editor.)
- Run 6 (`results-comparisonPlot.json` before run 7): `FAIL #1 locator.waitFor: Timeout 180000ms exceeded` after
  `http 409 POST /api/v1/sessions/…/cards/<instance>/group-comparison/confirm`; console `409 (Conflict)`. Session
  eviction by the other auditor or a stale confirmation token; not separated in this round. Run 7 (same script, after
  F4) got the same `409` on confirm and was stopped by the auditor. A probe right after (`Add Lipid class comparison`
  → Confirm reference group, **without** confirming the study design first) confirmed and drew the card ("Up to
  date", Ceramide panel): F4 does not break confirmation. Open question for round 2: does confirming the study design
  in the same page make the card's confirmation token stale (409), or was the session evicted each time?

Auditor (Opus 5.5): OPEN – #3 the figure overflows the card body when the card is small; #5 Chart font size does not reach the figure; #7 duplicate download names fixed in R but not run; #9/#10/#11 to re-run with the API to itself

Adversary (Astra): —

## Fixes in this round

| Finding | Red | Green | Verification |
|---|---|---|---|
| F1 sliders show their value | `ef50a9d` | `9787494` | `sliderValue.test.ts` 2 passed; vitest 101 files / 463 tests; `tsc --noEmit` clean; `test_nexo_inspector.cjs` 40 PASS (H3 OK); `test_nexo_card_chrome.cjs` 29 PASS (H6-0 OK); b06 sweep offenders=0 |
| F2 shared download labels qualified (R) | `8ee8ab0` | `dc2a43f` | not run (no R here): coordinator runs `Rscript tests/dual-ui/test_api_download_labels.R`, `tests/dual-ui/test_api_export.R` |
| F4 hidden confirmation token not shown | `c557b11` | `cd5423d` | `actions.test.ts` passes; vitest 101 files / 464 tests; `tsc --noEmit` clean; `test_nexo_inspector.cjs` 40 PASS; `test_nexo_card_chrome.cjs` 29 PASS |

Mock layout sweep after the fixes (same command as above):

```
PASS chromium:1024x768 logratio_tab-logratioPlot
PASS chromium:390x844 phone
SUMMARY offenders=0 sources=4 engines=chromium
```

## Summary

| Plot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | Auditor |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| volcanoPlot | PASS | PASS | PASS | PASS (F1) | PASS | N/A | PASS | PASS | PASS | PASS | PASS | PASS | AGREE |
| lseaPlot | PASS | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | PASS | PASS | PASS | AGREE |
| logratioPlot | PASS | PASS | PASS | PASS | PASS | N/A | PASS | FAIL (n.c.) | PASS | PASS | PASS | PASS | OPEN |
| comparisonPlot | PASS | PASS | FAIL | PASS (F4) | FAIL | PASS | FAIL (F2) | PASS | n.c. | n.c. | n.c. | PASS | OPEN |

Process notes: two of this auditor's own actions disturbed runs (a concurrent probe evicted a session in run 2; source
edits during runs 3 and 5 made Vite reload the page). The script now logs every navigation of the page so a reload is
visible in the output.

## Coordinator check (2026-11-07, integration of round 1)

- **F2 run on the RTX.** Red at `8ee8ab0`: `Error in api_qualify_download_labels(…)` (function not defined yet). At the
  round's tip the test failed only on the locale of the test host (R started without a UTF-8 locale, so the literal
  "·" in the expectation was read as native bytes while the code builds `·`); the expectation now uses the
  `·` escape, the same assertion. Green: `PASS duplicate download labels carry their section heading`;
  `test_api_export.R` all PASS (presets, 400, the four Team figure bundles, data.csv, more downloads).
