# Chart audit · b02-qc-a (Quality check A)

> **Coordinator correction (after round 1).** The "Team canvas parity: not offered" notes below are wrong. Team's "Data & settings" dialog shows the copy's whole module UI (`www/team/js/canvas.js:420-445`, host inserted at `R/frontends/team/plot_instances.R:561-563`), so its action buttons and the computed controls are live there; Team only leaves them out of the saved inputs (`plot_instances.R:139`, `canvas.js:303`). Gerardo decided on 2026-11-06 that Nexo offers them and goes beyond Team (exact sizes, saved computed controls). Module actions are being added to the Data tab; until then these rows are **Nexo gaps**, not Team behaviour. The open question at the end is answered.

**Adversary summary (Astra): DISAGREE — all seven plots remain open.** Reviewed the batch history, code, saved JSON and all 51 supplied screenshots (contact sheets, with key images at full size); no browser or pilot data used. The batch commits contain only audit evidence/script/report changes, no application or science fixes and no edits to the prohibited paths. There is no design report or design implementation to validate. The slider-probe adjustment in `6834294` has no saved green rerun: the JSON still records Data failures for both PCA score plots. I ran `node --check` successfully and two browser-free JavaScript probes reproducing the radio-value and console-log defects below; I did not run the browser audit or application suites.

The script uses real API fetches, with the audit Vite proxy targeting :3961 (`tests/dual-ui/chart-audit/vite.audit.config.mjs:4`); no browser route mocks are installed. This establishes intended wiring, not a fresh successful run.

Shared blockers: “48 controls” counts the filtered catalog, not all Team controls. Team's **Show Statistic Detail** button (`R/frontends/team/qc-ui.R:88`, module handler `R/modules/2_qc_boxplot_module.R:2808`) is excluded by the input allowlist (`R/frontends/team/plot_instances.R:139`) and schema filter (`R/frontends/api/schema.R:125`); DataTab renders only `schema.controls` (`frontends/nexo/src/ui/Inspector/DataTab.tsx:26`). The violin-specific Statistics workflow may be N/A, but “Team has no statistics” overlooks this QC report. PCA's computed `customCol_*`/`customShape_*` controls (`R/modules/2_qc_boxplot_module.R:809`) are likewise absent from the literal-ID allowlist (`R/frontends/team/plot_instances.R:103`). The audit only checks catalog entries and changes one control (`tests/dual-ui/chart-audit/audit_b02-qc-a.cjs:193`), never exercising these omissions.

Other evidence limits (script references below are to that same audit script): #2 accepts any nonempty PNG or matching trace type/count, not equal plotted content (lines 153–163). #3 checks element bounds, not clipped plot text (183); #8 checks snapshot existence, not fidelity (341); #9 checks only label and one input, not appearance (361–362). #7 accepts a missing card-PDF button (327); Team PDF headers do not prove the exported card's appearance. #11 loses the old page's error log when `page` is replaced (394–411), so zero errors is unproven. The image redraw signature is a URL/dimensions check (77–87), and #4 can accept a pending resize as its redraw. Empty selections, long labels, many groups, the actual 240×220 minimum (`frontends/nexo/src/canvas.ts:443`), phone chrome ≥12 px, AA contrast and keyboard operation are untested; runtime outcomes are **not verifiable without a browser**. The `-3-larger.png` images for boxplotAfterNorm, pca2dPlot, pca3dPlot and load2dPlot show “Loading figure…”, as do the pca2dPlot/load2dPlot `-3-smaller.png` images; they do not substantiate a settled redraw. `outlierPlot-4-data-invalid.png` even shows the dynamic “Choose a sample (keyboard accessible)” control, contradicting the blanket claim that `guided_qc_sample` is correctly absent. The only configured viewport is 1440×900 (script line 40). No new design changes exist for which to claim accessibility or one-click Team-original validation.

Auditor: Opus 5.5 (claude-b). Protocol: `docs/integration/nexo-chart-audit-plan.md`. Checks:
`node tests/dual-ui/chart-audit/audit_b02-qc-a.cjs [outputName …]` (Chromium 1440×900, Vite :5182, audit API
127.0.0.1:3961, checkpoint `nexo-complete-synthetic`; saves `audit-b02-qc-a-synthetic` and deletes it). Raw results:
`b02-qc-a/results-*.json`. Screenshots: `b02-qc-a/<output>-<check>.png`.

**Status:** audited: boxplotAfterNorm, outlierPlot, pca2dPlot, pca2dVectorPlot (partial), pca3dPlot, load2dPlot.
load2dVectorPlot (partial) also audited. Still to do: checks 2–10 of both editable 2D plots (pca2dVectorPlot, load2dVectorPlot) with smart labels off and a fix to the script's radio default check (false positive on load2dPlot #2).

**Environment note (not a Nexo bug):** on a fresh M1 worktree `frontends/nexo/public/vendor/plotly.min.js` is
missing (git-ignored; `scripts/vendor-plotly.sh` needs R). The Plotly cards then show "Plotly unavailable. Run
scripts/vendor-plotly.sh, then reload." with a 404 + 422 in the console. Vendored with
`NEXO_PLOTLY_JS=<a sibling worktree's plotly.min.js v2.25.2> sh scripts/vendor-plotly.sh`. The batch setup should
include this step.

