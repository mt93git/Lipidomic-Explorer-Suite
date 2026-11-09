# Chart audit · b03-qc-b (Quality check B)

Auditor: Opus 5.5 (claude-b). Protocol: `docs/integration/nexo-chart-audit-plan.md`. Checks:
`node tests/dual-ui/chart-audit/audit_b03-qc-b.cjs [outputName …]` (Chromium 1440×900, Vite :5183, audit API
127.0.0.1:3961, checkpoint `nexo-complete-synthetic`; saves `audit-b03-qc-b-synthetic` and deletes it). Raw results:
`b03-qc-b/results-*.json`. Screenshots: `b03-qc-b/<output>-<check>.png`.

**Status (round 2, closing, 2026-11-08):** all seven plots **AGREE** (auditor). Round 2 closed the open items:
(1) the BQC plots draw real data with replicates picked in Nexo's computed "BQC samples" picker, and checks 2, 9 and 10
pass; (2) a failed "More downloads" file now gives a clear message (F4, Nexo, green; F4-R, API root cause, written,
**R test not run on the M1**: coordinator runs `Rscript tests/dual-ui/test_api_export.R`); (3) guided_qc_plot's
Legend controls are disabled with a reason (F3), and SVG is available there (the round-1 "disabled" was a script race);
(4) check 12 passes for all seven plots. Round 2 sections follow each plot's round-1 table. Earlier status:
in progress after round 1 (load3dPlot, sampleCorrPlot, outlierPcaPlot AGREE; BQC plots and guided_qc_plot OPEN).

Rerun setup note: port 5183 was held by a Vite from another worktree (`router-20261106-225006-1b9a33`, not started by
this task, so not stopped); this run served the same config on **5283** (`NEXO_AUDIT_PORT=5283`) and ran the script
with `NEXO_AUDIT_BASE=http://127.0.0.1:5283`. The API answered at once (`GET /checkpoints` lists
`nexo-complete-synthetic`); each plot's 11 checks took ≈80 s.

