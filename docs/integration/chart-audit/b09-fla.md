# Chart audit · b09-fla (Functional lipid analysis)

Auditor: Opus 5.5 (claude-b), FIRST round. Protocol: `docs/integration/nexo-chart-audit-plan.md` (checks 1–11) plus
check 12 "Layout". Script: `node tests/dual-ui/chart-audit/audit_b09-fla.cjs [outputName …]` (Chromium 1440×900, Vite
:5189 with `NEXO_AUDIT_API=http://127.0.0.1:3962`, audit API 127.0.0.1:3962 running aad45f68, checkpoint
`nexo-complete-synthetic`; saves `audit-b09-fla-synthetic` and deletes it after each plot). `NEXO_AUDIT_DPR=2` runs the
same checks at device pixel ratio 2 (screenshots in `b09-fla/dpr2/`). Raw results: `b09-fla/results-*.json`.
Screenshots: `b09-fla/<output>-<check>.png`.

The script follows `audit_b03-qc-b.cjs` (same checks, same evidence names) with what changed since: Duplicate is in
the card header chrome (no footer); the Library opens from the rail's Plots button; the study design is confirmed
first (Library dialog, unit Animal, independent) for the volcano and the circos, through the Differential volcano
row because the live API (aad45f68) does not gate the FLA rows (finding F1); check 12 opens every Inspector tab with
every `<details>` and every `aria-expanded` toggle open at 1440×900 and 1024×768 and applies the layout sweep's
spill / overlap / escape rules to the Inspector, the card chrome and the card ⋯ menu.

Mock layout sweep (`NEXO_SWEEP_ONLY=fla_tab-logratioPlot,fla_tab-plotVolcano,fla_tab-plotCircos`), before and after
the fix, last lines:

```
PASS chromium:1024x768 fla_tab-plotVolcano
PASS chromium:1024x768 fla_tab-logratioPlot
PASS chromium:1024x768 fla_tab-plotCircos
PASS chromium:390x844 phone
SUMMARY offenders=0 sources=3 engines=chromium
```

## Fixes