## qc_pca_tab-boxplotAfterNorm · Normalized signal boxplots (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Up to date at 100 % (`boxplotAfterNorm-1-draws.png`); zoomed out it shows the frozen image tier (`-1-zoomed-out.png`) |
| 2 | Matches Team | PASS | Card inputs = catalog defaults (Single Replicates); module's own `POST …/render` returns a 620×680 PNG of the same plot; card image 620×720 |
| 3 | Size | PASS | 620 → 780 → 390 px wide, redrawn each time, nothing overflows (`-3-larger.png`, `-3-smaller.png`) |
| 4 | Data tab | PASS | All 48 controls of Team's `qc_pca_tab` markup are present (incl. both tab sets); `guided_qc_reason`/`guided_qc_sample` are in allowedInputs but not in Team's markup (set by Guided QC), so correctly absent. Grouping Mode → Merged Samples redraws (merged boxes, see `-10-reopened.png`). No numeric control applies to this plot, so no invalid value to refuse |
| 5 | Appearance | PASS | Image plot: Label (renames card) and Background (applied, kept on reopen); no plot-level controls that would silently do nothing (`-5-appearance.png`) |
| 6 | Statistics | N/A | Team has no statistics for QC plots; tab says "Statistics are available for independent violin copies." |
| 7 | Export | PASS | PNG 281 KB; SVG disabled with "This figure is a raster image; SVG is not available."; Team's own PDF (`QC_Boxplot_After_*.pdf`, 5.8 KB, `%PDF`); export dialog (`-7-export-dialog.png`) |
| 8 | Finish | PASS | Finished snapshot 423×498 drawn in the card; Edit figure returns to the live PNG (`-8-finished.png`) |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps label and Merged Samples; remove + Undo brings it back drawn (`-9-duplicate.png`) |
| 10 | Save and reopen | PASS | `audit-b02-qc-a-synthetic` reopened in a new page: label, Merged Samples and background back (`-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |

Findings:
- Team behaviour: at narrow card widths (≈420 px) the ggplot title "Normalized Abundance Distribution - Merged
  Samples" is cut at the right edge of the image — the module draws it that way at that size (`-10-reopened.png`).
  Proposal for Max's module (not implemented): wrap or shorten the title for narrow renders.
- Design note (Fable): the image is requested at the card size (620×720) but the body is shorter (header/footer), so
  it is scaled into the body with side bands (visible with a coloured background in `-10-reopened.png`).
- Script note: the Data-tab screenshot (`-4-data-changed.png`) was taken while the Inspector still said
  "Updating…"; the merged result is proven by the reopened card.

Auditor (Opus 5.5): AGREE

Adversary (Astra): DISAGREE – #4 misses the QC statistics action filtered out at `R/frontends/api/schema.R:125` despite Team offering it at `R/frontends/team/qc-ui.R:88`; one grouping change cannot establish every-control coverage (`tests/dual-ui/chart-audit/audit_b02-qc-a.cjs:200`). #2 checks only nonzero image widths (line 161), and #11 drops pre-reopen errors (lines 394–411). `boxplotAfterNorm-3-larger.png` shows “Loading figure…”, not the claimed redrawn plot. The reopened screenshot supports merged boxes/background but visibly crops the title; attributing that crop solely to Team needs a same-size source-render comparison. Full runtime parity is not verifiable without a browser.

### Rework round 1

Run status: **not reached.** The rework run (`results-rework1-boxplotAfterNorm.json`) was started on
boxplotAfterNorm only; after #1 the audit API at 127.0.0.1:3962 began answering 500 (`…/cards/…/render`,
`…/canvas/validate`) and then refused connections (curl exit 56, checked every 10 s for >2 min, 22:41–22:46).
Per the task rules no other port or host was tried. Checks 2–11 of this plot need a rerun of the corrected script. Saved run: #1 PASS (`boxplotAfterNorm-r1-1-draws.png`, `-r1-1-zoomed-out.png`); #2 FAIL "no render
request seen for the card" (script defect: the API instance id `tcinstance_…` is not the card's data-id; fixed
after the run in `cardPathOf`, not yet rerun); #3–#10 FAIL by timeouts once the API failed; #11 FAIL, 111 console
errors, all 500s from the API (now collected on every page of the context, so they are no longer lost).

- Objection "#2 checks only nonzero widths": the script now re-POSTs the card's own render body and compares
  sha256 of the bytes the card shows (unverified: not rerun).
- Objection "-3-larger shows Loading figure…": `resized()` now waits for no "Loading figure…", a new image whose
  aspect matches the last requested size and whose sha256 differs; adds the 240×220 minimum (unverified).
- Objection "title cropped on reopen": the same-size render comparison from the API was not reached; the crop
  is **not** called Team behaviour in this round.
- Show Statistic Detail (`R/frontends/team/qc-ui.R:88`): Nexo gap (see coordinator correction at the top): Team's drawer shows it. Team's own canvas excludes action buttons, file inputs and
computed ids from a card's inputs (`R/frontends/team/plot_instances.R:100-142`, `team_plot_instance_input_ids` /
`team_plot_instance_dynamic_ids` and the comment at the top of that block; `www/team/js/canvas.js:303` skips
`button`/`.action-button`).

**Rerun 2026-11-07** (wave-1 UI, Vite :5182, API 127.0.0.1:3962, script `be4b4b6`, same results JSON as pca3dPlot):
#1 PASS (click-to-focus at 100 %, zoomed out to 41 %: frozen image); **#2 PASS: the card's image is byte-identical to
the module's own `/render` with the same body (620×720, sha256 fe7e0efcd333…, 31 353 B)**; #4 PASS (48 catalog
controls present; Grouping Mode single→merged redrew; Tab reaches it; the dynamic guided_qc_sample select is shown
too); #5 PASS (Label, card background, Undo/Redo); #6 N/A; #7 PASS (PNG 354 218 B; SVG disabled with the reason
"This figure is a raster image; SVG is not available."; Team PDF 5 769 B; card PDF offered); #8 PASS (snapshot
620×720, Edit figure → live png); #11 PASS (0 console errors). #3: larger, smaller and the 240×220 minimum all redrew
(`boxplotAfterNorm-r1-3-larger.png`, `-smaller.png`, `-minimum.png`); it FAILs on the last step that drags the card
back to its first size: from the minimum, click-to-focus zooms the camera in, so the screen-pixel drag no longer
maps to the first size (script defect, not fixed in the time box). #9 FAIL (30 s click timeout) and #10 FAIL
(90 s wait) are not diagnosed.

Title crop: at 620×720 the title "Normalized Abundance Distribution - Single Replicates (Individual Samples)" is
whole (`boxplotAfterNorm-r1-1-draws.png`), and the bytes are the module's own render (#2). The round-0 crop was on
the reopened merged view; #10 did not reach the reopen, so the same-size comparison for the merged view is still
not made and the crop is **not** called Team behaviour.

Auditor (Opus 5.5), round 1: OPEN – #9/#10 (duplicate/undo, save-reopen) fail undiagnosed; merged-view title crop not compared; #3 restore step

**Part 2 (2026-11-07, script `22fcd4f`..`fc8b711`):** not re-run in the time box. Script causes found for its open
checks: #3 restore now drags in card units at the zoom measured after click-to-focus and asserts the first size comes
back (`22fcd4f`); #9 failed because wave-1 cards have no footer (`frontends/nexo/src/cards.ts:3`), Duplicate is in
the ⋯ menu (`cards.ts:150`) — fixed, and outlierPlot/pca2dVectorPlot #9 now PASS with it.

Auditor (Opus 5.5), round 1: OPEN – #3/#9/#10 fixes not re-run on this plot; merged-view title crop not compared

## qc_pca_tab-outlierPlot · Outlier screening (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `outlierPlot-1-draws.png`; zoomed out: frozen image tier (`-1-zoomed-out.png`) |
| 2 | Matches Team | PASS | MAD threshold = catalog default 2.5; module render 620×480 PNG, card image 620×480 |
| 3 | Size | PASS | 620 → 780 → 390 px, redrawn, no overflow (`-3-larger.png`, `-3-smaller.png`) |
| 4 | Data tab | PASS | 48 Team controls present; MAD Threshold 2.5 → 3.5 redraws (`-4-data-changed.png`); −4 is refused: "Could not update the plot: Invalid value for outlierThreshold: below the minimum 1" (`-4-data-invalid.png`), value restored to 3.5 afterwards |
| 5 | Appearance | PASS | Label + Background as for image plots (`-5-appearance.png`) |
| 6 | Statistics | N/A | No statistics in Team for this plot |
| 7 | Export | PASS | PNG 282 KB; SVG disabled with the raster reason; Team PDF `Outliers_Detection_*.pdf` 5.2 KB (`%PDF`) |
| 8 | Finish | PASS | Snapshot 423×480; Edit figure → live PNG (`-8-finished.png`) |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps label and threshold 3.5; remove + Undo restores it (`-9-duplicate.png`) |
| 10 | Save and reopen | PASS | Reopened with label, threshold 3.5 and background (`-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 errors (the refused value shows in the card and Inspector, not as a console error) |

Findings: the module draws this plot at 620×480 whatever the card height, so a tall card shows it letterboxed
(design note for Fable). The invalid value puts the card in "Could not update" until a valid value is entered —
clear, and the message names the minimum.

Auditor (Opus 5.5): AGREE

Adversary (Astra): DISAGREE – The invalid-threshold screenshot supports the refusal, but #4 omits Team’s Process Outlier Risks action (`R/frontends/team/qc-ui.R:198`) and QC statistics action (`R/frontends/team/qc-ui.R:88`), filtered out by `R/frontends/api/schema.R:125`. Only threshold is changed; scope and number displayed are not exercised (`tests/dual-ui/chart-audit/audit_b02-qc-a.cjs:20`). #2 does not compare image content (line 161), and #11 discards earlier errors (394–411). The broader PASS claims are not verifiable without a browser.

### Rework round 1

Run status: not reached (audit API unreachable, see boxplotAfterNorm). Script changes for this plot: Data now
changes MAD Threshold (3.5, invalid −4), Context Scope (→ Within Group, value `group`) and Samples Displayed
(30 → 10); it records where the dynamic `guided_qc_sample` select ("Choose a sample (keyboard accessible)",
`R/modules/2_qc_boxplot_module.R:1353`) appears in the page. Correction to round 0: the report said that control is
absent; `outlierPlot-4-data-invalid.png` shows it is present. Whether it works is not yet verified.

- Process Outlier Risks… (`R/frontends/team/qc-ui.R:198`) and Show Statistic Detail (`qc-ui.R:88`): Nexo gap (see coordinator correction at the top): Team's drawer shows it. Team's own canvas excludes action buttons, file inputs and
computed ids from a card's inputs (`R/frontends/team/plot_instances.R:100-142`, `team_plot_instance_input_ids` /
`team_plot_instance_dynamic_ids` and the comment at the top of that block; `www/team/js/canvas.js:303` skips
`button`/`.action-button`).

**Rerun 2026-11-07** (run 2, stopped by me after #8 to fix `select()`; saved as
`b02-qc-a/results-rework1-run2-partial.json`): #1 PASS (click-to-focus at 100 %, zoomed out to 41 %: frozen image);
#4 PASS (48 catalog controls present; MAD Threshold 2.5→3.5 redrew; −4 refused: "Invalid value for outlierThreshold:
below the minimum 1"; Context Scope global→group redrew; Samples Displayed 24→10 redrew; Tab reaches all three);
#5 PASS (Label, card background, Undo/Redo); #6 N/A; #7 PASS (PNG 331 369 B; SVG disabled **with the reason**
"This figure is a raster image; SVG is not available."; Team PDF 5 339 B); #8 PASS (snapshot 780×400, Edit figure →
live png). #2 FAIL: the Inspector shows Samples Displayed = 24, the catalog default is 30: **Team behaviour** — the
module itself sets `updateSliderInput(..., value = min(30, total_samples))` (`R/modules/2_qc_boxplot_module.R:1110`)
and this checkpoint has 24 samples; the script now expects 24 (`43d301f`). #3 FAIL "no redraw at the new size":
script defect (the drag started while click-to-focus was still flying the camera), fixed in `be4b4b6`. #9–#11 FAIL
only because I stopped the run (page closed; the one console 400 is the card request cut off by that).

guided_qc_sample: **appears** in the Inspector's Data tab, outside any group, as "Choose a sample (keyboard
accessible)" with 25 options (24 samples + "Select a sample"), from the live card schema. Whether choosing a sample
works: see the probe below.

Auditor (Opus 5.5), round 1: OPEN – #2/#3 need the rerun with the fixed script; guided_qc_sample effect not yet shown

**Part 2 (2026-11-07, `results-rework1-outlierPlot.json`, script `1148ff5`):** #1, #2 (bytes identical to the
module's `/render`, sha256 58ccb79c…), #4, #5, #7, #8 PASS; #6 N/A; **#9 PASS** (Duplicate from the ⋯ menu; remove +
Undo brings it back drawn); #11 PASS (the only console error is the 400 of #4's deliberate −4).
- #9 note, **Team behaviour:** the duplicate shows Samples Displayed 24, not the original's 10: the module's observer
  `updateSliderInput(..., value = min(30, total_samples))` (`R/modules/2_qc_boxplot_module.R:1107-1111`) runs when a
  new instance computes its scores. The script ignores only that control in the comparison.
- #3 FAIL "no redraw at the new size": **Team behaviour + script**: the module sets the image height itself
  (`max(400, 20 × samples)`, `R/modules/2_qc_boxplot_module.R:1144-1154`), so the image never takes the card's aspect
  and the script's aspect test can not pass (`outlierPlot-r1-3-fail.png`). Script now checks only width for this
  plot (`36570e1`); not re-run.
- #10 FAIL: the reopen timed out; the screenshot of an earlier run (`outlierPlot-r1-10-fail.png`) showed the cause
  was the #9 duplicate left on the canvas (fixed: extra cards removed before saving), and the last run failed opening
  the phone view, where Export folds into the overflow menu (script waited for it; fixed in `fc8b711`). Not re-run.
- guided_qc_sample: probe `probe_b02-guided.cjs` improved (records requests and image change) but **not run**.

Auditor (Opus 5.5), round 1: OPEN – #3 and #10 need a rerun of the fixed script; guided_qc_sample effect not shown

## qc_pca_tab-pca2dPlot · PCA scores · 2D (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `pca2dPlot-1-draws.png`; frozen image when zoomed out (`-1-zoomed-out.png`) |
| 2 | Matches Team | PASS | 2D dot size = catalog default 8; module render 620×680 PNG, card 620×720 |
| 3 | Size | PASS | 620 → 780 → 390 px, redrawn, no overflow (`-3-*.png`) |
| 4 | Data tab | PASS | 48 Team controls present; PCA - 2D Dot Size 8 → 14 redraws (duplicate and reopen confirm 14). The control is a slider bounded like Team's, so an out-of-range value cannot be entered (the script's `fill('-3')` is rejected by the browser: "Malformed value" — a script limitation, not a defect) |
| 5 | Appearance | PASS | Label + Background (`-5-appearance.png`) |
| 6 | Statistics | N/A | No statistics in Team |
| 7 | Export | PASS | PNG 417 KB; SVG disabled with the raster reason; Team PDF `PCA_2D_*.pdf` 6.7 KB |
| 8 | Finish | PASS | Snapshot 423×498; Edit figure → live PNG |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps dot size 14 and label; remove + Undo restores it |
| 10 | Save and reopen | PASS | Reopened with dot size 14, label, background (`-10-reopened.png`) |
| 11 | Console | PASS | 0 errors |