## load3dPlot · PCA loadings · 3D (plotly)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Draft 100 % and zoomed out (frozen tier image): `b03-qc-b/load3dPlot-1-draws.png`, `b03-qc-b/load3dPlot-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Same 9 `scatter3d` traces (one per class) as the module's own `POST …/render`; title "3D PCA Loadings"; `loadMarkerSize3D` = catalog default |
| 3 | Size | PASS | 620→780→390 px wide, redrawn each time, nothing overflows: `b03-qc-b/load3dPlot-3-larger.png`, `b03-qc-b/load3dPlot-3-smaller.png` |
| 4 | Data tab | PASS | All 48 controls of Team's QC module markup present; "Loadings - 3D Dot Size" 20 → redrew (`b03-qc-b/load3dPlot-4-data-changed.png`); it is a slider bounded 1–… like Team, an out-of-range value cannot be entered. `guided_qc_reason`/`guided_qc_sample` are allowedInputs with no markup in Team either |
| 5 | Appearance | PASS | Label, card background, Plot title on the plot, font size 16 and colour #aa0000 on the plot, plot background (applies to the 3D scene, visible lavender; `plot_bgcolor` is not used by 3D), 6 palettes → 6 distinct colourings, Healthy in grey, legend Top Left (x=0), Undo/Redo, Reset → "3D PCA Loadings". No grid toggle and orientation disabled: neither applies to a 3D scene. `b03-qc-b/load3dPlot-5-appearance.png` |
| 6 | Statistics | N/A | Team has no statistics for QC plots; tab says "Statistics are available for independent violin copies." |
| 7 | Export | PASS | Card PNG 504 KB, SVG 146 KB; Team PDF `Loading_3D_….pdf` 4.2 KB (valid %PDF); dialog `b03-qc-b/load3dPlot-7-export-dialog.png` |
| 8 | Finish | PASS* | Snapshot 423×418 in a 421×424 body; Edit figure → live plotly. *See finding F2: a false "Plot changed — export again." notice covers the title of the finished plot (`b03-qc-b/load3dPlot-8-finished.png`) — fixed |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps label and `loadMarkerSize3D=20`; remove + Undo brings it back drawn: `b03-qc-b/load3dPlot-9-duplicate.png` |
| 10 | Save and reopen | PASS | Saved `audit-b03-qc-b-synthetic`, reopened in a new page: label, `loadMarkerSize3D=20`, background kept (`b03-qc-b/load3dPlot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |

Findings:
- **F1 (Nexo bug, fixed):** after a drag resize the Inspector's Size fields showed raw fractions (`Width 422.5`,
  `Height 498.33333333333337`, visible in `b03-qc-b/load3dPlot-5-appearance.png`). The fields now show whole pixels
  (the stored size is unchanged; typed values were already rounded by `clampSize`). Red `571d634`
  (`TypeError: (0 , sizeText) is not a function`), green `8dde542` (`Tests 5 passed (5)`; full vitest 63 files /
  271 tests, `tsc --noEmit` clean).
- **F2 (Nexo bug, fixed):** see the fix under sampleCorrPlot #8 (same defect, both plots).
- Presentation note for the designer: at 390 px wide with font 16 the legend takes ~40 % of the card and the scene's
  point labels overlap; Team draws the same labels (module output), so this is not changed here.

Auditor (Opus 5.5): AGREE

Adversary (Astra): —

### Round 2 (closing, 2026-11-08) · load3dPlot

Scope this round: check 12 only, and confirm the round-1 AGREE on this build. Run:
`NEXO_AUDIT_CHECKS=12 node tests/dual-ui/chart-audit/audit_b03-qc-b.cjs load3dPlot` (Vite :5383, API 127.0.0.1:3961,
synthetic; the script adds the card from the Library, check 1, then check 12). Raw: `b03-qc-b/results-r2-load3dPlot_sampleCorrPlot_outlierPcaPlot-checks12.json`.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws (to set up 12) | PASS | `b03-qc-b/load3dPlot-1-draws.png`, `b03-qc-b/load3dPlot-1-zoomed-out.png` (frozen tier image when zoomed out) |
| 11 | Console | PASS | 0 console errors during the run |
| 12 | Layout | PASS | Every Inspector tab (Data, Appearance, Statistics, Export) with every expandable section open, at 1440×900 and 1024×768, plus the card header chrome: 0 offenders (spill / overlap / escape, the layout sweep's own checker). `b03-qc-b/load3dPlot-12-data-1440.png`, `b03-qc-b/load3dPlot-12-data-1024.png`, `b03-qc-b/load3dPlot-12-appearance-1024.png` |

Checks 2–10 were not re-run this round (round-1 evidence above stands); nothing on this build contradicts them.

Auditor (Opus 5.5): AGREE

## sampleCorrPlot · Sample correlation (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `b03-qc-b/sampleCorrPlot-1-draws.png`, `b03-qc-b/sampleCorrPlot-1-zoomed-out.png` (frozen tier image) |
| 2 | Matches Team | PASS | Module render 620×680 PNG (55 KB) for the same inputs; card shows its own render 620×720 `object-fit: contain` at 618×646 — heatmap, title "Sample-Sample Correlation Matrix (Single Replicates)", "Method: PEARSON | Hierarchically Clustered", legend −1…1, nothing cropped; `corrMethod` = catalog default `pearson` |
| 3 | Size | PASS | 620→780→390 px, redrawn at each size: `b03-qc-b/sampleCorrPlot-3-larger.png`, `b03-qc-b/sampleCorrPlot-3-smaller.png` |
| 4 | Data tab | PASS | All 48 QC controls present (module sub-tabs shown as Normalization Check … BQC CoV Analysis, grouping mode, name format, colour-by, label content); Correlation Method → spearman redrew (`b03-qc-b/sampleCorrPlot-4-data-changed.png`); select, no free numeric value to refuse |
| 5 | Appearance | PASS | Image plot: Label, Background, Size, presets — no Plotly-only control that would silently do nothing (`b03-qc-b/sampleCorrPlot-5-appearance.png`); canvas Undo/Redo of the label |
| 6 | Statistics | N/A | Team has no statistics for this plot |
| 7 | Export | PASS | Card PNG 493 KB; SVG disabled with the reason "This figure is a raster image; SVG is not available."; Team CSV `Sample_Correlation_Matrix_….csv` 10 KB and PDF 9.6 KB; `b03-qc-b/sampleCorrPlot-7-export-dialog.png` |
| 8 | Finish | PASS (after fix) | Snapshot matches the live plot; Edit figure → live PNG. Before the fix the false notice hid the plot title: `b03-qc-b/sampleCorrPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps `corrMethod=spearman`: `b03-qc-b/sampleCorrPlot-9-duplicate.png` |
| 10 | Save and reopen | PASS | Reopened: label, `corrMethod=spearman`, background kept (`b03-qc-b/sampleCorrPlot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |

Findings:
- **F2 (Nexo bug, fixed):** a card that was exported (PNG/SVG) and then **Finished** showed "Plot changed — export
  again." although nothing about the plot changed; the notice sits over the top of the card body and hides the plot
  title (`b03-qc-b/sampleCorrPlot-8-finished.png`, `b03-qc-b/load3dPlot-8-finished.png`). Root cause: the export
  receipt fingerprint (`src/export/changedNotice.ts`) included `finished.url`, the snapshot URL that Finish creates.
  The snapshot is derived from the inputs/visual/size already in the fingerprint, so it is dropped. Red `840ea4a`
  (`AssertionError: expected true to be false`), green `73d10ab` (full vitest `Test Files 63 passed (63)`,
  `Tests 272 passed (272)`; `tsc --noEmit` clean). Moving a card was already not a change; finishing now is not
  either, while size, label, inputs, appearance and statistics still raise the notice (existing tests).

Auditor (Opus 5.5): AGREE

Adversary (Astra): —

### Round 2 (closing, 2026-11-08) · sampleCorrPlot

Scope this round: check 12 only, and confirm the round-1 AGREE on this build. Run:
`NEXO_AUDIT_CHECKS=12 node tests/dual-ui/chart-audit/audit_b03-qc-b.cjs sampleCorrPlot` (Vite :5383, API 127.0.0.1:3961,
synthetic; the script adds the card from the Library, check 1, then check 12). Raw: `b03-qc-b/results-r2-load3dPlot_sampleCorrPlot_outlierPcaPlot-checks12.json`.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws (to set up 12) | PASS | `b03-qc-b/sampleCorrPlot-1-draws.png`, `b03-qc-b/sampleCorrPlot-1-zoomed-out.png` (frozen tier image when zoomed out) |
| 11 | Console | PASS | 0 console errors during the run |
| 12 | Layout | PASS | Every Inspector tab (Data, Appearance, Statistics, Export) with every expandable section open, at 1440×900 and 1024×768, plus the card header chrome: 0 offenders (spill / overlap / escape, the layout sweep's own checker). `b03-qc-b/sampleCorrPlot-12-data-1440.png`, `b03-qc-b/sampleCorrPlot-12-data-1024.png`, `b03-qc-b/sampleCorrPlot-12-appearance-1024.png` |

Checks 2–10 were not re-run this round (round-1 evidence above stands); nothing on this build contradicts them.

Auditor (Opus 5.5): AGREE

## bqcPlot · Batch quality check (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS (placeholder) | The card draws Team's own placeholder "Please configure at least 2 BQC replicate samples to view plot." (`b03-qc-b/bqcPlot-1-draws.png`): the synthetic checkpoint has no BQC replicates selected (`input$bqcSamples` empty; default pattern "BQC" matches no sample) |
| 2 | Matches Team | PASS (placeholder) / script FAIL | Same placeholder as Team's `renderPlot` for no BQC samples (`R/modules/2_qc_boxplot_module.R` bqcPlot). The script could not read "Acceptable CoV Threshold (%)" by its label (Team's label carries an info-tooltip text; to be re-probed) |
| 3 | Size | PASS | 620→780→390 px, redrawn: `b03-qc-b/bqcPlot-3-larger.png`, `b03-qc-b/bqcPlot-3-smaller.png` |
| 4 | Data tab | **FAIL (Nexo gap)** | Team's drawer shows "Selected BQC Samples" (a `renderUI` checkbox list of all samples with All/None, `bqcSamplesSelectorUI`, module l.2863-2893). Nexo's Data tab has no such control: `bqcSamples` is not in the catalog's `allowedInputs` (built in `R/frontends/team/plot_instances.R`, not editable here) and `api_card_schema` filters renderUI controls by `allowedInputs`. So in Nexo the BQC plots can never show data. CoV threshold slider change not exercised (see #2) |
| 5 | Appearance | PASS | Image plot: Label, Background, Size only (`b03-qc-b/bqcPlot-5-appearance.png`) |
| 6 | Statistics | N/A | No statistics in Team |
| 7 | Export | **FAIL (Team behaviour, surfaced badly)** | Team PDF `downloadBqcPdf` → HTTP 500: its `content` calls `buildBqcPlot()` whose `req(bqcStats())` fails with no BQC replicates (same in Team: no file). Nexo shows **no message** after the click (no toast within 60 s) and logs a console 500 |
| 8 | Finish | PASS | `b03-qc-b/bqcPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | not concluded | script could not read the CoV slider by label (same as #2) |
| 10 | Save and reopen | not concluded | same |
| 11 | Console | FAIL | `Failed to load resource: 500` from the PDF download (#7) |

Open: (a) `bqcSamples` in the Nexo Data tab needs `allowedInputs` to include it — a decision for Gerardo/the
catalog owner (Team's `plot_instances.R`); (b) Nexo should say why a module download failed instead of nothing.

Auditor (Opus 5.5): OPEN – no BQC replicate selector in Nexo (plot cannot show data); failed Team PDF gives no message; checks 2/9/10 to re-run with the slider located

Adversary (Astra): —

### Round 2 (closing, 2026-11-08) · bqcPlot

Run: `audit_b03-qc-b.cjs bqcPlot bqcDeviationPlot bqcAbundancePlot` (Vite :5383, API 127.0.0.1:3961, synthetic), `AUDIT OK: 42 checks, 0 failed`; raw `b03-qc-b/results-r2-bqcPlot_bqcDeviationPlot_bqcAbundancePlot.json`. Replicates: the synthetic samples are S01…S24 (none named BQC; Team's own picker allows any), the script ticks **S01, S02, S03** in the Data tab's computed **BQC samples** picker (search, All/None, "3 of 24 samples selected").

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Before replicates: Team's placeholder; zoomed out frozen image (`b03-qc-b/bqcPlot-1-draws.png`, `b03-qc-b/bqcPlot-1-zoomed-out.png`) |
| 2 | Matches Team | **PASS (real data)** | Picking S01–S03 redrew the card from the 3.9 KB placeholder to a 30.8 KB 620×720 image: "BQC Measurement Precision Distribution", CoV density with the 20 % threshold line (`b03-qc-b/bqcPlot-2-bqc-picked.png`). The module's own `POST …/render` for the same inputs is 620×680, 30.1 KB (not the placeholder); card shown at 618×682, nothing cropped |
| 3 | Size | PASS | 620→780→390 px, redrawn: `b03-qc-b/bqcPlot-3-larger.png`, `b03-qc-b/bqcPlot-3-smaller.png` |
| 4 | Data tab | **PASS (was FAIL)** | 48 Team controls plus Nexo's computed "BQC samples" picker (Team's `bqcSamplesSelectorUI`); "Acceptable CoV Threshold (%)" (slider, located without the colon this time) 20→30 redrew (`b03-qc-b/bqcPlot-4-data-changed.png`); bounded slider like Team |
| 5 | Appearance | PASS | Image plot: Label, Background, Size (`b03-qc-b/bqcPlot-5-appearance.png`) |
| 6 | Statistics | N/A | No statistics in Team |
| 7 | Export | **PASS (after F4)** | With replicates: PNG 266 KB; SVG disabled with "This figure is a raster image; SVG is not available."; **Team PDF `BQC_CoV_Analysis_….pdf` 10.2 KB, valid %PDF**; card PDF 131 KB (`b03-qc-b/bqcPlot-7-export-dialog.png`). Failure path: see F4 and "Download failure" below |
| 8 | Finish | PASS | `b03-qc-b/bqcPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | **PASS (was not concluded)** | Duplicate keeps `bqcCovThreshold=30` **and BQC samples S01,S02,S03**, and draws data (23.2 KB image); remove + Undo brings it back drawn (`b03-qc-b/bqcPlot-9-duplicate.png`) |
| 10 | Save and reopen | **PASS (was not concluded)** | Reopened in a new page: label, `bqcCovThreshold=30`, **BQC samples S01,S02,S03**, background kept, card draws data (23.2 KB) (`b03-qc-b/bqcPlot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors in the full run (the round-1 500 came from clicking Team PDF on the placeholder; see below) |
| 12 | Layout | PASS | 0 offenders, every tab and section, 1440×900 and 1024×768 (`b03-qc-b/bqcPlot-12-data-1024.png`, `b03-qc-b/bqcPlot-12-data-1440.png`) |

Download failure (open item 2), measured on this build: on the placeholder card (no replicates) Team's PDF button is enabled — Nexo cannot tell a module placeholder *image* from a plot (`downloadBlockedReason` reads only a text message) — and the real API answers `GET …/downloads/downloadBqcPdf` with **500** and plumber's default body (no `message`). Before F4 (run of 01:56, `NEXO_AUDIT_CHECKS=2,7`) the page said "Could not download the file: Request failed (500)": a message, but not a clear one. **After F4 (run of 02:01, same build, real API):** "Could not download the file: Team's module could not make this file (server error 500). Check that the plot shows data, then try again." (`b03-qc-b/bqcPlot-7-download-blocked.png`, `b03-qc-b/results-r2-bqcPlot-checks27.json`, which holds the post-fix run). A simulated 500 *with* a message shows it verbatim: "Could not download the file: Audit: the module could not build this file." (`b03-qc-b/bqcPlot-7-download-PDF-failed.png`). In that provoked-failure run check 11 is FAIL with `Failed to load resource: the server responded with a status of 500` — the real API's 500 that the script provoked on purpose (the browser logs every failed resource; F4-R turns it into a 422 with Team's reason once the R fix is deployed). The normal flow (full run) has 0 console errors.

Findings (round 2):
- **F4 (Nexo bug, fixed): a failing module download said only "Request failed (500)".** Nexo (`src/api.ts` `sendFile`)
  keeps the API's message and, for a 5xx without one, now says "Team's module could not make this file (server error
  500). Check that the plot shows data, then try again." Red `2f16ada3` (`AssertionError: expected 'Request failed (500)'
  to match /^Team's module could not make this fi…/`, `Tests 1 failed | 1 passed (2)`), green `9ce80689`
  (`Tests 2 passed (2)`; full vitest `Test Files 105 passed (105)`, `Tests 481 passed (481)`; `tsc --noEmit` clean;
  `test_nexo_inspector.cjs` 42 PASS exit 0; `test_nexo_card_chrome.cjs` 29 PASS exit 0).
- **F4-R (API, root cause, written, NOT run — no R on the M1):** `api_run_download` (`R/frontends/api/export.R`) only
  caught `shiny.silent.error`/`validation`; any other error inside Team's handler escaped as a bare 500. It now answers
  422 "Team's module could not make this file: <reason>" and lets `session_lost`/`api_*` through. Red `a6673eb5`
  (`tests/dual-ui/test_api_export.R`, expected to fail on `inherits(boom, "api_unprocessable")`), green `032b2887`.
  **Coordinator: `Rscript tests/dual-ui/test_api_export.R`.**
- Observation (not a FAIL, to probe): in the separate `NEXO_AUDIT_CHECKS=2,7` run, after three ticks 400 ms apart the
  picker read "2 of 24 samples selected" (the full run read "3 of 24"). The card drew data either way (≥ 2 replicates).
  Possible lost tick when PATCHes overlap in `ComputedControls`; not reproduced deliberately in this round.
- Team behaviour (not fixed): Team's BQC plots show "Please configure at least 2 BQC replicate samples…" until two are
  picked (`R/modules/2_qc_boxplot_module.R` bqcPlot/bqcDeviationPlot/bqcAbundancePlot); Nexo shows the same image.


Auditor (Opus 5.5): AGREE

## bqcDeviationPlot · Batch deviation (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS (placeholder) | Team's "Please configure at least 2 BQC replicate samples." (`b03-qc-b/bqcDeviationPlot-1-draws.png`) |
| 2 | Matches Team | PASS (placeholder) | Module render 620×680, 3.9 KB = the same placeholder; card 620×720 contained at 618×646 |
| 3 | Size | PASS | `b03-qc-b/bqcDeviationPlot-3-larger.png`, `b03-qc-b/bqcDeviationPlot-3-smaller.png` |
| 4 | Data tab | **FAIL (Nexo gap, same as bqcPlot #4)** | The plot reads only `input$bqcSamples`; no selector in Nexo. "Merged Samples" re-rendered the card (`b03-qc-b/bqcDeviationPlot-4-data-changed.png`) but the placeholder is unchanged — no Nexo control can change this plot |
| 5 | Appearance | PASS | `b03-qc-b/bqcDeviationPlot-5-appearance.png` |
| 6 | Statistics | N/A | — |
| 7 | Export | FAIL (Team behaviour, surfaced badly) | The card offers Team's BQC PDF (`downloadBqcPdf`) → HTTP 500 (`req()` with no replicates), no message in Nexo |
| 8 | Finish | PASS | `b03-qc-b/bqcDeviationPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | not concluded | duplicate did not reach "Up to date" within 180 s in this run (API slow after repeated 500s?) — re-run |
| 10 | Save and reopen | not concluded | Saved toast not seen within 180 s — re-run |
| 11 | Console | FAIL | repeated `500` from the PDF download |

Auditor (Opus 5.5): OPEN – no BQC replicate selector (plot cannot show data); silent PDF failure; #9/#10 to re-run

Adversary (Astra): —

### Round 2 (closing, 2026-11-08) · bqcDeviationPlot

Run: `audit_b03-qc-b.cjs bqcPlot bqcDeviationPlot bqcAbundancePlot` (Vite :5383, API 127.0.0.1:3961, synthetic), `AUDIT OK: 42 checks, 0 failed`; raw `b03-qc-b/results-r2-bqcPlot_bqcDeviationPlot_bqcAbundancePlot.json`. Replicates: the synthetic samples are S01…S24 (none named BQC; Team's own picker allows any), the script ticks **S01, S02, S03** in the Data tab's computed **BQC samples** picker (search, All/None, "3 of 24 samples selected").

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Placeholder before replicates (`b03-qc-b/bqcDeviationPlot-1-draws.png`, `b03-qc-b/bqcDeviationPlot-1-zoomed-out.png`) |
| 2 | Matches Team | **PASS (real data)** | S01–S03 picked: 3.6 KB placeholder → 18.5 KB drawn image (`b03-qc-b/bqcDeviationPlot-2-bqc-picked.png`); module render for the same inputs 620×680, 18.2 KB; card 618×682 |
| 3 | Size | PASS | `b03-qc-b/bqcDeviationPlot-3-larger.png`, `b03-qc-b/bqcDeviationPlot-3-smaller.png` |
| 4 | Data tab | **PASS (was FAIL)** | The plot's own control is now in Nexo (BQC samples picker); "Merged Samples" redrew the drawn plot (`b03-qc-b/bqcDeviationPlot-4-data-changed.png`) |
| 5 | Appearance | PASS | `b03-qc-b/bqcDeviationPlot-5-appearance.png` |
| 6 | Statistics | N/A | — |
| 7 | Export | PASS | PNG 186 KB; SVG disabled with the raster reason; Team PDF 10.2 KB valid; card PDF 91 KB (`b03-qc-b/bqcDeviationPlot-7-export-dialog.png`) |
| 8 | Finish | PASS | `b03-qc-b/bqcDeviationPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | **PASS (was not concluded)** | Duplicate keeps `mergeReplicatesMode=merged` and S01,S02,S03, draws data (16.1 KB) (`b03-qc-b/bqcDeviationPlot-9-duplicate.png`) |
| 10 | Save and reopen | **PASS (was not concluded)** | Reopened with merged mode, S01,S02,S03, background, drawn (16.1 KB) (`b03-qc-b/bqcDeviationPlot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders, 1440×900 and 1024×768 (`b03-qc-b/bqcDeviationPlot-12-data-1024.png`) |

Findings (round 2): the round-1 FAIL (#4, no BQC selector) is closed by the computed picker; #9/#10 concluded; the silent-download item is closed by F4 (see bqcPlot).

Auditor (Opus 5.5): AGREE

## bqcAbundancePlot · Batch abundance (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS (placeholder) | Team's placeholder (`b03-qc-b/bqcAbundancePlot-1-draws.png`) |
| 2 | Matches Team | PASS (placeholder) | Module render 3.9 KB placeholder = card |
| 3 | Size | PASS | `b03-qc-b/bqcAbundancePlot-3-larger.png`, `b03-qc-b/bqcAbundancePlot-3-smaller.png` |
| 4 | Data tab | **FAIL (Nexo gap, same as bqcPlot #4)** | Reads only `input$bqcSamples`; "Merged Samples" re-rendered the same placeholder (`b03-qc-b/bqcAbundancePlot-4-data-changed.png`) |
| 5 | Appearance | PASS | `b03-qc-b/bqcAbundancePlot-5-appearance.png` |
| 6 | Statistics | N/A | — |
| 7 | Export | PASS | PNG 91 KB; SVG disabled with reason; no Team downloads; `b03-qc-b/bqcAbundancePlot-7-export-dialog.png` |
| 8 | Finish | PASS | `b03-qc-b/bqcAbundancePlot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | `b03-qc-b/bqcAbundancePlot-9-duplicate.png` |
| 10 | Save and reopen | PASS | label, `mergeReplicatesMode=merged`, background kept (`b03-qc-b/bqcAbundancePlot-10-reopened.png`); checkpoint deleted |
| 11 | Console | PASS | 0 errors |

Auditor (Opus 5.5): OPEN – no BQC replicate selector in Nexo, so the plot can only show Team's placeholder

Adversary (Astra): —

### Round 2 (closing, 2026-11-08) · bqcAbundancePlot

Run: `audit_b03-qc-b.cjs bqcPlot bqcDeviationPlot bqcAbundancePlot` (Vite :5383, API 127.0.0.1:3961, synthetic), `AUDIT OK: 42 checks, 0 failed`; raw `b03-qc-b/results-r2-bqcPlot_bqcDeviationPlot_bqcAbundancePlot.json`. Replicates: the synthetic samples are S01…S24 (none named BQC; Team's own picker allows any), the script ticks **S01, S02, S03** in the Data tab's computed **BQC samples** picker (search, All/None, "3 of 24 samples selected").

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Placeholder before replicates (`b03-qc-b/bqcAbundancePlot-1-draws.png`, `b03-qc-b/bqcAbundancePlot-1-zoomed-out.png`) |
| 2 | Matches Team | **PASS (real data)** | S01–S03 picked: 3.6 KB placeholder → 18.2 KB drawn image (`b03-qc-b/bqcAbundancePlot-2-bqc-picked.png`); module render 620×680, 18.1 KB; card 618×682 |
| 3 | Size | PASS | `b03-qc-b/bqcAbundancePlot-3-larger.png`, `b03-qc-b/bqcAbundancePlot-3-smaller.png` |
| 4 | Data tab | **PASS (was FAIL)** | BQC samples picker present; "Merged Samples" redrew the drawn plot (`b03-qc-b/bqcAbundancePlot-4-data-changed.png`) |
| 5 | Appearance | PASS | `b03-qc-b/bqcAbundancePlot-5-appearance.png` |
| 6 | Statistics | N/A | — |
| 7 | Export | PASS | PNG 173 KB; SVG disabled with the raster reason; Team PDF 10.2 KB valid (this build lists Team's BQC PDF for this card too); card PDF 86 KB (`b03-qc-b/bqcAbundancePlot-7-export-dialog.png`) |
| 8 | Finish | PASS | `b03-qc-b/bqcAbundancePlot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps merged mode and S01,S02,S03, draws data (15.9 KB) (`b03-qc-b/bqcAbundancePlot-9-duplicate.png`) |
| 10 | Save and reopen | PASS | Reopened with merged mode, S01,S02,S03, background, drawn (15.9 KB) (`b03-qc-b/bqcAbundancePlot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders, 1440×900 and 1024×768 (`b03-qc-b/bqcAbundancePlot-12-data-1024.png`) |

Findings (round 2): the round-1 FAIL (#4, no BQC selector) is closed by the computed picker; #9/#10 concluded; the silent-download item is closed by F4 (see bqcPlot).

Auditor (Opus 5.5): AGREE

## outlierPcaPlot · Outlier PCA (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `b03-qc-b/outlierPcaPlot-1-draws.png`, `b03-qc-b/outlierPcaPlot-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Module render 620×680 (27 KB) for the same inputs; card 620×720 contained at 618×646; `outlierThreshold` = catalog default 2.5 |
| 3 | Size | PASS | 620→780→390 px, redrawn: `b03-qc-b/outlierPcaPlot-3-larger.png`, `b03-qc-b/outlierPcaPlot-3-smaller.png` |
| 4 | Data tab | PASS | All 48 QC controls present; "MAD Threshold (Risk)" 3.5 redrew (`b03-qc-b/outlierPcaPlot-4-data-changed.png`); −4 refused: card state error, plot kept, message "Could not update the plot: Invalid value for outlierThreshold: below the minimum 1" (API 400; `b03-qc-b/outlierPcaPlot-4-data-invalid.png`) |
| 5 | Appearance | PASS | Image plot: Label, Background, Size (`b03-qc-b/outlierPcaPlot-5-appearance.png`) |
| 6 | Statistics | N/A | — |
| 7 | Export | PASS | PNG 234 KB; SVG disabled with the reason; no Team downloads; `b03-qc-b/outlierPcaPlot-7-export-dialog.png` |
| 8 | Finish | PASS | `b03-qc-b/outlierPcaPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps `outlierThreshold=3.5`: `b03-qc-b/outlierPcaPlot-9-duplicate.png` |
| 10 | Save and reopen | PASS | label, threshold 3.5, background kept (`b03-qc-b/outlierPcaPlot-10-reopened.png`); checkpoint deleted |
| 11 | Console | PASS | 0 console errors (the 400 is the intended refusal of −4) |

Auditor (Opus 5.5): AGREE

Adversary (Astra): —

### Round 2 (closing, 2026-11-08) · outlierPcaPlot

Scope this round: check 12 only, and confirm the round-1 AGREE on this build. Run:
`NEXO_AUDIT_CHECKS=12 node tests/dual-ui/chart-audit/audit_b03-qc-b.cjs outlierPcaPlot` (Vite :5383, API 127.0.0.1:3961,
synthetic; the script adds the card from the Library, check 1, then check 12). Raw: `b03-qc-b/results-r2-outlierPcaPlot-checks12.json` (and the three-plot run, see note).

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws (to set up 12) | PASS | `b03-qc-b/outlierPcaPlot-1-draws.png`, `b03-qc-b/outlierPcaPlot-1-zoomed-out.png` (frozen tier image when zoomed out) |
| 11 | Console | PASS | 0 console errors during the run |
| 12 | Layout | PASS | Every Inspector tab (Data, Appearance, Statistics, Export) with every expandable section open, at 1440×900 and 1024×768, plus the card header chrome: 0 offenders (spill / overlap / escape, the layout sweep's own checker). `b03-qc-b/outlierPcaPlot-12-data-1440.png`, `b03-qc-b/outlierPcaPlot-12-data-1024.png`, `b03-qc-b/outlierPcaPlot-12-appearance-1024.png` |

Run note: in the three-plot run, outlierPcaPlot #1 timed out after 180 s waiting for the new card to draw (API shared with another auditor; no HTTP error, 0 console errors); the immediate re-run alone drew it and passed 12 (`b03-qc-b/results-r2-outlierPcaPlot-checks12.json`). Not a plot defect.

Checks 2–10 were not re-run this round (round-1 evidence above stands); nothing on this build contradicts them.

Auditor (Opus 5.5): AGREE

## guided_qc_plot · Guided quality check (plotly)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS (empty, as Team) | Team returns an empty scatter until a Guided QC preparation is applied (`guided_applied_ready()`, module l.1231); the card shows that empty plot (`b03-qc-b/guided_qc_plot-1-draws.png`) |
| 2 | Matches Team | PASS (script FAIL is a script artefact) | Same empty scatter as the module; the script compared `maxPCs` with `catalog.defaults.maxPCs`, which is absent for this output (Inspector shows Team's markup default 3) — to tighten in the script |
| 3 | Size | PASS | `b03-qc-b/guided_qc_plot-3-larger.png`, `b03-qc-b/guided_qc_plot-3-smaller.png` |
| 4 | Data tab | PASS (partial) | "Max PCs to compute" 4 redrew; −1 refused with "Invalid value for maxPCs: below the minimum 2" (`b03-qc-b/guided_qc_plot-4-data-invalid.png`). The preparation **action** that makes this plot show points is a module action (being added by another task); `guided_qc_reason`/`guided_qc_sample` have no markup in Team either |
| 5 | Appearance | **FAIL (open)** | Legend position "Top Left" leaves `layout.legend.x` unset: the plot has one unnamed trace and no legend, so the Legend position buttons silently do nothing here — they should be disabled (like Change orientation) when there is no legend. Not fixed in this run |
| 6 | Statistics | N/A | — |
| 7 | Export | PASS (note) | PNG 98 KB; SVG button disabled with **no reason shown** (other plots show one); `b03-qc-b/guided_qc_plot-7-export-dialog.png` |
| 8 | Finish | PASS | `b03-qc-b/guided_qc_plot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps `maxPCs=4`: `b03-qc-b/guided_qc_plot-9-duplicate.png` |
| 10 | Save and reopen | PASS | `b03-qc-b/guided_qc_plot-10-reopened.png`; checkpoint deleted |
| 11 | Console | PASS | 0 console errors |

Auditor (Opus 5.5): OPEN – Legend position does nothing on a legend-less plot (should be disabled); SVG disabled without a reason; plot only meaningful after the Guided QC action lands

Adversary (Astra): —

### Round 2 (closing, 2026-11-08) · guided_qc_plot

Build: this branch on `nexo/phase1` (aad45f68), audit API 127.0.0.1:3961, checkpoint `nexo-complete-synthetic`, Vite
**:5383** (5183 and 5283 were both held by Vites of other worktrees, not started by this task, not stopped). Script
`node tests/dual-ui/chart-audit/audit_b03-qc-b.cjs guided_qc_plot` with `NEXO_AUDIT_BASE=http://127.0.0.1:5383`.
Raw: `b03-qc-b/results-r2-guided_qc_plot.json` (full run, before the fix), `b03-qc-b/results-r2-guided_qc_plot-checks57.json`
(checks 5 and 7 after the fix), `b03-qc-b/results-r2-guided_qc_plot-checks512.json` (closing run, checks 5 and 12).

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | On this checkpoint the plot now draws its points (24 samples, PC1/PC2): `b03-qc-b/guided_qc_plot-1-draws.png`, `b03-qc-b/guided_qc_plot-1-zoomed-out.png` (frozen tier image) |
| 2 | Matches Team | PASS | Same single `scatter` trace as the module's own `POST …/render`; `maxPCs` now compared with Team's markup default (absent from catalog `defaults`) |
| 3 | Size | PASS | 620→780→390 px, redrawn each time: `b03-qc-b/guided_qc_plot-3-larger.png`, `b03-qc-b/guided_qc_plot-3-smaller.png` |
| 4 | Data tab | PASS | 48 Team controls present; "Max PCs to compute" 4 redrew; −1 refused: "Could not update the plot: Invalid value for maxPCs: below the minimum 2" (`b03-qc-b/guided_qc_plot-4-data-invalid.png`) |
| 5 | Appearance | PASS (after F3) | Title, Base size 16 and colour #aa0000 on the plot, plot background, 6 palettes → 6 colourings, Healthy in grey, grid, orientation, Undo/Redo, Reset. **Legend:** the plot has one unnamed trace and `showlegend=false`; presets and the nine positions are now disabled, `aria-describedby` → "This plot has no legend: no series has a name to list, so a position would show nothing useful." (`b03-qc-b/guided_qc_plot-5-legend-disabled.png`, `b03-qc-b/guided_qc_plot-5-appearance.png`) |
| 6 | Statistics | N/A | "Statistics are available for independent violin copies." |
| 7 | Export | PASS | PNG 133 KB; **SVG enabled and downloaded (12.7 KB, valid `<svg`)** — a 2D Plotly scatter has no reason to refuse SVG; card PDF 71 KB; no Team downloads (`b03-qc-b/guided_qc_plot-7-export-dialog.png`) |
| 8 | Finish | PASS | `b03-qc-b/guided_qc_plot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate (header chrome) keeps `maxPCs=4`: `b03-qc-b/guided_qc_plot-9-duplicate.png` |
| 10 | Save and reopen | PASS | `b03-qc-b/guided_qc_plot-10-reopened.png`; checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders over every Inspector tab with every section open at 1440×900 and 1024×768, card header included: `b03-qc-b/guided_qc_plot-12-data-1024.png`, `b03-qc-b/guided_qc_plot-12-appearance-1024.png` |

Findings (round 2):
- **SVG "disabled with no reason" (round 1) was a script race, not a Nexo defect:** every export button is disabled
  while an export runs (`aria-busy="true"`, `ExportTab.tsx` `run()`); the script read SVG right after the PNG download.
  A probe on this build shows SVG enabled before and after the PNG; the script now waits for `aria-busy="false"`. For
  raster plots the reason is shown (`aria-describedby` → "This figure is a raster image; SVG is not available.").
- **F3 (Nexo bug, fixed): Legend controls on a legend-less plot.** Team's plot (`R/modules/2_qc_boxplot_module.R:1231-1236`)
  is one unnamed trace; a position set `showlegend=true` and showed a meaningless "trace 0". `hasLegendEntries()`
  (`src/ui/PlotEditor/legendPresets.ts`) — a trace not hidden from the legend with a name, or a pie — decides; with none
  the presets and positions are disabled with the reason, and the legend fields are not offered. A single named trace
  whose legend Team hides at layout level keeps live positions (b12 F1 stays). Red `5c915d02`
  (`AssertionError: expected '<div class="plot-editor-positions" ro…' to match /aria-describedby="([^"]+)"/`,
  `Tests 1 failed | 3 passed (4)`), green `fd891f15` (`Tests 4 passed (4)`; full vitest `Test Files 104 passed (104)`,
  `Tests 479 passed (479)`; `tsc --noEmit` clean; `test_nexo_inspector.cjs` 42 PASS exit 0; `test_nexo_card_chrome.cjs`
  29 PASS exit 0).
- Script artefacts fixed (no app change): the font size field is "Base size" (F3 Typography of an earlier batch); the
  colour-blind check nests a second `.plot-editor`; Duplicate is in the card header chrome.

Auditor (Opus 5.5): AGREE

## Open questions (Gerardo)

Round 2: question 1 is answered by the build (Nexo offers `bqcSamples` as a computed control kept in its own
checkpoint member, `R/frontends/api/schema.R:164`); question 2 is answered by F4/F4-R (Nexo shows the API's reason).
Still open after round 2: the Team PDF on a placeholder card stays clickable (Nexo cannot tell a module placeholder
image from a plot); with F4-R deployed it answers 422 with Team's reason instead of 500. A possible lost tick in the
BQC picker under overlapping PATCHes (seen once: "2 of 24" after three ticks) needs a dedicated probe.

Round 1 questions:

1. BQC plots (bqcPlot, bqcDeviationPlot, bqcAbundancePlot): Team's drawer offers "Selected BQC Samples"; Nexo cannot
   offer it unless `bqcSamples` joins the catalog's `allowedInputs` (`R/frontends/team/plot_instances.R`, off-limits
   to this task). Approve adding it (catalog owner) so the API's renderUI controls reach the Data tab?
2. A module download that fails (`downloadBqcPdf` → 500 when no BQC replicates) gives the user no message in Nexo.
   Should Nexo show the API error, or hide Team downloads whose plot is a placeholder?

## Rerun results (2026-11-07)

Raw: `b03-qc-b/results-load3dPlot.json`, `b03-qc-b/results-outlierPcaPlot_guided_qc_plot_bqcPlot_bqcDeviationPlot_bqcAbundancePlot.json`.
Fixes: F1 red `571d634` → green `8dde542`; F2 red `840ea4a` → green `73d10ab`.

## Run log

- 22:00 first run of load3dPlot: the API was very slow (opening the checkpoint took minutes, `GET /catalog` ≈3 s);
  #2 passed (same 9 `scatter3d` traces as the module's own render, title "3D PCA Loadings"), every other check
  timed out and the console showed four `500` responses (URLs not logged then; the script now logs every HTTP ≥ 400).
  A separate probe added the card and it reached "Up to date" in < 25 s with the plot drawn
  (`b03-qc-b/load3dPlot-4-data-changed.png`, Library still open in that run — the script now closes it with
  "Close library"). These results are not evidence for the plot: they reflect the API state.
- 22:25 second run: the card was removed from the canvas while #1 waited (the `.card[data-id=…]` disappeared),
  then `curl http://127.0.0.1:3961/api/v1/checkpoints` returned connection reset (curl exit 56) from 22:31;
  still down at 22:46 after 15 minutes of retries (all `000`). Per the task rules no other port or host was tried; the
  run was stopped and its Vite (own PID) shut down.

Script notes (for the next run): the batch's Data controls are `loadMarkerSize3D` (load3dPlot), `corrMethod`
select (sampleCorrPlot), `bqcCovThreshold` (bqcPlot), and `outlierThreshold` with −4 refused (outlierPcaPlot).
The two BQC bar plots (`bqcDeviationPlot`, `bqcAbundancePlot`) read only `input$bqcSamples`, which Team builds
in a `renderUI` from `bqcPattern` and which is **not** in the catalog's `allowedInputs` — so in Nexo no Data
control is expected to change them, and whether they draw at all (rather than "Please configure at least 2 BQC
replicate samples") depends on the API session receiving `bqcSamples`. `guided_qc_plot` draws an empty scatter
until a Guided QC preparation has been applied (`guided_applied_ready()`, `R/modules/2_qc_boxplot_module.R:1231`).
These are the first things to verify when the API is back.

## Round 2 run log (2026-11-08)

- Vite **:5383** from this worktree (5183 and 5283 were held by Vites of `router-20261106-225006-1b9a33` and
  `router-20261107-225430-5b8904`, not started here, not stopped); API 127.0.0.1:3961 only; synthetic checkpoint only.
  Every saved `audit-b03-qc-b-synthetic` was deleted (200). No 409 session_lost was seen.
- Script changes, committed before the first run (`28c1c64d`, then `a09911a3`, `ede30150`): the Library is opened and closed from the rail;
  Duplicate in the card header chrome; BQC replicates picked in the computed picker; placeholder/failed-download
  message checks; legend-less rule; SVG reason required when disabled, read once the export panel is idle;
  `NEXO_AUDIT_CHECKS` to run a subset; check 12 from the layout sweep's checker.
- Mock layout sweep, `NEXO_SWEEP_ONLY=<the 7 qc_pca_tab sources> node tests/dual-ui/test_nexo_layout_sweep.cjs`:
  last lines `PASS chromium:1024x768 qc_pca_tab-guided_qc_plot`, `PASS chromium:390x844 phone`,
  `SUMMARY offenders=0 sources=7 engines=chromium`, exit 0.
- App checks after each fix: vitest `Test Files 105 passed (105)`, `Tests 481 passed (481)`; `tsc --noEmit` clean;
  `test_nexo_inspector.cjs` 42 PASS exit 0; `test_nexo_card_chrome.cjs` 29 PASS exit 0.

## Coordinator check (2026-11-08, integration of round 2)

- **F4-R run on the RTX** (`tests/dual-ui/test_api_export.R`, production tree). Red at `a6673eb5`:
  `Error in eval(quote({ : inherits(boom, "api_unprocessable") is not TRUE`. Green after the merge: every PASS line,
  ending with `PASS more downloads: a failing module handler is a 422 with its reason`. A flush timeout still becomes
  `session_lost` in `api_guard` before this handler sees it, and the handler passes `session_lost`/`api_*` through.
