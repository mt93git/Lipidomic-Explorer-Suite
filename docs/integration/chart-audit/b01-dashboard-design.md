# Chart audit · b01-dashboard · design (Fable 5.1)

Designer: Fable 5.1 (claude-b), Chromium 1440×900 @2x, Vite :5281 → design API 127.0.0.1:3962, checkpoint
`nexo-complete-synthetic` (synthetic data only). Captures: `node tests/dual-ui/chart-audit/design_b01-dashboard.cjs before|nexo [plots] [width]`,
screenshots in `docs/integration/chart-audit/b01-dashboard-design/` (`<plot>-before-*.png` = Team original, `<plot>-nexo-*.png` = Nexo preset).
Scope per the plan ("What design may change"): presentation only, in Nexo only; the science, Team's modules and
Team's plot as Team draws it are untouched and one click away.

## What was built for the batch (commit 1899dc4)

**Presets in Appearance.** The toolbar of the Appearance tab now has a `Preset` group with three buttons, the active one
pressed: **Team original** (editor empty, Team's plot exactly as Team draws it), **Nexo**, **Publication** (the
former "Publication style" button). Each is one click, Undo restores the previous state, and custom tweaks on top of a
preset leave no button pressed (honest state). `editor/applyEditor.ts: nexoEditor, presetOf`.

**The Nexo preset** (`nexoEditor`) uses only keys of the cosmetic allow-list that Team's `canvas_state.R` accepts, so a
checkpoint with it reopens in Team without failing validation:

| Aspect | Team original (as received) | Nexo |
|---|---|---|
| Font | Inter stack, 12 px, grey `#52514e` | `system-ui` (the card chrome's family on every OS), 12 px, ink `#141b24` (contrast 15:1) |
| Titles | 12 px grey | plot title 15 px navy; axis titles 12 px; ticks 11 px |
| Axes | no axis line (PCA, bars) or a black mirrored box (violin) | hairline (1 px) axis lines, zero lines off |
| Grid | `#ebeae6` / dotted `#dddddd` | light `#e3e7ec` (the chrome's `--line`), 1 px, kept only where Team had it on numeric axes; off on category axes |
| Palette | Gelato Days (pastel; pink on white ≈ 1.3:1) | Okabe–Ito (colour-blind safe), Healthy in grey |
| Legend | horizontal, left, under the plot | horizontal, centred under the plot; untouched when Team hides it |
| Backgrounds | white | white |

Per-class colours that are not study conditions (Composition overview's lipid classes) are left as Team sends them,
because `applyEditor` only recolours series named in `layout.meta.teamConditions`. The preset never changes data,
ranges, statistics or hover text.

Tests: `src/editor/applyEditor.test.ts` ("Nexo preset": allow-list round trip, palette and legend, hidden legend and
class colours untouched, user edits kept and stale colour patches dropped, `presetOf`, reset to the baseline);
`src/editor/PlotEditor.test.ts` (the three preset buttons render in the toolbar).

## Plot by plot

### results_dashboard-plot_pca · Principal components (Plotly scatter)

Before: `pca-before-card-100.png`, `pca-before-zoomed-out.png`, `pca-before-card-large.png`, `pca-before-inspector-*.png`.
After: `pca-nexo-*.png`.

Critique (as Paula sees it):
- Pastel markers (Gelato Days) on white: the Treatment pink is ~1.3:1 against the background; at 41 % zoom the
  points almost disappear (`pca-before-zoomed-out.png`).
- No axis lines; the plot floats. The legend sits left-aligned 100 px under the x-axis title, leaving a dead band.
- Hierarchy is flat: axis titles, ticks and legend are the same grey.

Implemented (Nexo preset): Okabe–Ito markers (orange `#E69F00` 2.25:1 and sky blue `#56B4E9` 2.31:1 against white —
below the 3:1 target for graphical objects; the Gelato pastels were 1.41:1 pink `#FFCBE1` and 1.48:1 blue `#BCD8EC`), hairline axes, ink text, centred
legend. What the change achieves: about 1.6× the contrast of the pastels, so the points stay visible when zoomed out,
but not the 3:1 the earlier text claimed; the two groups differ by hue (orange vs blue luminance ratio 1.03:1), and
Okabe–Ito is kept because those hues stay distinguishable under the common colour-vision deficiencies. A darker pair
(e.g. Okabe–Ito `#D55E00` / `#0072B2`) would pass 3:1 and is a designer decision, not taken here. Points keep Team's 11 px size and white halo. See `pca-nexo-card-100.png` and `pca-nexo-zoomed-out.png`.

Proposed, not implemented (needs margin keys outside the allow-list or Max's module): `margin.b` 100 → 70 so the
legend sits closer to the x-axis title; alternatively legend top-right inside the plot when the point cloud leaves
that corner free.

### results_dashboard-plot_violin · Feature distributions (Plotly violin)

Critique:
- Team's black mirrored frame (`mirror: true`, `linecolor: #000`) boxes the plot in and is the darkest thing on the
  card, heavier than the data.
- The caption annotation ("Dots: prepared sample values…") is 10 px and sits under the x-axis title with no
  hierarchy; at 390 px it is below the 12 px floor.
- Inner box fills (grey-blue, dusty pink) are Team's own derived tints; with any palette switch the violin recolours
  but the inner box keeps the old tint (visible in `violin-nexo-card-100.png`: an orange violin with a grey-blue box).

Implemented (Nexo preset): Okabe–Ito violins, hairline axes, light horizontal grid, no vertical grid lines through the
violins (category axis, commit ff12002). The mirrored frame remains because `mirror`/`linecolor` are not in the
allow-list.

Implemented (`applyEditor`, every palette): a violin's inner box now follows the palette colour (fill
`darker(c, .15)`, line `darker(c, .60)`, the rule already used for `teamRole: inner-box` traces) instead of keeping
Team's tint from the previous hue; a box without its own colours is left alone, and Team original restores Team's
tints. Test "tints a violin inner box from the palette colour" in `applyEditor.test.ts`.

Proposed for Max: caption font 11–12 px and `mirror: false` with a `#cfd6de` axis line in the module's canvas variant.

### results_dashboard-plot_dist · Signal distribution (Plotly box per sample)

Critique: in Nexo the card draws empty axes (`dist-before-card-100.png`): y from −1 to 4, x ticks "#1 #4 #6" only.
The figure's 24 box traces arrive packed (`x: {teamRepeat}`, `y: {teamFloat64}`), the format Team unpacks in
`www/team/js/plot_payload.js`; Nexo has no unpacker, so Plotly receives no arrays. This is a functional defect, listed
under "Seen, not mine". Presentation could not be judged on data; the Nexo preset applies to the axes (hairline,
ink text, centred legend) and will apply to the boxes once they draw. The 300 px card height with a 100 px bottom
margin leaves the plot area ~190 px tall; after the fix, the card default height should be ≥ 420 px for 24 boxes.

### results_dashboard-plot_comp · Composition overview (Plotly stacked bars)

Critique:
- Every segment carries its hover text as an inside label (`text` with Plotly's default `textposition: auto`), so
  thin segments show 3–5 px unreadable smudges (`comp-before-card-100.png`), and the enlarged card shows five lines
  of text in each big segment. The classes have no legend (`showlegend: false`) and no colour key.
- The 100 px bottom margin is reserved for a legend that is hidden: a dead band under "Condition / cell type".

Implemented (Nexo preset): hairline axes, ink text, grid kept on the % axis only. Class colours untouched
(they are not study conditions). The inside labels cannot be changed from the allow-list (`uniformtext`,
`textposition` are not cosmetic keys).

Proposed for Max (module): `textposition: "none"` (hover already carries the text) or `uniformtext: {mode: "hide",
minsize: 11}`; `margin.b` 60 when the legend is hidden; optionally a class legend on the right.

### results_dashboard-plot_heat · Abundance heatmap (Plotly heatmap)

Critique:
- The card is 1000×1100 px by default, taller than a 900 px viewport at 100 %; at 41 % it reads fine.
- Row labels: Team sends 22 tick labels for 30 rows, so 8 rows are unlabelled with irregular gaps
  (`heat-before-card-100.png`); 10 px tick font.
- The blue–white–red scale with `zmin/zmax ±1` is science (left alone); the colour bar at half height top-right is
  fine.

Implemented (Nexo preset): ink text, hairline axes, no grid (heatmap covers the plot area). The heat scale stays
editable per trace in Series → Heatmap scale as before.

Proposed for Max: send one tick label per row (or `tickmode: auto` with `nticks` = rows) and 11 px tick font; the
default card height closer to 820 px so the heatmap fits a laptop viewport at 100 %.

## Inspector (Appearance tab) for all five

- Before: the toolbar read `Undo Redo Publication style Reset presentation Change orientation`, so "Publication
  style" looked like an action, not a state, and there was no way back to Team's look except Reset (with a confirm).
- After: `Preset: Team original · Nexo · Publication` as a pressed-state group under the actions; Reset keeps its
  confirm. All buttons remain keyboard reachable (native buttons, visible focus ring from `plotEditor.css`).
- Section order (Color palette, Title and fonts, Chart background, axes, Grid, Legend, Conditions, Series,
  Annotations) unchanged, so Opus's check 5 still finds every control.

## Open questions for Gerardo

1. **Should Nexo be the default preset for new cards?** Recommendation: not during the audit (check 2 "matches
   Team" compares against Team's output), then yes, in one place (`AppearanceTab` initial editor = `nexoEditor`) once
   the audit closes, so every new card starts in the card's own voice while Team original stays one click away.
2. Palette for the Nexo preset: Okabe–Ito chosen for colour-blind safety; "Lab" (ColorBrewer Set1) is the
   alternative if the lab prefers saturated primaries.

## Seen, not mine (functional, for the auditor)

- `results_dashboard-plot_dist` draws empty in Nexo: packed `teamFloat64`/`teamRepeat` payload is not unpacked
  (Team does it in `www/team/js/plot_payload.js`; `tests/dual-ui/check_team_distribution_payload_unpack.cjs`).
- `results_dashboard-plot_heat` took > 180 s to draw on the first run of the capture script (the live cap /
  snapshot queue with five fresh cards), then drew normally on a fresh page; worth a timing check.
- Heatmap: 22 tick labels for 30 rows (Team's payload).
- The design API tunnel (127.0.0.1:3962) dropped with ECONNRESET at 22:37 during the after-captures; the
  remaining Nexo captures (dist, comp, heat; 1024 and 390 px) were taken once it came back, or are listed as missing below.

Astra review 2026-11-08: the Okabe–Ito contrast claim is corrected (orange 2.25:1, sky blue 2.31:1 on white, not > 3:1); the palette is kept for colour-vision safety.