Auditor (Opus 5.5): AGREE

Adversary (Astra): DISAGREE – #4 misses per-group color/shape controls generated at `R/modules/2_qc_boxplot_module.R:809` and `:820`, excluded by the literal-ID reader (`R/frontends/team/plot_instances.R:108`) and schema filter (`R/frontends/api/schema.R:125`), plus the shared QC statistics action. Saved JSON records #4 FAIL, and the slider exception occurs before the completeness assertion (`tests/dual-ui/chart-audit/audit_b02-qc-a.cjs:219`); a later script edit is not a green rerun. Both size screenshots show “Loading figure…”, so they do not prove readable redraws. Dot size 14 on reopen cannot prove all controls work. Image equivalence and zero console errors also remain unproven (script 161, 394–411).

### Rework round 1

Run status: not reached (audit API unreachable). Round 0's #4 FAIL in the saved JSON stands; no green rerun is
claimed. Script: Data now changes 2D Dot Size (→ 14) and 2D Label Size (→ 6), checks keyboard (Tab) reach, and
compares the card's PNG bytes with the API's same-body render.

- customCol_* / customShape_* (`R/modules/2_qc_boxplot_module.R:809`, `:820`, computed in renderUI) and Show
  Statistic Detail: Nexo gap (see coordinator correction at the top): Team's drawer shows it. Team's own canvas excludes action buttons, file inputs and
computed ids from a card's inputs (`R/frontends/team/plot_instances.R:100-142`, `team_plot_instance_input_ids` /
`team_plot_instance_dynamic_ids` and the comment at the top of that block; `www/team/js/canvas.js:303` skips
`button`/`.action-button`).

**Rerun 2026-11-07: not reached.** The run (order pca3dPlot, boxplotAfterNorm, load2dPlot, then this plot) was
stopped at the 30-minute time box before this plot. 

Auditor (Opus 5.5), round 1: OPEN – not reached in the rerun time box

**Part 2 (2026-11-07, `results-rework1-pca2dPlot_load2dVectorPlot.json`, script `fc8b711`):** #1, **#2 PASS (bytes
identical to the module's `/render`, sha256 d7c264e6…, 43 100 B)**, #4 PASS (2D Dot Size 8→14, 2D Label Size 4→6
redrew; Tab reaches both), #5 PASS, #6 N/A, #7 PASS (PNG 610 741 B; SVG disabled with the raster reason; Team PDF),
#8 PASS, **#9 PASS** (duplicate keeps 14/6 and background; remove + Undo). FAIL: #3 "no redraw at the new size"
(`pca2dPlot-r1-3-fail.png`, not diagnosed in the time box); #10 the save and the 1440 reopen passed their waits, the
375 px phone open did not come up in 60 s twice (`open-phone-1-fail.png`, `open-phone-2-fail.png`; the page text shows
the canvas chrome, so the script's wait — not the app — is the suspect; not diagnosed); #11 FAIL only from those two
phone-open notes (no browser console error).

Auditor (Opus 5.5), round 1: OPEN – #3 and the phone part of #10 undiagnosed

## qc_pca_tab-pca2dVectorPlot · PCA scores · editable 2D (plotly) — partial

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | FAIL (Team behaviour) | Added from the Library with catalog defaults, the card shows "Could not update" — the module refuses: "Editable vector view unavailable: smart repelled labels are preserved only in the original view; disable smart labels to edit this view." (422 in the console) |
| 2–10 | — | not reached | the run stops at a card that does not draw |
| 11 | Console | FAIL | the 422 of the refused render |

Team behaviour: `smartLabelPCA2D` defaults to TRUE and Team's module only builds the vector view with smart labels
off. Nexo adds the card with the catalog defaults, so it is refused on arrival; the message tells the user what to do.

Open question for Gerardo: should Nexo add the "editable 2D" cards (pca2dVectorPlot, likely load2dVectorPlot too)
with smart labels off (`smartLabelPCA2D=false` / `smartLabelLoad2D=false`) so they draw on arrival? It changes only
label placement, not data, but it is a default Team does not set.

Auditor (Opus 5.5): OPEN – does not draw with catalog defaults (Team refusal); decision needed above

Adversary (Astra): DISAGREE – The refusal is supported by `R/frontends/team/legacy_vector_adapter.R:10` and smart-label default at `R/frontends/team/qc-ui.R:64`, but that does not close this plot: the script exits at `tests/dual-ui/chart-audit/audit_b02-qc-a.cjs:137`, without disabling smart labels and checking 2–10. That recovery can be audited without deciding to change defaults. The same omitted custom color/shape controls (`R/modules/2_qc_boxplot_module.R:809`, `R/frontends/api/schema.R:125`) also require coverage. No refusal screenshot is supplied; successful recovery and runtime controls are not verifiable without a browser.

### Rework round 1

Run status: not reached (audit API unreachable). The refusal with smart labels on is Team behaviour; no default
was changed. The script now saves the refusal (`pca2dVectorPlot-r1-1-refusal.png`), turns `smartLabelPCA2D` off
in the Data tab as a user would, and continues with checks 2–10 on the editable view; #11 lists the refusal's 422
separately from other errors. Not yet run, so the round-0 open question is withdrawn (recovery is the user's
action), but checks 2–10 remain unproven.

- customCol_* / customShape_* and Show Statistic Detail: Nexo gap (see coordinator correction at the top): Team's drawer shows it. Team's own canvas excludes action buttons, file inputs and
computed ids from a card's inputs (`R/frontends/team/plot_instances.R:100-142`, `team_plot_instance_input_ids` /
`team_plot_instance_dynamic_ids` and the comment at the top of that block; `www/team/js/canvas.js:303` skips
`button`/`.action-button`).

**Rerun 2026-11-07: not reached.** The run (order pca3dPlot, boxplotAfterNorm, load2dPlot, then this plot) was
stopped at the 30-minute time box before this plot. Reached at the end: #1 FAIL — Team's refusal shown on arrival ("Editable vector view unavailable: smart repelled labels are preserved only in the original view; disable smart labels to edit this view.", 422), and the card stayed in error after the script turned `smartLabelPCA2D` off in the Data tab ("Could not update Data & settings"); not diagnosed, run stopped at the time box. 

Auditor (Opus 5.5), round 1: OPEN – not reached; editable view with smart labels off not yet shown

**Part 2 (2026-11-07, `results-rework1-pca2dVectorPlot.json`):** **the editable view draws after smart labels
are turned off.** Arrival: Team's refusal (422, `R/frontends/team/legacy_vector_adapter.R:10`, Team behaviour);
`pca2dVectorPlot-r1-1-refusal.png`. Card schema `smartLabelPCA2D {"value":true,"default":true}`; unchecking it in the
Data tab sent `PATCH …/cards/tcinstance_… {"inputs":{"smartLabelPCA2D":false}}` → **200** `{"settled":true,…}` and
the card drew (`pca2dVectorPlot-r1-1-draws.png`). The part-1 "stays in error" had **no PATCH at all** (captured in the
first part-2 run: the only API answer was the 422 render, and the Inspector already showed the box unchecked, so
`setChecked(false)` changed nothing); the script now records the schema value and, if the Inspector shows it off,
turns it on then off. Whether the Inspector can show "off" while the instance has it on is **not settled** (seen once,
not reproduced in the next run). #2 PASS (4 traces identical to the module render; bare same-size render saved as
`pca2dVectorPlot-r1-2-api-bare.png`); #4 PASS; #6 N/A; #7 PASS (PNG, **SVG 16 470 B**, Team PDF); #8 PASS; **#9 PASS**.
FAIL: #3 (after the drag the card had no Plotly figure, `_fullLayout` null, `pca2dVectorPlot-r1-3-fail.png`; not
diagnosed); #5 "no Chart font size" control for this plotly card (`pca2dVectorPlot-r1-5-fail.png`; not diagnosed);
#10 reopen at 1440 passed its waits, the phone view failed on the script's Export wait (fixed `fc8b711`, not re-run);
#11 FAIL only from those two phone-open notes.

Auditor (Opus 5.5), round 1: OPEN – #3 (no figure after resize) and #5 (chart font size) undiagnosed; #10 needs rerun; Inspector-vs-instance smart-label value seen once

## qc_pca_tab-pca3dPlot · PCA scores · 3D (plotly)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `pca3dPlot-1-draws.png`, `-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Same 2 scatter3d traces as the module's own render; title "3D PCA Score (Single Replicates)" |
| 3 | Size | PASS | 620 → 780 → 390 px, redrawn, no overflow |
| 4 | Data tab | PASS | 48 Team controls present; PCA - 3D Dot Size 8 → 14 (duplicate and reopen show 14). Slider: out-of-range values cannot be entered (script `fill('-3')` "Malformed value" is a script limitation) |
| 5 | Appearance | OPEN | On the plot: Plot title, font size 16 and colour, 6 palettes (6 distinct colourings), Healthy in grey, legend Top Left (x=0), Undo/Redo, Reset restores the title. But **"Plot background" is offered and has no effect on a 3D scene** (`plot_bgcolor` stays undefined) — a control that silently does nothing; no grid toggle (3D axes have their own grids); orientation correctly disabled. Not fixed in this run |
| 6 | Statistics | N/A | No statistics in Team |
| 7 | Export | PASS (note) | PNG 283 KB; Team PDF `PCA_3D_*.pdf` 4.2 KB; **SVG disabled with no reason shown** (image plots say why; this one does not) |
| 8 | Finish | PASS | Snapshot 423×418; Edit figure → live Plotly |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps dot size 14 and label; remove + Undo restores |
| 10 | Save and reopen | PASS | Reopened with dot size 14, label, background |
| 11 | Console | PASS | 0 errors |

