# Chart audit · b12-cells (Team cell plots)

Auditor: Opus 5.5 (claude-b), first round. Protocol: `docs/integration/nexo-chart-audit-plan.md` checks 1–11 plus
check 12 "Layout". Script: `node tests/dual-ui/chart-audit/audit_b12-cells.cjs [outputName …]` (follows
`audit_b03-qc-b.cjs`; Chromium 1440×900, audit API 127.0.0.1:3962, checkpoint `nexo-complete-synthetic`; saves
`audit-b12-cells-synthetic` and deletes it). Raw results: `b12-cells/results-*.json`. Screenshots:
`b12-cells/<output>-<check>.png`.

**Status (first round, 2026-11-08):** all four plots audited; Auditor AGREE on all four. Fixed in Nexo: F1 (Legend
position on legend-less Team plots), F3 (Export dialog action row), F5 (invisible Download PNG label). Open: F2 (Team's identical CSV labels), F4 (API
500 on `canvas/validate` for a lost session, R), plus script tightening (see "Open").

| Plot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cell_lipid_plot | PASS | PASS | PASS | PASS | PASS (F1) | N/A | PASS (F5) | PASS | PASS | PASS | PASS | PASS (F3) |
| cell_profile_plot | PASS | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | PASS | PASS | PASS (F3) |
| cell_class_plot | PASS | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | PASS | PASS | PASS (F3) |
| cell_comparison_plot | PASS | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | PASS | PASS | PASS (F3) |

Setup note: port 5192 was held by a Vite not started by this task (left running); this run served the same config
on **5292** (`NEXO_AUDIT_PORT=5292 NEXO_AUDIT_API=http://127.0.0.1:3962`) and ran the script with
`NEXO_AUDIT_BASE=http://127.0.0.1:5292`.

Team's markup for this family is the Team canvas instance `team_cell_instance_ui`
(`R/frontends/team/plot_instances.R:25-36`): Metadata grouping, Reference, Comparison, Lipid class, Plot
(Class total / Feature), Feature within class, Measurement, Profile scale, the four plots and four CSV downloads.
The choices are filled server-side by Team's observers (`R/cell_show.R:73-77`). The catalog's `inputs` for all four
outputs are exactly these eight controls (`GET /catalog`, `allowedInputs` = the same eight, `defaults`
`cell_explore_level=feature`, `cell_profile_view=share`).

Layout sweep (mock, check 12):
`NEXO_PLOTLY_JS=$PWD/frontends/nexo/public/vendor/plotly.min.js NEXO_SWEEP_ONLY=cell_lipid_plot,cell_profile_plot,cell_class_plot,cell_comparison_plot node tests/dual-ui/test_nexo_layout_sweep.cjs`
(the mock catalog ids have no `team_cell-` prefix: with the prefixed names the sweep selects 0 sources), last lines:

```
PASS chromium:1024x768 cell_class_plot
PASS chromium:1024x768 cell_comparison_plot
PASS chromium:390x844 phone
SUMMARY offenders=0 sources=4 engines=chromium
exit 0
```