- **F1 (Nexo bug, fixed in the API catalog; R side not run):** the Library offered "Functional ratio volcano" and
  "Functional correlation circos" without asking for the study design. Without a confirmed independent design the
  circos draws only Team's "Functional correlation circos requires a confirmed independent study design. Repeated
  observations cannot be treated as independent." (`R/frontends/team/inferential_network_adapter.R:9`;
  `b09-fla/plotCircos-1-card-100.png` of the first run, overwritten by the confirmed run) and the volcano has no
  p-values, so Team's module answers with the misleading "Please select target comparison groups to display volcano
  plot" (`R/modules/10_fla_module.R:1490`; `b09-fla/plotVolcano-7-download-CSV-failed.png`), and its Team CSV fails
  with HTTP 422 (`req(obj)`, module l.1511). With the design confirmed both draw (sections below). Fix: both entries
  get `needs = "de"` in `R/frontends/api/catalog.R` (and in the client mock catalog), so the Library row shows
  "Confirm study design…" as it does for the Differential volcano; the distributions plot stays ungated (it draws
  without a design). Red `56180d34` (vitest `src/catalog.test.ts`:
  `AssertionError: fla_tab-plotVolcano: expected null to be 'de'`, `Tests 1 failed | 5 passed (6)`), green
  `028db1de` (`Tests 6 passed (6)`; full vitest `Test Files 100 passed (100)`, `Tests 462 passed (462)`;
  `tsc --noEmit` clean; `test_nexo_inspector.cjs` 40 PASS, `H3 OK`; `test_nexo_card_chrome.cjs` 29 PASS, `H6-0 OK`;
  sweep 0 offenders). The R assertion is in `tests/dual-ui/test_api_catalog.R` ("PASS FLA volcano and circos need a
  confirmed design"): **not run, no R on the M1; the coordinator runs it.** Same pattern, outside this batch:
  `structural_tab-networkPlot` (b07) goes through the same adapter and is also `needs = NULL`.

## logratioPlot · Functional ratio distributions (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Draft 100 % (620×720 image in a 618×682 box) and zoomed out (frozen tier image): `b09-fla/logratioPlot-1-draws.png`, `b09-fla/logratioPlot-1-card-100.png`, `b09-fla/logratioPlot-1-zoomed-out.png`. No design needed |
| 2 | Matches Team | PASS | Module render 620×680 (69 KB) for the same inputs; card shows its own 620×720 render, `object-fit: contain`: three violin facets (PE/PC_Index, (LPC+LPE)/PL_Index, Energy_Load_Index = Team's default index set, module l.962), Log2FC axis, Control/Treatment; `scaleMode` = catalog default `log2fc` |
| 3 | Size | PASS (Team module clips below 620 px — facet strip index names cut at 390 px, not at 620/780 px; same PNG as Team) | 620→780→390 px wide, redrawn each time, nothing overflows the card body: `b09-fla/logratioPlot-3-larger.png`, `b09-fla/logratioPlot-3-smaller.png`. *At 390 px Team's facet strips crop the index names ("C+LPE)/PL_Inc", "ergy_Load_Inc" in the reopened 390 px card, `b09-fla/logratioPlot-10-reopened.png`): ggplot strip text at that width, Team's own drawing |
| 4 | Data tab | PASS (gap noted) | All 21 controls of Team's FLA markup present, plus the run-time Reference Baseline (`selectedBaseline` = Control) and Compare vs Baseline (`volcano_target_group` = Treatment) from the card schema. "Fold Change (FC)" redrew (`b09-fla/logratioPlot-4-data-changed.png`). Radios/sliders only: no free value to refuse. Gap: Team's index picker (`sel_<category>` checkbox groups built by `indexPickerUI`, module l.877-940) is not in the catalog's `allowedInputs` (built in `R/frontends/team/plot_instances.R`), so in Nexo the plot always shows the default three indices — same class of gap as b03's `bqcSamples` (now offered as a computed control in `R/frontends/api/schema.R:111`); not changed here (see Open) |
| 5 | Appearance | PASS | Image plot: Label renames the card, Background applied (`rgb(255, 244, 224)`), Size; no Plotly-only control (`b09-fla/logratioPlot-5-appearance.png`) |
| 6 | Statistics | N/A | Team's Statistics tab is for violin copies / group comparison; the tab says "Statistics are available for independent violin copies." Team's "Show Statistic Detail" action is in the Data tab |
| 7 | Export | PASS | Card PNG 509 KB; SVG disabled with "This figure is a raster image; SVG is not available."; Team CSV `Functional_Indices_Ledger_….csv` 374 B and PDF `Functional_Violin_Plots_….pdf` 41 KB; card PDF 282 KB; `b09-fla/logratioPlot-7-export-dialog.png` |
| 8 | Finish | PASS | Snapshot 423×498 in a 421×460 body; Edit figure → live PNG: `b09-fla/logratioPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Header Duplicate keeps label and `scaleMode=fc`; remove + Undo brings it back drawn: `b09-fla/logratioPlot-9-duplicate.png` |
| 10 | Save and reopen | PASS (one earlier FAIL, L1) | Re-run 23:41: saved `audit-b09-fla-synthetic`, reopened in a new page: label, `scaleMode=fc`, background kept (`b09-fla/logratioPlot-10-reopened.png`); checkpoint deleted (200). The first full run failed this check once: "reopened scaleMode=other, saved fc" (reopened plot on Log2FC); see L1 |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at 1440×900 and 1024×768 (Data, Appearance, Statistics, Export; details and toggles open; card chrome and ⋯ menu): `b09-fla/logratioPlot-12-layout-1440-data.png` … `-1024-card-menu.png` |

Findings:
- **L1 (intermittent, open):** in the first full run the saved checkpoint reopened with `scaleMode=log2fc` (radio and
  plot) although the Inspector read `fc` just before saving. Not reproduced: a focused probe (add → FC → save → reopen)
  kept `fc` in the card schema, the radio and the plot, and the full script re-run passed 12/12. Possibly a save taken
  while the Data patch was still in flight; recorded for the adversary, not fixed (no reproduction).
- Presentation note for the designer: the Data tab lists all 21 FLA controls for every FLA plot (circos thresholds and
  volcano sizes on the distributions card), because Team's drawer holds them all; grouping them by Team sub-tab would
  read better.

- **Fix (missing-controls-a, 2026-11-08; R unrun on M1) for check 4's gap:** Team's index picker is offered as computed
  controls on FLA cards (`sel_<category>`, one checkbox group per category; label, choices and default read from
  Team's rendered `indexPickerUI`), kept in Nexo's checkpoint member, re-sent on reopen and carried by duplicate; a
  change redraws the card. `allowedInputs` untouched: Team still opens the checkpoint and draws its three defaults.
  Tests: `tests/dual-ui/test_api_missing_controls_a.R` (to run on the RTX), vitest, mock suite
  `tests/dual-ui/test_nexo_missing_controls_a.cjs`; evidence `docs/integration/nexo-phase1-evidence/h9/missing-controls-a/`.

Auditor (Opus 5.5): OPEN – Team's index picker (`sel_<category>`) is not offered (catalog allowedInputs, `R/frontends/team/plot_instances.R`); one unreproduced save/reopen loss (L1)

Adversary (Astra): —

## plotVolcano · Functional ratio volcano (png)

Study design confirmed first (Animal, independent). Without it (first run, `b09-fla/results-all.json`) the card drew
Team's "Please select target comparison groups to display volcano plot" and the Team CSV answered HTTP 422: finding F1,
fixed above.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Design confirmed; Draft 100 % (620×720 image in a 618×682 box) and zoomed out (frozen tier image): `b09-fla/plotVolcano-1-draws.png`, `b09-fla/plotVolcano-1-card-100.png`, `b09-fla/plotVolcano-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Module render 620×680 (46 KB) for the same inputs; card: "Significance across Comparisons", −log10(P_Value) vs Log2FC, indices coloured by category (Energy/Signaling/Structural), repel labels, threshold line, "<- Up in Control \| Up in Target ->"; nothing cropped. `labelMode` = catalog default `Equation`; compare group `Treatment` vs baseline `Control` (card schema) |
| 3 | Size | PASS | 620→780→390 px, redrawn each time, nothing overflows: `b09-fla/plotVolcano-3-larger.png`, `b09-fla/plotVolcano-3-smaller.png` |
| 4 | Data tab | PASS (gap noted) | All 21 FLA controls plus Reference Baseline and Compare vs Baseline (run-time controls in allowedInputs). "Plot Labeling: Functional Name" redrew (`b09-fla/plotVolcano-4-data-changed.png`). Radios/sliders only. Same index-picker gap as logratioPlot #4 (does not affect the volcano, which plots every index) |
| 5 | Appearance | PASS | Image plot: Label, Background, Size; nothing that silently does nothing (`b09-fla/plotVolcano-5-appearance.png`) |
| 6 | Statistics | N/A | Tab says "Statistics are available for independent violin copies." |
| 7 | Export | PASS | Card PNG 496 KB; SVG disabled with the reason; Team CSV `Volcano_Data_….csv` 2.9 KB and PDF `Volcano_Plot_….pdf` 8 KB; card PDF 236 KB; `b09-fla/plotVolcano-7-export-dialog.png`. (First run without design: Team CSV → 422 from Team's `req(obj)`, module l.1511; the failure toast had auto-dismissed when the script looked after 60 s, `b09-fla/plotVolcano-7-download-CSV-failed.png` — the script's 60 s wait, not a Nexo defect) |
| 8 | Finish | PASS | Snapshot 423×498 in a 421×460 body; Edit figure → live PNG: `b09-fla/plotVolcano-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Header Duplicate keeps `labelMode=Functional Name`; remove + Undo brings it back drawn: `b09-fla/plotVolcano-9-duplicate.png` |
| 10 | Save and reopen | PASS | Reopened: label, `labelMode=Functional Name`, background kept (`b09-fla/plotVolcano-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors (the 422 above was only in the run without design) |
| 12 | Layout | PASS | 0 offenders at 1440×900 and 1024×768, all tabs, details/toggles open, card chrome and ⋯ menu: `b09-fla/plotVolcano-12-layout-1440-data.png` … `-1024-card-menu.png` |

Findings: F1 (fixed). Presentation note: Team's "Volcano Plot Height/Width (px)" sliders (1200×600) size the plot in Team's tab
(`volcanoPlotUI`, module l.1353-1357) and its PDF (l.1501-1502); in Nexo they change the Team PDF, while the card
is drawn at the card's size (not verified against Team's canvas in this round).

Auditor (Opus 5.5): AGREE (with F1 fixed; the live API still runs aad45f68, so the gate shows after deploy)

Adversary (Astra): —

## plotCircos · Functional correlation circos (png, large image)

Study design confirmed first (Animal, independent); without it the card shows Team's "requires a confirmed independent
study design" (F1). With the synthetic data and the default |r| ≥ 0.85 Team draws "No pairwise correlations > 0.85";
|r| ≥ 0.6 (script) and 0.5 (probe) draw chords.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Default threshold: Team's "No pairwise correlations > 0.85" (`b09-fla/plotCircos-1-card-100.png`); zoomed out frozen tier image (`b09-fla/plotCircos-1-zoomed-out.png`). With chords at 100 %: `b09-fla/plotCircos-2-card-620-links.png` |
| 2 | Matches Team | **FAIL (Team behaviour)** | Same image as the module's render for the same inputs (`b09-fla/plotCircos-2-module-620x720.png`). **Labels cropped:** the sector label "(LPC+LPE)/PL_Index" is cut to "(LPC+LPE" at the 620 px card (`b09-fla/plotCircos-2-card-620-links.png`) and to "(LPC+LPE)/PL_Inc" even at Team's own tab size 945×700 (`b09-fla/plotCircos-2-module-945x700.png`): Team's base-graphics layout gives the circle 1/1.35 of the width and the legend column clips labels that run to the right (`R/modules/10_fla_module.R:1703-1752`, `layout(… widths=c(1, 0.35))`, `xpd=TRUE` only within the figure region). In the 424 px card both side labels are cut ("_Load_Index", "(LPC+L", `b09-fla/plotCircos-9-duplicate.png`). Not changed (ggplot/base-graphics change = proposal for the module owner; card size/aspect is the designer's) |
| 2b | Sharpness at 100 % | PASS at DPR 1 / **FAIL at DPR 2 (design)** | DPR 1: 620×720 image in a 618×682 box, 1.00 image px per CSS px, crisp. DPR 2 (`NEXO_AUDIT_DPR=2`): the same 620×720 image in the same 618×682 CSS box = 0.5 px per device pixel, visibly soft text on a Retina screen (`b09-fla/dpr2/plotCircos-1-card-100.png`). The plan assigns render sharpness (device pixel ratio) to the design role; recorded, not fixed here |
| 3 | Size | PASS | 620→780→390 px, redrawn each time, nothing overflows the body: `b09-fla/plotCircos-3-larger.png`, `b09-fla/plotCircos-3-smaller.png` |
| 4 | Data tab | PASS | All 21 FLA controls + the run-time baseline/compare controls; "Minimum Absolute Correlation (|r|)" 0.85 → 0.6 redrew with chords (`b09-fla/plotCircos-4-data-changed.png`, `b09-fla/plotCircos-9-duplicate.png`); slider bounded 0.5–0.99 like Team, an out-of-range value cannot be entered |
| 5 | Appearance | PASS | Image plot: Label, Background, Size (`b09-fla/plotCircos-5-appearance.png`) |
| 6 | Statistics | N/A | Tab says "Statistics are available for independent violin copies." |
| 7 | Export | PASS | Card PNG 188 KB; SVG disabled with the reason; Team PDF `Functional_Correlation_Network_….pdf` 15 KB (valid %PDF); card PDF 88 KB; `b09-fla/plotCircos-7-export-dialog.png`. Team's correlation CSV (`downloadCorrCSV`) is not offered on this card: in Team it belongs to the "Significant Correlation Ledger" sub-tab (module l.324-331), not to the circos panel (l.305-313) |
| 8 | Finish | PASS | Snapshot 423×498 in a 421×460 body; Edit figure → live PNG: `b09-fla/plotCircos-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Header Duplicate keeps `corrThresh=0.6`; remove + Undo brings it back drawn: `b09-fla/plotCircos-9-duplicate.png` |
| 10 | Save and reopen | PASS | Reopened: label, `corrThresh=0.6`, background kept (`b09-fla/plotCircos-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at 1440×900 and 1024×768: `b09-fla/plotCircos-12-layout-1440-data.png` … `-1024-card-menu.png` |

Findings:
- F1 (fixed): the Library did not ask for the design.
- C1 (Team behaviour): sector labels cropped by the module's own layout, worse in a narrow card. Proposal for the
  module owner: reserve label room (`circos.par(canvas.xlim/ylim)` or a wider left column); for the designer: request
  Team's 1.35 : 1 aspect for this card.
- C2 (design): PNG cards are requested at CSS size, not × devicePixelRatio, so the circos is soft at DPR 2.
- The DPR 2 run stopped in check 12 ("Execution context was destroyed", a page reload, most likely a 409 session_lost
  from the shared API); checks 1–7 at DPR 2 passed and only the sharpness reading is used from it.

Auditor (Opus 5.5): OPEN – sector labels cropped (Team's module layout, C1) and soft at DPR 2 (C2, design); both handed on, no Nexo code defect left

Adversary (Astra): —

Astra review 2026-11-08: `fla_tab-logratioPlot` check 3 now reads "PASS (Team module clips below 620 px …; same PNG as Team)" instead of "PASS*": the cut index names at 390 px are Team's ggplot strips.