Auditor (Opus 5.5): OPEN – Appearance offers "Plot background" that does nothing on the 3D scene; SVG disabled without a reason

Adversary (Astra): DISAGREE – Agree with the recorded background defect: `frontends/nexo/src/ui/PlotEditor/Background.tsx:3` exposes `plot_bgcolor`, not scene background. `pca3dPlot-3-larger.png` shows “Loading figure…”. Further, `pca3dPlot-5-appearance.png` visibly clips the scene’s points/axis text; element-bound checks cannot detect this (`tests/dual-ui/chart-audit/audit_b02-qc-a.cjs:183`). #4 misses custom color/shape controls (`R/modules/2_qc_boxplot_module.R:809`, `R/frontends/api/schema.R:125`) and has no saved green rerun. Healthy-in-grey is only checked, not visually asserted (script 263; screenshot groups are Control/Treatment); Undo/Redo checks availability, not restored appearance (272). #2 compares type/count rather than coordinates (162), and #11 loses earlier errors (394–411).

### Rework round 1

(a) **Fixed, test first:** "Plot background" now paints the 3D scene. A Plotly scene ignores `plot_bgcolor`, so
`applyEditor` also writes `<scene>.bgcolor` for every scene used by 3D traces (scatter3d, mesh3d, surface, cone,
streamtube, isosurface, volume); Page background (`paper_bgcolor`) is unchanged. Kept rather than hidden because
the control promises the background behind the data, and in 3D that is the scene. Red `782fcc7`
(`Tests 1 failed | 11 passed (12)`), green `72ab661` (vitest 56 files / 232 tests passed; `tsc --noEmit` exit 0).
Not yet seen in the browser (API down); the script's #5 now asserts `scene.bgcolor` for 3D.

(b) SVG: `svgAvailable` (`frontends/nexo/src/ui/Dialogs/ExportDialog.tsx:24`) is true for a live Plotly card, and
when it is false the button carries the reason as `title` (`ExportTab.tsx:30`). The button is also disabled while
the tab is `busy`, which is the state right after the PNG download the old script had just made; the "no reason
shown" is most likely that race, not a Nexo rule. Not confirmed in the browser: the script now waits for
`aria-busy` to clear, then downloads the SVG or requires a reason.

(c) Clipping in `pca3dPlot-5-appearance.png`: not reached. The script now records layout size, margins and scene
domain beside the screenshot for that comparison.

(9) Healthy in grey / Undo-Redo: the script now asserts the visible effect (Undo of the last palette restores the
previous palette's trace colours; Redo re-applies; Healthy in grey turns the Healthy trace #7A7A7A, or is N/A with
unchanged colours when the checkpoint has no Healthy group). Not yet run.

- customCol_* / customShape_* and Show Statistic Detail: Nexo gap (see coordinator correction at the top): Team's drawer shows it. Team's own canvas excludes action buttons, file inputs and
computed ids from a card's inputs (`R/frontends/team/plot_instances.R:100-142`, `team_plot_instance_input_ids` /
`team_plot_instance_dynamic_ids` and the comment at the top of that block; `www/team/js/canvas.js:303` skips
`button`/`.action-button`).

**Rerun 2026-11-07** (wave-1 UI, Vite :5182, API 127.0.0.1:3962, script at `be4b4b6`; results
`b02-qc-a/results-rework1-pca3dPlot_boxplotAfterNorm_load2dPlot_pca2dVectorPlot_load2dVectorPlot_outlierPlot_pca2dPlot.json`):
#2 PASS (same 2 traces, types and x/y/z to 6 significant digits as the module's own `/render` with the same body);
#7 PASS (PNG 651 835 B, **SVG 218 450 B downloaded**, Team PDF, card PDF offered, `pca3dPlot-r1-7-export-dialog.png`);
#6 N/A. #1, #3, #4, #5, #8 FAIL by 30 s click/focus timeouts: this was the first plot of the run and the script's
toggle click on "Plots" reopened the floating Library over the card (script defect, fixed in `4001db2`, not re-run
for this plot in the time box). These failures say nothing about the plot.

(b) **Closed:** SVG export works on a live pca3d card (218 450 B). The round-0 "disabled without a reason" was the
`busy` race after the PNG download, not a Nexo rule; when SVG is not available Nexo says why (seen this run on
outlierPlot: "This figure is a raster image; SVG is not available.").

(c) Clipping: **still visible** in `pca3dPlot-r1-4-data-scoreMarkerSize3D.png` (card at 92 %): the scene's points and
grid run past the left and bottom of the plot area (a Treatment point is cut at the left edge). The module sets no
camera (`R/modules/2_qc_boxplot_module.R:2356`, Plotly default eye), and #2 shows the card draws the module's
traces unchanged, so the cause is not the data; the same-size render of the figure outside Nexo (to tell Plotly's
default framing from a Nexo container/zoom effect) was **not done** in the time box. Not called Team behaviour.

(a) Background on the scene: the #5 assertion of `scene.bgcolor` did not run (timeout above): still unconfirmed in
the browser.

Auditor (Opus 5.5), round 1: OPEN – (c) scene clipping needs the same-size render outside Nexo; (a) scene background and checks 1, 3, 4, 5, 8–10 need a clean rerun of this plot

**Part 2 (2026-11-07):** not re-run in the time box. The script's #2 now draws the module's own figure JSON with
plain Plotly in a bare div of the card's requested size (`<plot>-r1-2-api-bare.png` beside `-r1-2-card-same-size.png`),
which is the comparison needed for (c); it ran on pca2dVectorPlot only.

Auditor (Opus 5.5), round 1: OPEN – (c) scene clipping same-size comparison not run on pca3d; (a) and checks 1, 3, 4, 5, 8–10 need a clean rerun

## qc_pca_tab-load2dPlot · PCA loadings · 2D (png)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `load2dPlot-1-draws.png`, `-1-zoomed-out.png` |
| 2 | Matches Team | PASS | Verified by eye: on arrival the card shows individual lipids ("2D PCA Loadings", lipid-class legend; `load2dPlot-1-draws.png`), i.e. the catalog default `pcaMode=omics`. The script's FAIL ("not at default") is a false positive of its radio check, to fix in the script |
| 3 | Size | PASS | 620 → 780 → 390 px, redrawn, no overflow |
| 4 | Data tab | PASS | 48 Team controls present; PCA Analysis Mode change redraws; no numeric control for this plot |
| 5 | Appearance | PASS | Label + Background |
| 6 | Statistics | N/A | No statistics in Team |
| 7 | Export | PASS | PNG 1.1 MB; SVG disabled with the raster reason; Team PDF `Loading_2D_*.pdf` 12 KB |
| 8 | Finish | PASS | Snapshot 423×498; Edit figure → live PNG |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps mode and label; remove + Undo restores |
| 10 | Save and reopen | PASS | Reopened with mode, label, background |
| 11 | Console | PASS | 0 errors |

Auditor (Opus 5.5): AGREE

Adversary (Astra): DISAGREE – #4 is not demonstrated: `load2dPlot-4-data-changed.png` still contains individual lipid labels. The module’s aggregated value is `class` (`R/modules/2_qc_boxplot_module.R:63`), but the script hard-codes `classes` (line 24) and `dataValue` returns that constant from checked state without reading a value (line 100). Thus #9/#10 do not prove the stored mode. The initial default assertion fails before the source render comparison (script 147), and a same-input comparison cannot be replaced by identifying lipid labels. Both size screenshots show “Loading figure…”. The later plot is visibly crowded at small size; numeric dot/label-size controls do exist (`R/modules/2_qc_boxplot_module.R:114`), contrary to #4’s “no numeric control.” Shared action omissions and lost console errors also apply.

### Rework round 1

Agree with Astra: the round-0 script set `classes`, which is not an option (`pcaMode` is `omics`/`class`,
`R/modules/2_qc_boxplot_module.R:60-65`), and read a constant; round 0's #2, #4, #9 and #10 for this plot are
therefore withdrawn. The script now reads the checked radio (its label mapped to the catalog option value) and
sets `class`. Correction: the loadings dot and label size sliders exist (`loadMarkerSize2D`, `loadTextSize2D`,
`R/modules/2_qc_boxplot_module.R:113-114`, both in the catalog inputs); the script changes them (→ 12, → 6). The
crowding at small size and its cause (fixed label size, or not) were not reached.

- customCol_* / customShape_* and Show Statistic Detail: Nexo gap (see coordinator correction at the top): Team's drawer shows it. Team's own canvas excludes action buttons, file inputs and
computed ids from a card's inputs (`R/frontends/team/plot_instances.R:100-142`, `team_plot_instance_input_ids` /
`team_plot_instance_dynamic_ids` and the comment at the top of that block; `www/team/js/canvas.js:303` skips
`button`/`.action-button`).

**Rerun 2026-11-07** (script `be4b4b6`, same results JSON as pca3dPlot): #1 PASS (click-to-focus at 100 %, 41 %
frozen image); #4 PASS (48 controls; pcaMode set to class redrew; Loadings 2D Dot Size 8→12 and Label Size 4→6
redrew; Tab reaches all three); #5 PASS; #6 N/A; #7 PASS (PNG 1 329 799 B; SVG disabled with the raster reason; Team
PDF 12 132 B); #8 PASS (snapshot 423×498). #3 FAIL on the restore step (as boxplotAfterNorm).

**#2 FAIL, new finding:** on a fresh card the Inspector reads pcaMode = `class` ("Aggregated Classes" checked), but
the card draws individual lipids (`load2dPlot-r1-1-draws.png`: lipid labels, legend "Lipid Class"), i.e. `omics`,
the catalog default. Either the Inspector shows a value the plot does not use, or the radio read is wrong; and
"class→class redrew" in #4 means the change was not from omics. Not diagnosed in the time box; possible Nexo defect.
Because #2 stopped before the byte comparison, the same-size render from the API was not made, so the crowding
(labels overlapping at 620×720 in `load2dPlot-r1-1-draws.png`) is **not** called Team behaviour.

Auditor (Opus 5.5), round 1: OPEN – Inspector pcaMode (class) vs drawn plot (omics) mismatch; crowding needs the same-size module render; #3 restore step, #9–#10 pending