## cell_lipid_plot · Selected feature profile (plotly)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Draft 100 % and zoomed out (frozen tier image): `b12-cells/cell_lipid_plot-1-draws.png`, `b12-cells/cell_lipid_plot-1-zoomed-out.png`. 24 measurements, the selected one (S01) in Team's orange |
| 2 | Matches Team | PASS | Same 2 `scatter` traces (Selected FALSE/TRUE) as the module's own `POST …/cards/<instance>/render`; no title, as Team (`R/cell_show.R:82`) |
| 3 | Size | PASS | 620→780→390 px wide, redrawn each time, nothing overflows: `b12-cells/cell_lipid_plot-3-larger.png`, `b12-cells/cell_lipid_plot-3-smaller.png` |
| 4 | Data tab | PASS | All 8 controls of Team's instance markup present (selects with the module's computed choices: 4 groupings, Control/Treatment, 9 classes, the class's features; Measurement as the searchable picker "24 of 24"). Feature within class → `Cer(d18:1/22:0)` redrew (`b12-cells/cell_lipid_plot-4-data-changed.png`). No free numeric value to refuse (selects/radios only) |
| 5 | Appearance | PASS (after fix F1) | Label, card background, Plot title on the plot, Base size 16 and colour #aa0000 on the plot, plot background, 6 palettes → 6 distinct colourings, Healthy in grey, legend Top Left (x=0), grid toggle, orientation enabled (cartesian), Undo/Redo, Reset. Before F1 the Legend position did nothing (Team hides this plot's legend). `b12-cells/cell_lipid_plot-5-appearance.png` |
| 6 | Statistics | N/A | Team has none for cell plots ("No significance test is calculated", `R/cell_show.R:105`); tab says "Statistics are available for independent violin copies." |
| 7 | Export | PASS (notes) | Card PNG 129 KB, card PDF 100 KB (valid). Team downloads: four CSVs, all non-empty — `Cer_d18_1_22_0_-prepared-values.csv` 4.3 KB, `lipid-class-profile.csv` 1.7 KB, `lipid-class-comparison.csv` 7.4 KB, `cell-comparison-Cer_d18_1_22_0_.csv` 6.0 KB. Notes: the four buttons are all labelled "Download CSV" (Team's own instance labels, F2); SVG was read while the tab was busy after the PNG (script read `disabled`); the screenshot shows Download SVG enabled. Export dialog layout: F3. `b12-cells/cell_lipid_plot-7-export-dialog.png` |
| 8 | Finish | PASS | Snapshot 423×460 in a 421×460 body; Edit figure → live plotly: `b12-cells/cell_lipid_plot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate (header chrome) keeps label and `cell_lipid=Cer(d18:1/22:0)`; remove + Undo brings it back drawn: `b12-cells/cell_lipid_plot-9-duplicate.png` |
| 10 | Save and reopen | PASS | Saved `audit-b12-cells-synthetic`, reopened in a new page: label, `cell_lipid`, background kept (`b12-cells/cell_lipid_plot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors (final run) |
| 12 | Layout | PASS | 0 spill / overlap / escape offenders over every Inspector tab with all sections open, and the card header, at 1440×900 and 1024×768: `b12-cells/cell_lipid_plot-12-data-1440.png`, `b12-cells/cell_lipid_plot-12-data-1024.png`. Mock sweep PASS (above) |

Auditor (Opus 5.5): AGREE

Adversary (Astra): —

## cell_profile_plot · Class profile (plotly)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `b12-cells/cell_profile_plot-1-draws.png`, `b12-cells/cell_profile_plot-1-zoomed-out.png` (frozen tier image): 9 class bars for measurement S01 |
| 2 | Matches Team | PASS | Same single horizontal `bar` trace as the module render; axis "Share of prepared signal (%)", classes PE…LPE as Team (`R/cell_show.R:86`). Team's bars carry `text` without `textposition`, so Plotly prints "PE: 17.45% / Prepared signal: 218080" inside the bars — Team's own drawing, kept |
| 3 | Size | PASS (note) | 620→780→390 px, redrawn: `b12-cells/cell_profile_plot-3-larger.png`; `-3-smaller.png` was taken at 92 % while the card still showed a transient "Loading figure…" (same on cell_lipid_plot); the small card is drawn in `b12-cells/cell_profile_plot-4-data-changed.png` |
| 4 | Data tab | PASS (note) | 8 Team controls present. Profile scale → "Log10 class signal": the card redraws with "Log10 summed prepared signal" (seen in `b12-cells/cell_profile_plot-9-duplicate.png` and `-10-reopened.png`); `-4-data-changed.png` was captured before the log render arrived (it still shows the % axis with the radio on Log10) — the script's redraw test was satisfied by the earlier size render; to tighten in round 2. No numeric input to refuse |
| 5 | Appearance | PASS | Plot title, Base size 16, colour, plot background, 6 palettes → 6 colourings, Healthy in grey, legend Top Left (x=0, with F1), grid, Undo/Redo, Reset: `b12-cells/cell_profile_plot-5-appearance.png` |
| 6 | Statistics | N/A | Team has none for this plot |
| 7 | Export | PASS | Card PNG 214 KB, PDF 114 KB; Team's four CSVs non-empty (same files as cell_lipid_plot, `Cer_d18_1_16_0_` names); labels F2; dialog F3: `b12-cells/cell_profile_plot-7-export-dialog.png` |
| 8 | Finish | PASS | `b12-cells/cell_profile_plot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps `cell_profile_view=log`: `b12-cells/cell_profile_plot-9-duplicate.png` |
| 10 | Save and reopen | PASS | Reopened: label, `cell_profile_view=log` (log axis drawn), background kept: `b12-cells/cell_profile_plot-10-reopened.png`; checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders, every tab and section, 1440×900 and 1024×768: `b12-cells/cell_profile_plot-12-data-1440.png`, `-12-data-1024.png` |

Presentation note for the designer: the in-bar text labels (Team's) crowd the bars at 390 px; Nexo could offer
"hide bar labels" (`textposition: none`) as a presentation option.

Auditor (Opus 5.5): AGREE

Adversary (Astra): —

## cell_class_plot · Class totals · two cohorts (plotly)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `b12-cells/cell_class_plot-1-draws.png` (grouped Reference/Comparison bars, legend, Team's two-line title), `b12-cells/cell_class_plot-1-zoomed-out.png` (frozen tier image) |
| 2 | Matches Team | PASS | Same 2 `bar` traces (Reference, Comparison) as the module render; title "Prepared class totals<br>Descriptive comparison · no spatial inference" (size 12), Team colours #176b73/#c55432 (`R/cell_show.R:103`) |
| 3 | Size | PASS | 620→780→390 px, redrawn: `b12-cells/cell_class_plot-3-larger.png`, `b12-cells/cell_class_plot-3-smaller.png` |
| 4 | Data tab | PASS | 8 Team controls present. Reference → Treatment then Comparison → Control (the cohorts swapped) redrew; the final state is drawn with Treatment as Reference (teal, PI ≈ 400k) in `b12-cells/cell_class_plot-10-reopened.png`. `-4-data-changed.png` shows the intermediate render Treatment vs Treatment (one series): Team's class plot does not refuse two equal cohorts — it draws only the "Reference" series (`R/cell_show.R:101-103`, no `validate()` for equal groups, unlike the comparison plot at `:106`); Team behaviour, recorded |
| 5 | Appearance | PASS | Plot title, Base size 16, colour, plot background, 6 palettes → 6 colourings, Healthy in grey, legend Top Left (x=0), grid, Undo/Redo, Reset → Team title back: `b12-cells/cell_class_plot-5-appearance.png` |
| 6 | Statistics | N/A | Team has none ("Descriptive comparison") |
| 7 | Export | PASS | Card PNG 117 KB, PDF 77 KB; Team's four CSVs non-empty (`lipid-class-comparison.csv` holds this plot's per-sample class totals); labels F2; dialog F3: `b12-cells/cell_class_plot-7-export-dialog.png` |
| 8 | Finish | PASS | `b12-cells/cell_class_plot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps `cell_reference_group=Treatment`: `b12-cells/cell_class_plot-9-duplicate.png` |
| 10 | Save and reopen | PASS | Reopened with Reference Treatment / Comparison Control, label and background kept: `b12-cells/cell_class_plot-10-reopened.png`; checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders, every tab and section, 1440×900 and 1024×768: `b12-cells/cell_class_plot-12-data-1440.png`, `-12-data-1024.png` |

Note: in Team a click on a class bar selects that class (`R/cell_show.R:104`, `plotly_click`); in Nexo the class is
chosen with the "Lipid class" select (the same input). Not a missing control.

Auditor (Opus 5.5): AGREE

Adversary (Astra): —

## cell_comparison_plot · Cohort comparison (plotly)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `b12-cells/cell_comparison_plot-1-draws.png`, `b12-cells/cell_comparison_plot-1-zoomed-out.png` (frozen tier image): Reference / Comparison violins with points and inner box (n ≥ 8 per group, so Team's violin branch) |
| 2 | Matches Team | PASS (note) | Same 2 `violin` traces as the module render; Team's two-line title "Prepared signal · violin + points<br>Click a point for its single-measurement profile · descriptive comparison" (`R/cell_show.R:106`). At the default 620 px it fits; once the card is narrower than ≈ 430 px the second title line is cut at both sides ("lick a point … compariso", `b12-cells/cell_comparison_plot-4-data-changed.png`, `-10-reopened.png`) — Team's own long, non-wrapping title; presentation note for the designer |
| 3 | Size | PASS (Team module clips below ≈ 430 px — the second title line is cut at both sides, whole at 620 px; same figure as Team) | 620→780→390 px, redrawn: `b12-cells/cell_comparison_plot-3-larger.png`, `b12-cells/cell_comparison_plot-3-smaller.png` |
| 4 | Data tab | PASS | 8 Team controls present. Plot → "Class total" redrew with CER class totals (40k–90k; `b12-cells/cell_comparison_plot-10-reopened.png`; Team CSV #4 became `cell-comparison-CER_class_total.csv`). `-4-data-changed.png` was captured while the card said "Updating…" (feature values still shown). Invalid combination — Comparison = Control, same as Reference — refused: API 422, card in error state with Team's own message "Choose two different groups. Select two metadata groups with available prepared values." and a "Data & settings" link; the previous inputs restored the plot (`b12-cells/cell_comparison_plot-4-data-invalid.png`) |
| 5 | Appearance | PASS | Plot title, Base size 16, colour, plot background, 6 palettes → 6 distinct colourings (palette on violin fill/line; points stay black by design, `frontends/nexo/src/editor/applyEditor.ts:129`), Healthy in grey, legend Top Left (x=0, with F1), grid, Undo/Redo, Reset → Team title: `b12-cells/cell_comparison_plot-5-appearance.png`. The first full run reported "palettes do not change the plot": the script read only `marker.color` (script fix `98dd1c1d`, rerun PASS) |
| 6 | Statistics | N/A | Team computes no test here ("No significance test is calculated in this 3D companion", `R/cell_show.R:105`); tab says "Statistics are available for independent violin copies." |
| 7 | Export | PASS | Card PNG 180 KB, PDF 127 KB; Team's four CSVs non-empty; labels F2; dialog F3: `b12-cells/cell_comparison_plot-7-export-dialog.png` |
| 8 | Finish | PASS | `b12-cells/cell_comparison_plot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps `cell_explore_level=class`: `b12-cells/cell_comparison_plot-9-duplicate.png` |
| 10 | Save and reopen | PASS | Reopened with Class total drawn, label and background kept: `b12-cells/cell_comparison_plot-10-reopened.png`; checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors (the 422 is the intended refusal of equal cohorts) |
| 12 | Layout | PASS | 0 offenders, every tab and section, 1440×900 and 1024×768: `b12-cells/cell_comparison_plot-12-data-1440.png`, `-12-data-1024.png` |

Note: Team's title asks the user to "Click a point for its single-measurement profile" (`plotly_click` → `cell_sample`,
`R/cell_show.R:108`); in Nexo a click on a point does nothing, and the measurement is chosen with the Measurement
picker (same input). The instruction in Team's title is therefore misleading inside Nexo — recorded for the designer
/ catalog owner, not changed (the title is Team's).

Auditor (Opus 5.5): AGREE

Adversary (Astra): —

## Findings

- **F1 (Nexo bug, fixed):** the Appearance → Legend → Legend position grid wrote `legend.x/y/anchors` only. Team hides
  the legend of three of these plots (`showlegend=FALSE`, `R/cell_show.R:82`, `:86`, `:106`), so a click changed
  nothing on the plot (`legend position not applied`; the same defect was left OPEN on guided_qc_plot in b03). A
  position now also sets `showlegend: true` (`legendPositionPatch`, `frontends/nexo/src/ui/PlotEditor/legendPresets.ts`),
  as the legend presets already did. Red `6a777e8e` (`TypeError: legendPositionPatch is not a function`,
  `Tests 1 failed | 2 passed (3)`), green `e76e65a1` (`Tests 3 passed (3)`; full vitest `Test Files 100 passed (100)`,
  `Tests 462 passed (462)`; `tsc --noEmit` clean; mock `test_nexo_inspector.cjs` 40 PASS / 0 FAIL "H3 OK",
  `test_nexo_card_chrome.cjs` 29 PASS / 0 FAIL "H6-0 OK").
- **F2 (Team behaviour, recorded):** "More downloads from this analysis" shows four identical "Download CSV" buttons
  for every cell plot. Nexo shows the API's labels; Team's canvas instance labels all four that way
  (`R/frontends/team/plot_instances.R:35`), while Team's guided 3D Show page names them "Download feature values",
  "Download profile CSV", "Download displayed values", "Download class comparison CSV" (`R/cell_show.R:18-19`, `:44`).
  Proposal (catalog owner / designer): give the instance buttons the guided page's labels. Not changed here
  (`R/frontends/team` is off-limits).
- **F3 (Nexo layout, fixed):** Export dialog (More export options…) at 1440×900 and 1024×768: the footer row
  Download PNG / SVG / PDF / Plot data (CSV) / "Preview export at 300 DPI…" did not wrap and ran out of the 560 px
  dialog — the last button was cut to "Pre" with no tooltip (`b12-cells/cell_lipid_plot-7-export-dialog.png`, taken
  before the fix). The layout sweep now opens each card's Export dialog and checks it (spill / overlap / escape).
  Red `92b534d4` (`SUMMARY offenders=16 sources=4`: `export-dialog spill …footer.export-actions` and `escape
  …button "Preview export at 300 DPI…"` for all four plots at both sizes), green `5af0dfc8`
  (`.export-actions{…;flex-wrap:wrap}`, `frontends/nexo/src/ui/shell.css:90`; sweep `SUMMARY offenders=0 sources=4`;
  vitest `Tests 462 passed (462)`; `tsc --noEmit` clean; mock `test_nexo_inspector.cjs` 40 PASS / 0 FAIL "H3 OK",
  `test_nexo_card_chrome.cjs` 29 PASS / 0 FAIL "H6-0 OK"). After: `b12-cells/cell_lipid_plot-7-export-dialog-fixed.png`
  (real API; every action button inside the dialog).
- **F5 (Nexo bug, fixed):** in the same dialog the primary **Download PNG** button had an invisible label at rest
  (computed `color` and `background-color` both rgb(255, 255, 255)). Root cause: the dialog is mounted inside
  `#inspector [role=tabpanel]`, whose button rule (ID specificity, `frontends/nexo/src/ui/shell.css`) set
  `background: var(--paper)` over `dialog button.primary`, which keeps `color: var(--paper)`. The Inspector rule now
  excludes dialog buttons (`:not(dialog button)`). The sweep checks that no Export-dialog button draws its label in
  its own background colour. Red `3a5da9ff` (`export-dialog invisible-label dialog.export-dialog button.primary
  "Download PNG"` at 1440×900 and 1024×768, `SUMMARY offenders=2 sources=1`), green `a07f3ef8` (sweep
  `SUMMARY offenders=0 sources=4`; vitest `Tests 462 passed (462)`; `tsc --noEmit` clean; mock inspector 40/0 "H3 OK",
  card chrome 29/0 "H6-0 OK"); real API after the fix: background rgb(35, 82, 115), text white
  (`b12-cells/cell_lipid_plot-7-export-dialog-fixed.png`).
- **F4 (API, open — R, for the coordinator):** after another auditor evicted this task's session (`409` on
  `…/downloads` and `POST …/cards`), Nexo's autosave called `POST /api/v1/sessions/<id>/canvas/validate` about
  every 5 s and each call answered **500** `{"error":"500 - Internal server error"}` (plumber's default handler,
  not the API's JSON error) — ≈ 80 calls in 6 minutes, no message to the user. Reproduced directly:
  `curl -X POST -H 'Content-Type: application/json' -d '{"token":"t","state":{}}' http://127.0.0.1:3962/api/v1/sessions/nosuch999/canvas/validate`
  → 500, while `GET …/sessions/nosuch999/canvas` and `POST …/sessions/nosuch999/cards` → 404 "Unknown session."
  (`R/frontends/api/plumber.R:110-114`). Expected 404/409 `session_lost`, and Nexo's validate loop should stop
  and tell the user to reopen. Root cause not located in this round (R cannot run on the M1); no R change made.
- Note: Team's guided 3D Show page also has an "Explore another lipid" action (`R/cell_show.R:44`); Team's canvas
  instance markup has none (`plot_instances.R:25-36`), and neither does the Nexo Data tab. Not a gap against the
  canvas markup; recorded for the catalog owner.

## Fixes in this round

| Finding | Red | Green | Where |
|---|---|---|---|
| F1 Legend position does nothing when Team hides the legend | `6a777e8e` | `e76e65a1` | `frontends/nexo/src/ui/PlotEditor/legendPresets.ts`, `Legend.tsx` |
| F3 Export dialog action row runs out of the dialog | `92b534d4` | `5af0dfc8` | `tests/dual-ui/test_nexo_layout_sweep.cjs` (check), `frontends/nexo/src/ui/shell.css:90` |
| F5 Export dialog primary Download PNG label invisible | `3a5da9ff` | `a07f3ef8` | sweep check, `frontends/nexo/src/ui/shell.css` (Inspector button rule) |

## Open (round 2)

1. F2 — four identical "Download CSV" labels (Team instance markup `R/frontends/team/plot_instances.R:35`): catalog
   owner to adopt the guided page's names.
2. F4 — `POST …/canvas/validate` 500 for a lost/unknown session and Nexo's silent retry loop (R API + Nexo).
3. Full mock sweep (all 59 sources) was run after F3 and before F5: `SUMMARY offenders=2 sources=59` — both offenders
   are `pathway_tab-pathwayVisNetwork` console `404 …/nexo/vendor/vis-network.min.js` (this M1's
   `public/vendor` has no `vis-network.min.js`; environment, not this batch); no layout or Export-dialog offender
   on any source. Not re-run after F5 in the time limit (F5 sweep run on the four cell sources only).
4. Script tightening: #4 screenshots must wait for the change's own render (profile Log10, comparison Class total
   were captured before it; the redraws are proven by #9/#10); #3 "smaller" captures can show a transient
   "Loading figure…" at 92 %; the Inspector SVG button was read while busy (script reported "SVG disabled").

## Run log

- 23:47 setup; 5192 held by another server → own Vite on 5292 (PID started by this task, stopped at the end).
- First run (cell_lipid_plot): script artefacts (render path, "Base size", duplicated CSV labels, stale inspector
  after reopen) fixed in the script; a second run lost its session to the other auditor (409, then the F4 500 loop);
  a third run was interrupted by the HMR reload of the F1 fix and stopped (own PID).
- 00:04–00:11 full run, all four plots: 47 checks PASS/N/A, 1 FAIL (comparison #5, script artefact) —
  `b12-cells/results-all.json`. Rerun of cell_comparison_plot after the script fix: `AUDIT OK: 12 checks, 0 failed`
  — `b12-cells/results-cell_comparison_plot.json`.
- Every saved `audit-b12-cells-synthetic` was deleted (200) at the end of its plot.

Astra review 2026-11-08: `cell_comparison_plot` check 3 now reads "PASS (Team module clips below ≈ 430 px …; same figure as Team)" (Team's non-wrapping two-line title). Separately, the click bridge the review found missing (`cell_class_plot` / `cell_comparison_plot` #4) is implemented: a click on a class bar / measurement point reaches Team's observer through `POST …/cards/<id>/events` (commits `084168da`, `8ea7f408`, `febbb97a`; mock check `tests/dual-ui/test_nexo_plotly_click.cjs` green, R test `tests/dual-ui/test_api_plotly_click.R` part 2 for the coordinator). Those rows are not re-graded here: a live re-run of #4 decides them.
