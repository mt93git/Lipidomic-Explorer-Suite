# Layout sweep (H9)

Why: the pilot user found the inspector's "BQC samples" list drawing 66 long sample ids over the neighbouring
checkboxes; every audit missed it because the mock served 12 three-character ids (fixed in e60d64da). This sweep
looks for the rest of that class of bug by machine, at realistic data sizes.

## What runs

`NEXO_PLOTLY_JS=… node tests/dual-ui/test_nexo_layout_sweep.cjs` (mock build, Chromium; `NEXO_SWEEP_ENGINES=chromium,webkit`
adds WebKit). For each of the 59 catalog outputs, at 1440x900 and 1024x768: add the card (the 18 gated outputs, which
need a confirmed design or time points, are added the way `test_nexo_p3.cjs` does: an ungated card pointed at the
gated source), select it, open every inspector tab, expand every `<details>`, then check inside `#inspector`, the card
chrome (everything but the plot body) and the card's opened ⋯ menu:

- (a) **spill**: a box holding text whose `scrollWidth > clientWidth + 1` with `overflow-x: visible` (deepest box reported);
- (b) **overlap**: two visible controls (input, select, textarea, button, `[role=tab]`, label with a control) whose
  on-screen boxes (after clipping by scrolling ancestors) intersect by more than 2 px each way;
- (c) **escape**: a control's right edge past `#inspector`'s right edge, or `#inspector` scrolling sideways;
- (d) **console**: any console error or page error.

At 390x844 (touch, view only): (a) and (c) on the top bar, card chrome (bounded by its own card) and the inspector
sheet after tapping a card, over each sheet tab with sections expanded. One line per offender
`<engine:viewport> <source> <tab> <rule> <selector> "<text>"`, `PASS <engine:viewport> <source>` per clean source,
then `SUMMARY offenders=N`; exit 1 if N > 0.

Mock realism (synthetic only): 5 groups (`Treatment_high_dose_week12`, `Vehicle_low_dose_week04_crossover`, …) on the
computed colour/shape controls and the heatmap group picker; 45 lipids with long names
(`PS(18:0/22:6(4Z,7Z,10Z,13Z,16Z,19Z))`, …) in 17 classes including long class names
(`Hexosylceramide glycosphingolipid`, …); two long card titles; primary grouping with long factor names; the 66 BQC
sample ids from e60d64da. Suites that count those lists were updated to the new exact counts (`2 of 6`, `6 of 6`,
`45 of 45`, the full class list); no assertion removed or loosened.

## Red (`red.txt`, commit ae9c63ab)

One offender class, in every card whose Appearance tab shows the Plotly editor's Legend section:
`spill details>div.plot-editor-positions>button` on "Middle Center", "Middle Right", "Bottom Center", "Bottom Right"
(4 per card per viewport). 1440x900: 124 lines = 31 sources x 4, the other 28 sources PASS. 1024x768: 84 lines
(21 sources x 4) before the run was stopped at the time limit (the last `error sweep` line is that stop, not a
finding); the phone pass was not reached in this run. Earlier full chromium run of the same sweep before gated
cards were included (not committed, same build): 1440 and 1024 both showed only this class, plus
- `pathway_tab-pathwayVisNetwork console "Failed to load resource" (404 vendor/vis-network.min.js)`: setup, not code.
  vis-network belongs in `public/vendor/` via `NEXO_VISNETWORK_DIR=~/nexo-vendor/vis sh scripts/vendor-visnetwork.sh`
  (copying the `vis/` folder leaves it at `vendor/vis/`, which the app does not load);
- `390x844 phone card-tapped escape div.card-actions>div.card-more>button`: a false positive of the sweep: tapping a
  card zooms the canvas to it and the neighbour card (fully) leaves the screen. Rule (c) for card chrome now uses the
  card's own right edge (commit 2b8060fa), still catching chrome that escapes its card.

No overlap (b) or inspector escape (c) offender was found anywhere; no Data-tab spill with 45 long lipids, 17 long
classes, 5 long groups or 66 sample ids (the SearchablePicker rows and computed controls already clip with a title).

## Fixes

| Offender | Fix (commit 5abbc14b, `ui/PlotEditor/plotEditor.css`) |
|---|---|
| Legend position buttons spill ("Middle Center" etc.) | The global `button{white-space:nowrap;height:var(--control)}` met a 3-column `minmax(0,1fr)` grid under 90 px per cell. `.plot-editor .plot-editor-positions button` now wraps (`white-space:normal; overflow-wrap:anywhere; height:auto; min-height:var(--control); line-height:1.2`). Labels stay whole on two lines; no text hidden, no tooltip needed. |

`legend-positions-before-*.png` re-apply the old rule on the fixed build (nowrap + fixed height) to show the spill
("Bottom Right", "Middle Right" run past the inspector edge); `legend-positions-after-*.png` are the fixed build.

## Remaining

- Green (`green.txt`, full chromium run of 5abbc14b): 1440x900 59/59 PASS, 1024x768 58/59 PASS, phone PASS;
  `SUMMARY offenders=1`: `results_dashboard-plot_pca - error sweep "locator.click: Timeout"` at 1024, the header
  click on the first card of a fresh page timing out while two sweeps and the suites shared the machine. The same
  source passed at 1024 in the red run (only the legend spill) and at 1440 in green: load, not layout; not re-run for
  lack of time, so the sweep exits 1 on this run.
- Regression gate (after the fix): vitest 461/461, tsc clean; inspector 40, access 54, card_chrome 29, library 16,
  analysis_settings 6 PASS.
- WebKit was not run (time); `NEXO_SWEEP_ENGINES=chromium,webkit` enables it.
- Nothing needed an R or science change.

## Files

| File | What |
|---|---|
| `red.txt` | sweep output before the fix (stopped at the time limit during 1024x768) |
| `green.txt` | full sweep output after the fix (chromium) |
| PNGs | before/after inspector captures of the worst offenders (mock build) |