**Part 2 (2026-11-07), pcaMode mismatch settled: Team behaviour, not a Nexo defect.** Evidence
(`b02-qc-a/probe-pcamode.json`, `load2dPlot-r1-probe-pcamode.png`): Nexo creates the card with `inputs: {}`
(`POST /sessions/…/cards`, 0 inputs) and renders with `{width:620,height:720,format}` only — Nexo sends no pcaMode.
The card's live schema reports `pcaMode {"value":"class","default":"omics"}`, which the Inspector shows faithfully.
The value is moved by the module itself: on the first visit of "PCA Loading Plots" it calls
`updateRadioButtons(session, "pcaMode", selected = "class")` (`R/modules/2_qc_boxplot_module.R:746-756`). The loadings
drawn do not come from the card's pcaMode: they come from `shared_data$pca_results()`, computed with
`pca_settings_val()$pcaMode` (`R/modules/1_shared_data_module.R:4523-4541`), which follows the analysis settings
(`:1205-1222`, default omics); Team gives copies pcaMode only so that observer does not fail
(`R/frontends/team/plot_instances.R:166-173`). So a copy's pcaMode radio does not choose the PCA in Team either; the
analysis-level PCA mode does. No Nexo change, no test. Not re-run for #3/#9/#10 (fixes in `22fcd4f`, `1148ff5`).

Auditor (Opus 5.5), round 1: OPEN – pcaMode mismatch settled (Team behaviour); #3/#9/#10 and the crowding same-size render not re-run

## qc_pca_tab-load2dVectorPlot · PCA loadings · editable 2D (plotly) — partial

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | FAIL (Team behaviour) | Same refusal as pca2dVectorPlot: "Editable vector view unavailable: smart repelled labels are preserved only in the original view; disable smart labels to edit this view." (`smartLabelLoad2D` defaults to TRUE) |
| 2–10 | — | not reached | card does not draw with catalog defaults |
| 11 | Console | FAIL | 422 of the refused render |

Open question for Gerardo: same as pca2dVectorPlot (add editable cards with smart labels off?).

Auditor (Opus 5.5): OPEN – does not draw with catalog defaults (Team refusal); decision needed

Adversary (Astra): DISAGREE – The smart-label refusal is supported (`R/frontends/team/legacy_vector_adapter.R:10`, `R/frontends/team/qc-ui.R:71`), but the script stops before checks 2–10 (`tests/dual-ui/chart-audit/audit_b02-qc-a.cjs:137`). Disable smart labels and audit recovery without changing product defaults. The loadings radio probe also reports hard-coded `classes` rather than actual `class` (script 25, 100; `R/modules/2_qc_boxplot_module.R:63`), so it needs correction before further evidence is trustworthy. No refusal screenshot is supplied; recovery, appearance and exports are not verifiable without a browser.

### Rework round 1

Run status: not reached (audit API unreachable). As pca2dVectorPlot: refusal screenshot, `smartLabelLoad2D` off in
the Data tab, then checks 2–10; the radio probe now uses `class`. No default changed; the round-0 open question is
withdrawn.

- customCol_* / customShape_* and Show Statistic Detail: Nexo gap (see coordinator correction at the top): Team's drawer shows it. Team's own canvas excludes action buttons, file inputs and
computed ids from a card's inputs (`R/frontends/team/plot_instances.R:100-142`, `team_plot_instance_input_ids` /
`team_plot_instance_dynamic_ids` and the comment at the top of that block; `www/team/js/canvas.js:303` skips
`button`/`.action-button`).

**Rerun 2026-11-07: not reached.** The run (order pca3dPlot, boxplotAfterNorm, load2dPlot, then this plot) was
stopped at the 30-minute time box before this plot. The editable view with smart labels turned off by the user (`smartLabelLoad2D` off in the Data tab) is still not shown in a browser. 

Auditor (Opus 5.5), round 1: OPEN – not reached; editable view with smart labels off not yet shown

**Part 2 (2026-11-07, `results-rework1-pca2dPlot_load2dVectorPlot.json`):** **#1 PASS: the editable loadings view
draws after smart labels are turned off.** Team's refusal on arrival (422, Team behaviour, `load2dVectorPlot-r1-1-refusal.png`);
schema `smartLabelLoad2D {"value":true}`; unchecking it sent `PATCH {"inputs":{"smartLabelLoad2D":false}}` → 200 and the
card drew (`load2dVectorPlot-r1-1-draws.png`). #2 FAIL on the pcaMode default check (Inspector `class`, catalog `omics`):
**Team behaviour**, the same module observer as load2dPlot (`R/modules/2_qc_boxplot_module.R:746-756`, see load2dPlot
part 2); the script's expectation is wrong for both loading plots (not fixed in the time box), so the trace comparison
was not reached. #3 FAIL as pca2dVectorPlot (no Plotly figure after the drag, undiagnosed). #4 PASS (48 controls;
Loadings 2D Dot Size 8→12 redrew; Tab reaches the three controls). Checks after #4: see the results JSON if the run
finished before the time box; not reviewed here.

Auditor (Opus 5.5), round 1: OPEN – #2 expectation must use the module-moved pcaMode; #3 undiagnosed; #5–#10 not reviewed

## Rework round 1 · batch notes

Auditor round 1 (Opus 5.5), 2026-11-06, Vite :5192, audit API 127.0.0.1:3962. Script defects A1–A4 fixed in
`tests/dual-ui/chart-audit/audit_b02-qc-a.cjs` (radio values read from the checked input; console errors from
every page of the context; resize waits for the redrawn content; #2 compares bytes / trace coordinates); also
adds the 240×220 minimum, a 375×812 phone read-only check (no sideways scroll, chrome text ≥ 12 px) and keyboard
(Tab) reach of the audited Data controls. Screenshots of this round are `b02-qc-a/<output>-r1-<check>.png`, so
Astra's round-0 evidence is kept. **A5 is not met:** the only saved rerun (`results-rework1-boxplotAfterNorm.json`)
is an honest failure caused by the API going down; no plot has a green rework run.

Long labels / many groups: N/A on this synthetic checkpoint (two groups, Control/Treatment, short names); not
shown otherwise.

Open question for Gerardo: Team's canvas card does not offer Show Statistic Detail, Process Outlier Risks… or the
computed per-group colour/shape controls (customCol_* / customShape_*). Should Nexo go beyond Team's canvas and
offer them in the Inspector? Not implemented.

### Rerun 2026-11-07 · batch notes

Vite :5182 (`batches.json`), API 127.0.0.1:3962 (tunnel guard), checkpoint nexo-complete-synthetic; saved only
`audit-b02-rework-synthetic` and deleted it after each plot (cleanup 200). Script adapted to wave 1 (`967c0e5`,
`43d301f`, `be4b4b6`, `4001db2`): real zoom read, results JSON after every plot, module-moved default for
outlierNumShow, click-to-focus wait before dragging, Library closed only if open. No app code changed this round,
so no test-first commit. Customs `customCol_*`/`customShape_*` and module action buttons (Show Statistic Detail,
Process Outlier Risks…): **Nexo gap, in progress** (another task), not implemented here.

| plot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pca3dPlot | F* | P | F* | F* | F* | N/A | P (SVG ok) | F* | F | F | P |
| boxplotAfterNorm | P | P (bytes) | F (restore) | P | P | N/A | P | P | F | F | P |
| load2dPlot | P | F (pcaMode) | F (restore) | P | P | N/A | P | P | F | F | P |
| outlierPlot (run 2) | P | F→fixed | F→fixed | P | P | N/A | P | P | stopped | stopped | stopped |
| pca2dVectorPlot | F (stays in error after smart labels off) | – | – | – | – | – | – | – | – | – | P (only the refusal 422) |
| pca2dPlot, load2dVectorPlot | not reached |

F* = Library reopened over the card (script, fixed in `4001db2`, not re-run). Still open: pca3d scene clipping (c)
and scene background (a) in the browser, load2d Inspector/plot pcaMode mismatch, #9/#10 failures, #3 restore step,
merged-view title crop and load2d crowding same-size renders, guided_qc_sample effect (probe
`tests/dual-ui/chart-audit/probe_b02-guided.cjs` written, not run), the three plots not reached.

### Rework round 1 part 2 · batch notes (2026-11-07)

Vite :5182 (my PID, stopped at the end), API 127.0.0.1:3962, checkpoint nexo-complete-synthetic; only
`audit-b02-rework-synthetic` saved, deleted after each plot through the API from Node (200 every time; a leftover copy
from part 1 was deleted first, 200). Script fixes (test-only): `22fcd4f` (i) resize in card units at the measured
zoom + restore assertion, (ii) #9 Duplicate from the ⋯ menu (wave-1 cards have no footer, `frontends/nexo/src/cards.ts:3`),
failing checks save a screenshot/URL/console, (iii) cleanup through the API; `1148ff5` handle brought on screen,
module-reset controls, extra cards removed before #10, expected 400 in #11; `5f2bed8` bare same-size Plotly render in
#2, pcaMode probe; `36570e1` fixed-height plots, reopen retry; `d98f5ed` API answers (PATCH bodies and status) in
failures; `fc8b711` smart-label recovery records the schema value, phone wait. No app code changed, so no test-first commit.

| plot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| outlierPlot | P | P (bytes) | F (module height; script fixed, not re-run) | P | P | N/A | P | P | P | F (reopen; fixed, not re-run) | P |
| pca2dVectorPlot | P (after smart labels off) | P (traces) | F (no figure after resize) | P | F (no chart font size) | N/A | P (SVG) | P | P | F (phone wait) | F (phone notes only) |
| pca2dPlot | P | P (bytes) | F | P | P | N/A | P | P | P | F (phone wait) | F (phone notes only) |
| load2dVectorPlot | P (after smart labels off) | F (expectation; Team observer) | F (no figure after resize) | P | F (no chart font size) | N/A | P (SVG 59 551 B) | P | F (60 s wait, undiagnosed; run stopped at the time box) | stopped | stopped |
| pca3dPlot, boxplotAfterNorm, load2dPlot | not re-run (part 1 rows stand) |

Settled: load2dPlot pcaMode mismatch = Team behaviour (module observer + shared PCA, file:line in its section);
pca2dVectorPlot/load2dVectorPlot recover once smart labels are off (PATCH 200). Still open: 3D scene clipping
(bare same-size render now in the script, not run on pca3d), guided_qc_sample probe not run, #3 on png/plotly cards,
phone open of #10, the reruns of pca3dPlot/boxplotAfterNorm/load2dPlot failed checks.

## Round 2 (closing) · 2026-11-07

Auditor round 2 (Opus 5.5), branch `router/20261107-163913-aa7fc7` (based on `router/20261107-101109-688d5a` `0ebb746`,
`nexo/phase1` `d35d458` merged in `2b1c952`, no conflict). Vite :5182 (my PID, stopped at the end), audit API
127.0.0.1:3961, checkpoint `nexo-complete-synthetic`; saved only `audit-b02-rework-synthetic` (runs 1, 3, 4) and, for the runs in parallel,
`audit-b02-qc-a-r2b-synthetic` (run 5) / `audit-b02-qc-a-r2c-synthetic` (run 6); each deleted after its plot (200 every time).
Run 4's cleanup also deleted run 3's same-named checkpoint while run 3 was on it (its pca3dPlot #10 had already
reopened; `45a28bc` gives parallel runs their own name). At most two audit runs used the API at once. Screenshots `b02-qc-a/<plot>-r2-<check>.png`; raw results `b02-qc-a/results-round2-*.json`
(run 1: `results-round2-pca3dPlot_boxplotAfterNorm_load2dPlot.json`; run 3 (stopped by me after pca2dPlot):
`results-round2-pca2dVectorPlot_load2dVectorPlot_pca3dPlot_pca2dPlot_boxplotAfterNorm.json`; run 4:
`results-round2-pca2dVectorPlot.json`; run 5: `results-round2-pca2dPlot_outlierPlot.json`; run 6: `results-round2-boxplotAfterNorm_load2dVectorPlot.json`; guided probe: `results-round2-guided-probe.json`).

### Script fixes (test-only)

- `0353408`: wave 2 has no "Plots" rail toggle → the Library opens from the toolbar's "+ Add plot" (`frontends/nexo/src/ui/Toolbar.tsx:47`)
  and closes with "Close library"; **#10 phone**: the 375 px wait was on `#world`, a zero-size absolute layer that
  Playwright never reports "visible" — the page was up (`open-phone-1-fail.png` shows the canvas): **script, not app**;
  it now waits for `#viewport`. **#3 (plotly "no figure after resize")**: `resized()` read the Plotly size and the
  image hash *after* the drag, when a live card has already gone frozen→live and emptied its body
  (`frontends/nexo/src/canvas.ts:177`, `frontends/nexo/src/cards.ts:357-359`), hence `Cannot read properties of null
  (reading '_fullLayout')`: **script**; both are now measured before the drag. **#5**: the font-size control was
  renamed by F3 (`8c1569b`) from "Chart font size" to "Base size" (Typography section,
  `frontends/nexo/src/ui/PlotEditor/Typography.tsx:15`, applied as layout `font.size` through `applyEditor`): **not
  missing**, the script looked for the old label. load2d plots: pcaMode expects the module-moved `class` (`live`) and
  #4 changes it to `omics`.
- `9b2e308`: wave 2 nests a `details.plot-editor` (colour-blind check) inside the editor → `div.plot-editor`; the SVG
  reason is now a paragraph referenced by `aria-describedby`, read as well as `title`; dynamic-select probe crashed on a
  non-select element; the bare same-size Plotly render is removed before the card is captured (in round 1 it covered
  the card's left part) and is drawn without `staticPlot` (the WebGL scene was empty); **#4 now asserts that every
  module action of the card schema (`actionControls`, `R/frontends/api/schema.R:140-145`) is a button in the Data tab**
  and compares computed controls (schema vs Inspector); resize timeouts report node/image size.
- `8a4cf7f` overflow failures report the offending rects; `d0ba996` pca2dPlot #4 ticks Use custom colors and checks
  the computed group colours.

### Nexo fixes (test first)

1. **Phone chrome < 12 px (#10).** The fixed phone check found the top-bar logo "LE" at 11 px
   (`pca3dPlot-r2-10-fail.png`: `[["SPAN.logo",11,"LE"]]`). Red `bb63546` (`src/ui/phoneChrome.test.ts`:
   `Tests 3 failed | 4 passed (7)`, then with the icon rule for `.records-warning` recognised `2 failed | 5 passed`:
   `.topbar .logo`, `.tile-count`). Green `8eca5c8`: both follow `--font-label` (12 px at ≤ 480 px) in a rule at the
   end of `shell.css`; the test also requires the override to come after the rule it raises (a first attempt beside
   `shell.css:413` passed for the logo but not for `.tile-count`, defined later: `1 failed | 6 passed`, now `7 passed`).
   Browser: load2dPlot, boxplotAfterNorm, pca2dVectorPlot and load2dVectorPlot #10 phone checks after the change:
   "no sideways scroll, chrome text ≥ 12 px" (`*-r2-10-phone.png`).
2. **Plot cut after a refused render (#3).** pca2dVectorPlot/load2dVectorPlot #3 "overflow when larger"; #5 recorded
   "layout 780x742 in div 780x710". Cause: a failed render marks the body `.message` (`cards.ts:529`, `:550`), which
   pads it 16 px per side (`shell.css` `.card .body.message`); only Retry removed it (`cards.ts:458`), so after the
   user turned smart labels off the Plotly layout (`node.height − CARD_CHROME`) overflowed the body by 32 px and the x
   axis was cut. pca3dPlot (never refused) had "layout 620x682 in div 620x682". Red `eaefa01`
   (`src/cardBodyMessage.test.ts`: `Tests 1 failed | 2 passed (3)`), green `70edee9`: `setTier` drops `.message`
   when it empties the body for a new render (every redraw passes there: `refreshCard → reload → setTier`,
   `canvas.ts:859`, `cards.ts:571-573`). Browser: run 4 (`results-round2-pca2dVectorPlot.json`) **AUDIT OK, 11 checks, 0 failed**: #3 PASS and #5 "layout 620x682 in div 620x682" after the refusal.

Before the app commits: `npx vitest run` → **99 files, 450 tests passed**; `npx tsc --noEmit -p .` → exit 0. Mock
suites (with `NEXO_PLOTLY_JS=~/nexo-vendor/plotly.min.js`): `test_nexo_inspector.cjs` **40 PASS, 0 FAIL, exit 0 (H3 OK)**; `test_nexo_card_chrome.cjs` **25 PASS, 0 FAIL, exit 0 (H6-0 OK)** — both run on the final app code (`70edee9`). (A first attempt without `NEXO_PLOTLY_JS` stopped at the Plotly vendoring step, not a test result.).

### Astra objections · round 2 answers

| Objection | Answer | Evidence |
|---|---|---|
| QC statistics action (Show Statistic Detail, `R/frontends/team/qc-ui.R:88`) filtered at `R/frontends/api/schema.R:125` | **Fixed (wave 2, `nexo/phase1`)** — the card schema now carries the module's action buttons as `actionControls` (`R/frontends/api/schema.R:140-145`) and the Data tab renders them (`frontends/nexo/src/ui/forms/actions.ts:7`). Round 2 #4 asserts every schema action is a Data-tab button | #4 on all re-run plots: "module actions in the Data tab: Process Outlier Risks... / See high variance lipids... / Show Statistic Detail / Switch to Aggregated Classes …". Pressing them (what each one does) was not exercised this round |
| Per-group colour/shape controls (`R/modules/2_qc_boxplot_module.R:809`, `:820`) absent | **Fixed (wave 2)** — computed `customCol_*`/`customShape_*` are kept in the schema (`schema.R:146-150`) and shown by `ComputedControls.tsx`. **Team behaviour:** the module renders them only once *Use custom colors* / *Use shapes* is ticked (`2_qc_boxplot_module.R:808-818`, `req(isTRUE(input$useCustomColors))`), so with defaults the schema has only `bqcSamples` (seen on every card) | pca2dPlot #4 (run 5): Use custom colors ticked → "Colour for Control" / "Colour for Treatment" in the Data tab, schema `customCol_Control`, `customCol_Treatment` (computed); first group → #00aa00 redrew (`pca2dPlot-r2-4-data-custom-colour.png`). *Use shapes* not exercised |
| #2 strength (nonzero widths / trace type-count) | **Fixed (script)** — png: sha256 of the card's image bytes = the module's own `/render` with the same body; plotly: trace types and x/y/z to 6 significant digits | e.g. boxplotAfterNorm sha256 7c052f91…, load2dPlot 9dd1c683…, pca3dPlot 2 traces, pca2dVectorPlot 4, load2dVectorPlot 12 traces identical |
| #11 console log lost across reopen | **Fixed (script, round 1, verified round 2)** — `watch()` is attached to every page of every context, the list is reset per plot only; round-2 #11 includes the reopen and phone pages (`page+`, `reopen`, `phone` tags) | load2dVectorPlot #11: 3 errors, all Team's smart-label 422 (arrival and the #9 duplicate); others 0 |
| `-3-larger` shows "Loading figure…" | **Fixed (script)** — `resized()` waits for state current, no "Loading figure…", a new size/hash measured against the pre-drag one | `pca3dPlot-r2-3-larger.png`, `pca2dVectorPlot-r2-3-larger.png` (run 4) |
| pca3d: "Plot background" does nothing on a 3D scene | **Fixed** (`72ab661`, round 1) and **verified in the browser** | pca3dPlot #5: "plot background → scene.bgcolor #f0f0ff" |
| pca3d: scene clipping in the card | **Team behaviour (module framing)** — the module's figure drawn by plain Plotly in a bare 620×720 div shows the same framing and the same clipped points as the card | `pca3dPlot-r2-2-api-bare.png` vs `pca3dPlot-r2-2-card-same-size.png`; the module sets no camera (`2_qc_boxplot_module.R:2356`) |
| Healthy in grey / Undo-Redo only checked for presence | **Fixed (script)** — Undo restores the previous palette's trace colours, Redo re-applies; Healthy in grey N/A on this checkpoint (groups Control/Treatment, colours unchanged) | pca3dPlot, pca2dVectorPlot, load2dVectorPlot #5 |
| load2d: script set `classes`, read a constant | **Fixed (script, round 1)**; round 2 reads the checked radio | load2dPlot #4 "pcaMode class→omics redrew" |
| load2d: initial pcaMode `class` ≠ catalog `omics` | **Team behaviour** — `updateRadioButtons(…, "pcaMode", selected = "class")` on the first visit of PCA Loading Plots (`2_qc_boxplot_module.R:746-756`); the script now expects it | load2dPlot/load2dVectorPlot #2 PASS |
| #7 accepts a missing card PDF | Recorded per plot ("card PDF offered" on every re-run plot) | #7 rows |
| outlierPlot `guided_qc_sample` claimed absent | Corrected in round 1 (it is present); round 2: see outlierPlot | `results-round2-guided-probe.json` |

### qc_pca_tab-pca3dPlot · Round 2

Run 3 (script `9b2e308`), checks 1–9; #10 from run 1/run 3 as noted.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | click-to-focus at 100 %, zoomed out to 41 %: frozen image tier (`pca3dPlot-r2-1-draws.png`, `-1-zoomed-out.png`) |
| 2 | Matches Team | PASS | same 2 traces, types and x/y/z (6 significant digits) as the module's `/render` with the same body; bare same-size render `pca3dPlot-r2-2-api-bare.png` vs `-2-card-same-size.png` |
| 3 | Size | PASS | 620×720→780×780→450×520→240×220 (minimum)→620×720 restored through the handle; Plotly layout 620×682→780×742→450×482→240×182 (`-3-larger.png`, `-3-smaller.png`, `-3-minimum.png`) |
| 4 | Data tab | PASS | 48 catalog controls; 3D Dot Size 8→14 redrew; Tab reaches it; module actions present (Show Statistic Detail, Process Outlier Risks…, …); computed: bqcSamples (custom colours: see pca2dPlot) |
| 5 | Appearance | PASS | title; Base size 16 and colour #aa0000 on the plot; **Plot background → `scene.bgcolor` #f0f0ff** (round-1 fix seen in the browser); 6 palettes, 6 colourings; Undo/Redo restore colours; Healthy in grey N/A (no Healthy group); legend Top Left; no grid toggle (3D); orientation disabled; Reset; layout 620×682 in div 620×682 (`-5-appearance.png`) |
| 6 | Statistics | N/A | "Statistics are available for independent violin copies." |
| 7 | Export | PASS | PNG 498 112 B; SVG disabled **with the reason shown**: "3D and WebGL plots are drawn by the graphics card; Plotly cannot save them as vector SVG. Use PNG or PDF."; Team PDF 4 229 B; card PDF offered |
| 8 | Finish | PASS | snapshot 620×682; Edit figure → live Plotly |
| 9 | Duplicate / remove / undo | PASS | duplicate keeps 3D Dot Size 14, label, background; remove + Undo brings it back drawn |
| 10 | Save and reopen | PASS | reopened with 14, label, background; phone 375×812: no sideways scroll, chrome ≥ 12 px (run 3, after the logo fix; run 1 had found the 11 px logo, `pca3dPlot-r2-10-fail.png`) | |
| 11 | Console | PASS | 0 errors on all pages (add, reopen, phone) | |

Scene clipping (c): **Team behaviour** — the module's own figure in plain Plotly at 620×720 has the same framing and the
same cut points as the card (bare vs card images above); the module sets no camera (`R/modules/2_qc_boxplot_module.R:2356`).

Auditor (Opus 5.5), round 2: AGREE

### qc_pca_tab-pca2dVectorPlot · Round 2

Run 3 (#1–#11) and run 4 (after the `.message` fix, #1–#11).

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS (after the user's action) | Team's refusal on arrival (422, `R/frontends/team/legacy_vector_adapter.R:10`; `pca2dVectorPlot-r2-1-refusal.png`); Inspector shows smart labels **on**, schema `{"value":true}` (consistent this time); unticked → `PATCH {"smartLabelPCA2D":false}` 200 → drawn (`-1-draws.png`) |
| 2 | Matches Team | PASS | same 4 traces and x/y/z as the module render; bare render `-2-api-bare.png` |
| 3 | Size | **PASS (run 4)** | run 3 FAIL "overflow when larger" = Nexo bug (`.message` padding kept after the refusal), fixed `eaefa01`/`70edee9`; run 4: 620×720→780×780→450×520→240×220→620×720 restored; layout 620×682→780×742→450×482→240×182 |
| 4 | Data tab | PASS | 48 controls; 2D Dot Size 8→14 redrew; Tab reaches it and smartLabelPCA2D; module actions present |
| 5 | Appearance | PASS | **Base size 16 on the plot** (the control exists: F3 Typography), colour, plot_bgcolor, 6 palettes/6 colourings, Undo/Redo colours, Healthy N/A, legend Top Left, grid toggle, orientation enabled, Reset; layout in div: run 3 780×742 in 710 (bug), **run 4 620×682 in 620×682** |
| 6 | Statistics | N/A | as above |
| 7 | Export | PASS | PNG; **SVG 16 470 B**; Team PDF 6 414 B; card PDF offered |
| 8 | Finish | PASS | snapshot; Edit figure → live Plotly |
| 9 | Duplicate / remove / undo | PASS | keeps 2D Dot Size 14 and background; remove + Undo |
| 10 | Save and reopen | PASS | reopened with label, 14, background; **phone 375×812: no sideways scroll, chrome text ≥ 12 px** (`-10-phone.png`) |
| 11 | Console | PASS | only Team's expected smart-label 422 of the arrival |

Auditor (Opus 5.5), round 2: AGREE

### qc_pca_tab-pca2dPlot · Round 2

Run 3 (script `9b2e308`) and run 5 (script `45a28bc`, with Use custom colors in #4).

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `pca2dPlot-r2-1-draws.png`, zoomed out 41 % frozen image |
| 2 | Matches Team | PASS | bytes identical to the module's `/render` (620×720, sha256 31e8e0e3580c…, 40 483 B) |
| 3 | Size | FAIL (undiagnosed: png cards) | the drag does not resize png cards: after it the node is still 620×720 and the last render request is 240×220 (`pca2dPlot-r2-3-fail.png`; same on boxplotAfterNorm/load2dPlot), while the same drag resizes the Plotly cards (pca3dPlot, pca2dVectorPlot PASS). Run 6 adds what the pointer hits: at the handle's centre it is `DIV.resize-handle` and the drag still ends with no resize. Not diagnosed in the time box; one candidate to check next (not confirmed): `vp.onlostpointercapture = end` (`frontends/nexo/src/canvas.ts:697`) — an `end` from a lost capture is not a `pointerup`, so it calls `reconcile()` and dispatches no resize (`canvas.ts:690-695`); the image body re-render during the drag could be what drops the capture. In round 1 (wave-1 UI) the same plot redrew larger/smaller/minimum, so this may be a wave-2 regression or a script interaction; **not called a Nexo bug or Team behaviour yet** |
| 4 | Data tab | PASS | 48 controls; 2D Dot Size 8→14 and 2D Label Size 4→6 redrew; Tab reaches both; module actions present; **Use custom colors on → "Colour for Control" / "Colour for Treatment" (schema `customCol_Control`, `customCol_Treatment`), first group → #00aa00 redrew** (`pca2dPlot-r2-4-data-custom-colour.png`, run 5) |
| 5 | Appearance | PASS | Label, card background, canvas Undo/Redo |
| 6 | Statistics | N/A | |
| 7 | Export | PASS | PNG 577 726 B; SVG disabled: "This figure is a raster image; SVG is not available."; Team PDF 6 656 B; card PDF offered |
| 8 | Finish | PASS | snapshot 620×720; Edit figure → live png |
| 9 | Duplicate / remove / undo | PASS | keeps 14/6, label, background; remove + Undo |
| 10 | Save and reopen | PASS | reopened with 14/6, label, background; **phone 375×812: no sideways scroll, chrome ≥ 12 px** (`pca2dPlot-r2-10-phone.png`) |
| 11 | Console | PASS | 0 errors |

Auditor (Opus 5.5), round 2: OPEN – #3 png resize (undiagnosed); everything else PASS

### qc_pca_tab-outlierPlot · Round 2

Run 5 (script `45a28bc`, `results-round2-pca2dPlot_outlierPlot.json`).

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `outlierPlot-r2-1-draws.png`, zoomed out 41 % frozen image |
| 2 | Matches Team | PASS | bytes identical to the module's `/render` (620×720, sha256 9c69322956…, 28 863 B); Samples Displayed 24 = module-moved default (Team, `R/modules/2_qc_boxplot_module.R:1110`) |
| 3 | Size | FAIL (undiagnosed) | as the other png cards: node unchanged after the drag, last render 240×220 (`outlierPlot-r2-3-fail.png`) |
| 4 | Data tab | PASS | 48 controls; MAD 2.5→3.5 redrew; −4 refused "Invalid value for outlierThreshold: below the minimum 1"; Context Scope global→group redrew; Samples Displayed 24→10 redrew; Tab reach; module actions present |
| 5 | Appearance | PASS | Label, card background, Undo/Redo |
| 6 | Statistics | N/A | |
| 7 | Export | PASS | PNG 288 067 B; SVG disabled with the raster reason; Team PDF 5 339 B; card PDF offered |
| 8 | Finish | PASS | snapshot 620×400; Edit figure → live png |
| 9 | Duplicate / remove / undo | PASS | keeps 3.5 and group; Samples Displayed 24 on the copy = module reset (Team, `:1107-1111`); remove + Undo |
| 10 | Save and reopen | FAIL (undiagnosed) | a 90 s `waitFor` in the save step timed out; the page shows checkpoint "autosave" and the card drawn (`outlierPlot-r2-10-fail.png`); not reached: reopen and phone |
| 11 | Console | PASS | only the 400 of #4's deliberate −4 |

Module height: the module draws at 620×480/400 whatever the card height (`:1144-1154`), letterboxed in a tall card (Team behaviour; design note).

guided_qc_sample probe (`tests/dual-ui/chart-audit/probe_b02-guided.cjs`, `b02-qc-a/results-round2-guided-probe.json`,
`outlierPlot-r2-guided-probe.png`): the card schema carries `guided_qc_sample` (select, "Choose a sample (keyboard
accessible)", **25 options**, no group) and the Inspector shows it in the **Data** tab only. The probe found **0 native
`<option>`s** in the element it addressed (wave 2 renders long selects as a searchable picker), so it could not pick a
sample, and **whether choosing a sample changes outlierPlot is still not shown**. In the module the select only sets `guided_selected()` (`R/modules/2_qc_boxplot_module.R:1356-1360`), which feeds the
Guided-QC review/exclusion panel `guided_qc_selection` (`:1255-1262`), not the outlier plot's inputs: choosing a sample
is not expected to change outlierPlot (it opens the exclusion review). That is code reading; the browser pick remains open.

Auditor (Opus 5.5), round 2: OPEN – #3 png resize and #10 save wait (undiagnosed); guided_qc_sample pick not exercised in the browser

### qc_pca_tab-load2dVectorPlot · Round 2

Run 3 (script `9b2e308`) and run 6 (script `b9d9fae`, after the `.message` fix, `results-round2-boxplotAfterNorm_load2dVectorPlot.json`).

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS (after the user's action) | Team's refusal on arrival (422, `load2dVectorPlot-r2-1-refusal.png`); smartLabelLoad2D unticked → PATCH 200 → drawn (`-1-draws.png`) |
| 2 | Matches Team | PASS | Inspector pcaMode = `class`, the value the module itself sets (`R/modules/2_qc_boxplot_module.R:746-756`, Team behaviour, now expected by the script); **same 12 traces and x/y/z** as the module render; bare render `-2-api-bare.png` |
| 3 | Size | FAIL in run 3 → Nexo bug fixed | "overflow when larger" (`load2dVectorPlot-r2-3-fail.png`): the `.message` padding kept after the smart-label refusal, as pca2dVectorPlot; fixed `eaefa01`/`70edee9`; **run 6: PASS** 620×720→780×780→450×520→240×220→620×720 restored, layout 620×682→780×742→450×482→240×182 (`load2dVectorPlot-r2-3-larger.png`, `-smaller.png`, `-minimum.png`) |
| 4 | Data tab | PASS | 48 controls; **pcaMode class→omics redrew**; Loadings 2D Dot Size 8→12 redrew; Tab reaches the three controls; module actions present |
| 5 | Appearance | PASS | Base size 16, colour, plot_bgcolor, 6 palettes, Undo/Redo colours, Healthy N/A, legend Top Left, Reset |
| 6 | Statistics | N/A | |
| 7 | Export | PASS | PNG 668 846 B; SVG 59 551 B; Team PDF 11 245 B; card PDF offered |
| 8 | Finish | PASS | snapshot 780×742; Edit figure → live Plotly |
| 9 | Duplicate / remove / undo | FAIL (Team behaviour, open UX; same in run 6) | the duplicate is a new instance: on its first visit of PCA Loading Plots the module sets `pcaMode = class` (`2_qc_boxplot_module.R:746-756`) and the pcaMode observer turns `smartLabelLoad2D` back on (`:733-743`), so Team refuses the editable view (422 ×2, `load2dVectorPlot-r2-9-fail.png`: "Couldn't bring back … Try again"). Nexo sends the copied inputs; the module overrides them. Not fixed: re-sending the copy's inputs after the module settles would be a Nexo-beyond-Team change to decide; "Couldn't bring back" is also the wrong wording for a refusal whose remedy is known |
| 10 | Save and reopen | PASS | reopened with pcaMode omics, 12, label, background; phone 375×812: no sideways scroll, chrome ≥ 12 px |
| 11 | Console | PASS | 3 errors, all Team's smart-label 422 (arrival + the #9 duplicate) |

Auditor (Opus 5.5), round 2: OPEN – #9 duplicate refused (module turns smart labels back on: Team behaviour; Nexo UX decision needed)

### qc_pca_tab-load2dPlot · Round 2

Run 1 (script `0353408`; #4/#7 hit two script defects fixed in `9b2e308`).

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `load2dPlot-r2-1-draws.png`, `-1-zoomed-out.png` (41 %, frozen image) |
| 2 | Matches Team | PASS | Inspector pcaMode `class` = module-moved value (Team, `2_qc_boxplot_module.R:746-756`); **bytes identical** to the module's `/render` (620×720, sha256 9dd1c683c10e…, 141 994 B) |
| 3 | Size | FAIL (undiagnosed) | as pca2dPlot #3: node unchanged after the drag, last render 240×220 (`load2dPlot-r2-3-fail.png`) |
| 4 | Data tab | FAIL (script, fixed after the run) | crash in the dynamic-select probe (`sel.options` on a non-select); the control changes before it (pcaMode class→omics, sizes) are confirmed by #9/#10 values. Not re-run |
| 5 | Appearance | PASS | Label, card background, canvas Undo/Redo |
| 6 | Statistics | N/A | |
| 7 | Export | FAIL (script, fixed after the run) | SVG reason is now `aria-describedby` text, the script read only `title`; seen fixed on pca3dPlot/pca2dVectorPlot. Not re-run for this plot |
| 8 | Finish | PASS | snapshot 620×720; Edit figure → live png |
| 9 | Duplicate / remove / undo | PASS | duplicate keeps sizes 12/6, label, background; pcaMode `class` on the copy = module reset (Team, as above); remove + Undo |
| 10 | Save and reopen | PASS | reopened with pcaMode omics, 12, 6, label, background; **phone: no sideways scroll, chrome ≥ 12 px** (after the logo fix) |
| 11 | Console | PASS | 0 errors |

Crowding at 620×720: the card's bytes are the module's own render (#2), so the overlap of lipid labels is the module's
drawing at that size (**Team behaviour**; proposal for Max's module: fewer/repelled labels when narrow).

Auditor (Opus 5.5), round 2: OPEN – #3 png cards do not resize under the script's drag (undiagnosed); #4/#7 script crashes fixed but not re-run on this plot

### qc_pca_tab-boxplotAfterNorm · Round 2

Run 1 and run 6 (`b9d9fae`; run 3 was stopped by me at its #1).

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `boxplotAfterNorm-r2-1-draws.png` |
| 2 | Matches Team | PASS | bytes identical to the module's `/render` (620×720, sha256 7c052f91ea6a…, 29 204 B) |
| 3 | Size | FAIL (undiagnosed) | run 6: node 620×720 after the drag although the pointer hit `DIV.resize-handle`; last render request 240×220 (`boxplotAfterNorm-r2-3-fail.png`); see pca2dPlot #3 |
| 4 | Data tab | PASS (run 6) | 48 controls; Grouping Mode single→merged redrew; Tab reaches it; module actions present (Show Statistic Detail, Process Outlier Risks…, …) |
| 5 | Appearance | PASS | Label, card background, Undo/Redo |
| 6 | Statistics | N/A | |
| 7 | Export | PASS (run 6) | PNG 322 677 B; SVG disabled: "This figure is a raster image; SVG is not available."; Team PDF 5 769 B; card PDF offered |
| 8 | Finish | PASS | snapshot 620×720; Edit figure → live png |
| 9 | Duplicate / remove / undo | PASS | duplicate keeps Merged Samples, label, background; remove + Undo |
| 10 | Save and reopen | PASS | reopened merged, label, background; phone 375×812: no sideways scroll, chrome ≥ 12 px |
| 11 | Console | PASS | 0 errors |

Merged-view title crop: still **not compared** at the same size (it needs the merged view rendered by the API at the reopened card's size); not called Team behaviour.

Auditor (Opus 5.5), round 2: OPEN – #3 png resize (undiagnosed); merged-view title crop not compared

### Round 2 · batch table

| plot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | signature |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pca3dPlot | P | P | P | P | P (scene bg) | N/A | P (SVG reason) | P | P | P | P | AGREE |
| pca2dVectorPlot | P* | P | P (after fix) | P | P (Base size) | N/A | P (SVG) | P | P | P | P | AGREE |
| load2dVectorPlot | P* | P | P (after fix, run 6) | P | P | N/A | P | P | F (Team: module resets smart labels) | P | P | OPEN |
| pca2dPlot | P | P (bytes) | F (png resize) | P (+custom colours) | P | N/A | P | P | P | P | P | OPEN |
| boxplotAfterNorm | P | P (bytes) | F (png resize) | P | P | N/A | P | P | P | P | P | OPEN |
| load2dPlot | P | P (bytes) | F (png resize) | F (script, fixed, not re-run) | P | N/A | F (script, fixed, not re-run) | P | P | P | P | OPEN |
| outlierPlot | P | P (bytes) | F (png resize) | P | P | N/A | P | P | P | F (save wait, undiagnosed) | P | OPEN |

P* = draws after the user turns smart labels off (Team refuses the editable view with them on).

**Still open after round 2:** (1) png cards (boxplotAfterNorm, outlierPlot, pca2dPlot, load2dPlot) do not resize under the
audit's handle drag while Plotly cards do — undiagnosed, candidate in pca2dPlot #3; (2) load2dVectorPlot #9: a duplicate
is refused because the module turns smart labels back on for the new instance (Team behaviour at
`R/modules/2_qc_boxplot_module.R:733-756`); whether Nexo re-sends the copy's inputs after the module settles, and the
"Couldn't bring back" wording for a known refusal, need a decision; (3) guided_qc_sample: present in the Data tab, the
pick itself not exercised (wave-2 picker); (4) boxplotAfterNorm merged-view title crop not compared; (5) load2dPlot
#4/#7 not re-run after the script fixes; (6) module action buttons are present but pressing them was not exercised.

## Coordinator follow-up (2026-11-07): #3 png resize was a script false negative

Instrumented rerun on pca2dPlot (synthetic audit API, UI at e60d64da): every drag landed on `.resize-handle`, kept
pointer capture to `pointerup`, and resized the node 620x720 → 780x780 → 450x520 → 240x220 → 620x720. The FAIL came
from the restore step: 620x720 is a size the client already holds, so the image is drawn from Nexo's render cache with
no request, while `resized()` compared the image aspect with the last request on the wire (240x220) and waited until
the time box. `resized()` now compares with the card's own size (Nexo asks for exactly the node's width x height).
Rerun: pca2dPlot and boxplotAfterNorm #3 PASS, `AUDIT OK: 22 checks, 0 failed`
(`results-round2-pca2dPlot_boxplotAfterNorm.json`). No Nexo change; `canvas.ts` pointer capture is not implicated.
