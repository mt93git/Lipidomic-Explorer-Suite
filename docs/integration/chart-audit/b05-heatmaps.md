# Chart audit · b05-heatmaps (Heatmaps and Violin View)

Auditor: Opus 5.5 (claude-b). Protocol: `docs/integration/nexo-chart-audit-plan.md`, checks 1–11 plus 12 (Layout).
Checks: `node tests/dual-ui/chart-audit/audit_b05-heatmaps.cjs [outputName …]` (Chromium 1440×900, audit API
127.0.0.1:3962, checkpoint `nexo-complete-synthetic`; saves `audit-b05-heatmaps-synthetic` and deletes it). Raw
results: `b05-heatmaps/results-*.json`. Screenshots: `b05-heatmaps/<output>-<check>.png`.

Setup note: port 5185 was already held by a Vite not started by this task (not stopped); this round served the same
config on **5285** (`NEXO_AUDIT_PORT=5285 NEXO_AUDIT_API=http://127.0.0.1:3962`) and ran the script with
`NEXO_AUDIT_BASE=http://127.0.0.1:5285`. The study design is confirmed through the Library dialog (unit Animal,
independent) at the start of every plot, as `test_nexo_layout_sweep.cjs` does.

Batch-specific checks in the script:
- **Sharp at 100 %** (heatmaps, check 1): at zoom 100 % the card's image pixels are compared with the pixels it is
  drawn on (`object-fit: contain` box × `devicePixelRatio`); it must be ≥ 0.98 image px per screen px.
- **"Significant" filters** (check 4): filtered heatmaps — a stricter Differential Expression threshold in Analysis
  settings (Team: the global sidebar's DE panel, read by `shared_data$significant_lipids()`, module
  `R/modules/4_heatmap_module.R:2049-2063`) must redraw the plot, then the old value is restored; Violin View — the
  scope "Differential Expression Filtered Lipids (Menu 3 DE)" (module l.90-94) must redraw it.
- **Violin significance** (check 6): Team's Violin View draws its own pairwise Welch t-tests (module controls
  `show_violin_sig`, `violin_sig_display_type`, `violin_sig_threshold`, baseline group): in Nexo these are Data
  controls; toggling them must redraw.

Mock layout sweep (`NEXO_SWEEP_ONLY=<the 5 sources> node tests/dual-ui/test_nexo_layout_sweep.cjs`, Plotly vendored):
```
PASS chromium:1024x768 heatmap_barchart_tab-filteredHeatmapSDPlot
PASS chromium:1024x768 heatmap_barchart_tab-violin_plot_render
PASS chromium:390x844 phone
SUMMARY offenders=0 sources=5 engines=chromium
```

**Status (first round, 2026-11-08, end):** heatmapPlot AGREE (after F1); heatmapSDPlot OPEN (#7 Team's SD CSV 500);
violin_plot_render OPEN (F5 unreadable at card size; #8 not concluded); filteredHeatmapPlot and filteredHeatmapSDPlot
OPEN (checks 4–10/12 not concluded). Fixes: F1 action-button spill (`144bda53` red → `653e68d1` green), F3 blank toast
buttons inside dialogs (`4e958ece` red → `2a48156f` green).

**API outage:** from ≈02:09 (EST) the audit API began failing (checkpoint DELETE 500, `GET /export/presets` 500,
`POST /sessions` 500), then refused connections on 127.0.0.1:3962. The filtered-heatmap re-runs could not open a
session. The last saved `audit-b05-heatmaps-synthetic` (id `08756e390bce…`) was not deleted (DELETE 500): delete it
when the API is back.

**Status (round 2, 2026-11-08 02:16–02:40 EST):** `git merge --no-edit nexo/phase1` → "Already up to date"
(nexo/phase1 `d265825c` is an ancestor). Audit API 127.0.0.1:3962 back (health 200), still running aad45f68: fixes
merged since then in `R/frontends/api` are not live; none of this round's results depends on one. Vite on **5285**
(started and stopped by this task). The leftover `audit-b05-heatmaps-synthetic` (`08756e390bce…`) was deleted:
`DELETE /api/v1/checkpoints/08756e390bce…` → `{"ok":true}` HTTP 200, no `audit-b05` checkpoint left; every round-2 run
deleted its own save (200).

| Plot | Round 2 | Auditor |
|---|---|---|
| heatmapPlot | not re-run (round 1 12/12 after F1) | AGREE |
| heatmapSDPlot | 11 PASS, #6 N/A, #7 FAIL = Team's SD CSV 500 (F4); Nexo's failure toast seen at 1.0 s | AGREE |
| violin_plot_render | #8 PASS now; #2 F5 open (options A/B written); #7 FAIL = Team's PDF 500 (F6), Nexo's toast seen | OPEN – F5 decision |
| filteredHeatmapPlot | 11 PASS, #6 N/A (checks 4–10, 12 concluded) | AGREE |
| filteredHeatmapSDPlot | 11 PASS, #6 N/A (checks 4–10, 12 concluded) | AGREE |

No Nexo bug found this round, so no app change (no vitest/tsc/inspector/card-chrome run needed). Script changes only
(`40044837`, `2eef476c`, `de3e1c7b`): the Analysis settings close button is now named "×"
(`frontends/nexo/src/ui/strings.ts:30`) — note for the a11y owner: an icon button whose accessible name is the glyph
"×" is read as "times"/"multiplication sign" by screen readers; Team downloads are watched for a toast from the click
on and all are tried; the −3 refusal is waited for.

Mock layout sweep, round 2 (`NEXO_PLOTLY_JS=<repo>/frontends/nexo/public/vendor/plotly.min.js
NEXO_SWEEP_ONLY=<the 5 sources> node tests/dual-ui/test_nexo_layout_sweep.cjs`, exit 0):
```
PASS chromium:1024x768 heatmap_barchart_tab-heatmapSDPlot
PASS chromium:1024x768 heatmap_barchart_tab-filteredHeatmapPlot
PASS chromium:1024x768 heatmap_barchart_tab-filteredHeatmapSDPlot
PASS chromium:1024x768 heatmap_barchart_tab-violin_plot_render
PASS chromium:390x844 phone
SUMMARY offenders=0 sources=5 engines=chromium
```

## heatmapPlot · Average signal heatmap (png, 1000×1100)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | Draft 100 % and zoomed out (frozen tier image): `b05-heatmaps/heatmapPlot-1-draws.png`, `b05-heatmaps/heatmapPlot-1-zoomed-out.png`. **Sharp at 100 %:** image 1000×1100 drawn at 965×1062 in a 998×1062 box (dpr 1) = 1.04 image px per screen px, no upscaling (`b05-heatmaps/heatmapPlot-1-sharp-100.png`). See finding F2 for Retina screens |
| 2 | Matches Team | PASS | Module's own `POST …/render` 620×680 PNG (74 KB) for the same inputs; the card shows its own 1000×1100 render (catalog `defaultSize`) at 998×1062: merged-group heatmap, class colour bar, class legend, rotated sample labels, nothing cropped. Card inputs = catalog defaults (`hideHeatmapRowNames=false`) |
| 3 | Size | PASS | 655→815→422 px wide (at Fit), redrawn each time, nothing overflows: `b05-heatmaps/heatmapPlot-3-larger.png`, `b05-heatmaps/heatmapPlot-3-smaller.png` |
| 4 | Data tab | PASS | All 29 controls of Team's heatmap markup present, and the 5 renderUI controls in `allowedInputs` (`heatmapDisplayColumns` checkbox group "Display Columns (Subset)", `customizeRowOrder`, `violin_scale_mode`, `violin_baseline_group_header` select (2 groups), `violin_zoom_pct` slider) are present too (probe of the Data tab DOM). "Hide Row Names" → redrew without row names (`b05-heatmaps/heatmapPlot-4-data-changed.png`). No free numeric value on the heatmap itself (the only number, the violin alpha, is audited on violin_plot_render) |
| 5 | Appearance | PASS | Image plot: Label renames the card, Background `rgb(255, 244, 224)`, Size, presets — no Plotly-only control that would silently do nothing (`b05-heatmaps/heatmapPlot-5-appearance.png`) |
| 6 | Statistics | N/A | Team has no statistics for the heatmap; tab says "Statistics are available for independent violin copies." |
| 7 | Export | PASS | Card PNG 432 KB; SVG disabled with the reason "This figure is a raster image; SVG is not available."; Team Data `Unfiltered_Heatmap_Data_….xlsx` 6.8 KB, Team PDF `Unfiltered_Heatmap_….pdf` 9.0 KB (valid %PDF); card PDF 113 KB; `b05-heatmaps/heatmapPlot-7-export-dialog.png` |
| 8 | Finish | PASS | Snapshot 698×761 in a 658×684 body; Edit figure → live PNG: `b05-heatmaps/heatmapPlot-8-finished.png` |
| 9 | Duplicate / remove / undo | PASS | Duplicate "Audit heatmapPlot" keeps `hideHeatmapRowNames=true`; remove + Undo brings it back drawn: `b05-heatmaps/heatmapPlot-9-duplicate.png` |
| 10 | Save and reopen | PASS | Reopened in a new page: label, `hideHeatmapRowNames=true`, background kept (`b05-heatmaps/heatmapPlot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS (after fix F1) | 1440×900 and 1024×768, tabs Data/Appearance/Statistics/Export with every section open: 0 offenders (`b05-heatmaps/heatmapPlot-12-layout-<width>-<tab>.png`). Before the fix: 2 offenders, see F1 |

Findings:
- **F1 (Nexo bug, fixed):** check 12 found the module button "Show Condensed Class Formulas in Statistics Tab"
  running past its Data-tab field at both sizes (`spill form.schema-form>fieldset>div.field.field-action`, button
  scrollWidth 302 > field 287 px). Root cause: module action buttons kept the global `button{white-space:nowrap}` and
  the Inspector's fixed 28 px button height. Fix in `frontends/nexo/src/ui/shell.css`
  (`#inspector .schema-form .field-action button`: `max-width:100%`, `white-space:normal`, `height:auto`, min 28 px).
  Red `144bda53` (`AssertionError: expected '' to match /white-space:\s*normal/`, `Tests 2 failed (2)`), green
  `653e68d1` (vitest `Test Files 105 passed (105)`, `Tests 480 passed (480)`; `tsc --noEmit` clean;
  `test_nexo_inspector.cjs` 42 PASS / 0 FAIL, `test_nexo_card_chrome.cjs` 29 PASS / 0 FAIL); re-run #12: 0 offenders.
- **F2 (presentation, for the designer — not a check FAIL):** Nexo never uses `devicePixelRatio` (no occurrence in
  `frontends/nexo/src`) and the render API has no pixel-ratio parameter (`R/frontends/api/cards.R:266-330`: the PNG is
  drawn at the requested CSS size). At dpr 1 the heatmap is 1:1 (sharp); on a Retina screen (dpr 2) the same 1000 px
  image fills 2000 device px, i.e. ≈0.5 image px per device px (soft). The plan gives "render sharpness (device pixel
  ratio)" of image plots to the design role.
- Note: Team's conditional panels are not applied to card Data tabs (the card schema has no `condition`; only Analysis
  settings honour it), so e.g. the condensed-formulas button and the custom colour pickers show even when
  `condenseRows`/`fineTuneColors` are off. They work; this is Nexo's general form behaviour, not specific to this plot.
- Note: at 100 % the 1000×1100 card is taller than a 900 px window; the 100+ row labels of the unfiltered heatmap are
  ≈6 px text in Team's ggplot (Team draws the same labels; not changed here).
- The first run's check 4 timed out once clicking "Hide Row Names" (30 s, cascading to 5/9/10); a DOM probe and the
  re-run both clicked it at once. Treated as a transient (API shared with another auditor); the script now logs the
  Playwright call log of a failing check.

Auditor (Opus 5.5): AGREE

Adversary (Astra): —

## heatmapSDPlot · Signal variability heatmap (png, 1000×1100; Team shows it with `condenseRowsSD`)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `b05-heatmaps/heatmapSDPlot-1-draws.png` (class-SD rows, "Condense Rows (Class Standard Deviation)" ticked in the Data tab, as the catalog `shownBy`), `b05-heatmaps/heatmapSDPlot-1-zoomed-out.png` (frozen tier image). **Sharp at 100 %:** 1000×1100 drawn at 965×1062 (dpr 1) = 1.04 image px per screen px (`b05-heatmaps/heatmapSDPlot-1-sharp-100.png`); Retina: see F2 |
| 2 | Matches Team | PASS | Module's own render 620×680 PNG (39 KB); card 1000×1100 at 998×1062, one row per lipid class, class legend, nothing cropped; `showHeatmapGrid` = catalog default `false` |
| 3 | Size | PASS | 655→815→422 px wide, redrawn: `b05-heatmaps/heatmapSDPlot-3-larger.png`, `b05-heatmaps/heatmapSDPlot-3-smaller.png` |
| 4 | Data tab | PASS | Same 29 + 5 renderUI controls as heatmapPlot; "Show Grid" → redrew with the grid (`b05-heatmaps/heatmapSDPlot-4-data-changed.png`); no free numeric value on this plot |
| 5 | Appearance | PASS | Image plot: Label, Background, Size only (`b05-heatmaps/heatmapSDPlot-5-appearance.png`) |
| 6 | Statistics | N/A | Team has no statistics for the heatmap; "Statistics are available for independent violin copies." |
| 7 | Export | **FAIL (Team behaviour)** | Card PNG/SVG-reason/PDF as heatmapPlot; Team "Data" = `downloadHeatmapSDCSV` → **HTTP 500**, no file. See F4 |
| 8 | Finish | PASS | Snapshot 698×761 in a 658×684 body; Edit figure → live PNG (`b05-heatmaps/heatmapSDPlot-8-finished.png`) |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps `showHeatmapGrid=true`; remove + Undo restores it drawn (`b05-heatmaps/heatmapSDPlot-9-duplicate.png`) |
| 10 | Save and reopen | PASS | Reopened: label, `showHeatmapGrid=true`, background kept (`b05-heatmaps/heatmapSDPlot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at 1440×900 and 1024×768 (`b05-heatmaps/heatmapSDPlot-12-layout-<width>-<tab>.png`) |

Findings:
- **F4 (Team behaviour, recorded):** Team's SD CSV handler (`R/modules/4_heatmap_module.R:3196-3216`,
  `downloadHeatmapSDCSV`) builds `cbind(df_mean, df_var, df_sd)` from `unfilteredHeatmapObj()` (one row per **lipid**
  unless `condenseRows` is also on) and `unfilteredHeatmapSDObj()` (one row per **class**): with the SD card's inputs
  the row counts differ, so the handler errors and the API answers 500. Not fixed (module code). Nexo's part: the click
  showed no lasting message (the script looked for one only after its 60 s wait; `ExportTab.tsx:29,46` does raise a
  `notifyFailure` toast, which lasts 9 s) — to re-check in round 2 by reading the toast at once.

Auditor (Opus 5.5): OPEN – #7 Team's SD CSV fails (Team behaviour, recorded); round 2 to confirm Nexo's failure toast

### Round 2 (2026-11-08)

Run: `node tests/dual-ui/chart-audit/audit_b05-heatmaps.cjs heatmapSDPlot` (script `40044837`: the page is read for
toasts from the click on) → 11 PASS / 1 N/A (#6) / 1 FAIL (#7, Team behaviour). Raw:
`b05-heatmaps/results-heatmapSDPlot.json`.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1–5, 8–12 | as round 1 | PASS | re-run, same results; #12 0 offenders at 1440×900 and 1024×768 |
| 6 | Statistics | N/A | as round 1 |
| 7 | Export | **FAIL (Team behaviour)**, Nexo's part PASS | Team "Data" (`downloadHeatmapSDCSV`) → `http 500 GET …/downloads/downloadHeatmapSDCSV` (F4, module `R/modules/4_heatmap_module.R:3196-3216`). **Nexo shows its failure toast 1.0 s after the click:** "Could not download the file: Request failed (500)" (`b05-heatmaps/heatmapSDPlot-7-download-0-toast.png`); the button stays usable, no file is saved |

Note (not a FAIL): the toast cannot say *why* — the API's 500 for a module download carries no `message`, so
`sendFile` (`frontends/nexo/src/api.ts:188`) falls back to "Request failed (500)". Passing Team's R condition message
through would live in `R/frontends/api` (not changed here; the audit API runs aad45f68 anyway).

Auditor (Opus 5.5), round 2: AGREE – Nexo reports the failure; #7's 500 is Team's own SD CSV handler (F4, recorded)

Adversary (Astra): —


## violin_plot_render · Selected-feature distributions (png, 620×720)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | `b05-heatmaps/violin_plot_render-1-draws.png`, `b05-heatmaps/violin_plot_render-1-zoomed-out.png` (frozen tier image) |
| 2 | Matches Team | **FAIL (Nexo: squashed, unreadable)** | Module render 620×680 (141 KB) and card 620×720 at 618×682 are the same plot, but with the defaults (scope "Current Heatmap View", no explicit selection → every lipid of the heatmap) the plot holds ~100 facets crammed into 620×720: labels overlap, nothing is readable (`b05-heatmaps/violin_plot_render-1-draws.png`). Team draws it in a resizable box whose height is `violin_zoom_pct` = `min(max(400, ceil(min(n,60)/3)·260), 3000)` px (module l.698-703, 720, 727-728; 3000 px here, shown in Nexo's Data tab as "Plot Height (px): 3000"). Nexo renders at the card size and ignores that height. See F5 |
| 3 | Size | PASS | 620→780→390 px wide, redrawn each time (`b05-heatmaps/violin_plot_render-3-larger.png`, `-3-smaller.png`) — still unreadable at every size (F5) |
| 4 | Data tab | PASS | 29 + 5 renderUI controls present; "Significance Alpha Threshold" 0.05→0.01 redrew (`b05-heatmaps/violin_plot_render-4-data-changed.png`); −3 refused: "Could not update the plot: Invalid value for violin_sig_threshold: below the minimum 1e-04" (card kept its plot; `-4-data-invalid.png`). **Significant filter:** scope "Differential Expression Filtered Lipids (Menu 3 DE)" redrew with the DE-significant lipids (`b05-heatmaps/violin_plot_render-4-significant.png`), back to "Current Heatmap View" redrew |
| 5 | Appearance | PASS | Image plot: Label, Background, Size (`b05-heatmaps/violin_plot_render-5-appearance.png`) |
| 6 | Statistics | PASS | Team's Violin View statistics are its own pairwise Welch t-tests against a baseline, set by Data controls; in Nexo: "Show Significance Bars & Stars" off → redrew (`b05-heatmaps/violin_plot_render-6-statistics-bars-off.png`), on again; "Numeric p-values" → redrew (`b05-heatmaps/violin_plot_render-6-statistics.png`); baseline group select offers Control/Treatment. The Statistics tab says "Statistics are available for independent violin copies." (Nexo's own violin statistics are for the dashboard violin only) |
| 7 | Export | PASS | Card PNG 861 KB; SVG disabled with the reason; card PDF 432 KB; Team's "Export PDF" / "Export Data" appear in "More downloads from this analysis" (`b05-heatmaps/violin_plot_render-8-finish-failed.png`) but loaded after the script had read the group ("no Team downloads"): to download in round 2 |
| 8 | Finish | not concluded | "Finish plot" pressed, card stayed "Up to date" for 180 s (`b05-heatmaps/violin_plot_render-8-finish-failed.png`). At the same time the audit API began failing (checkpoint DELETE 500, `GET /export/presets` 500, then `POST /sessions` 500 and no answer to `GET /checkpoints`): re-run in round 2 before calling it a Nexo bug |
| 9 | Duplicate / remove / undo | PASS | Duplicate keeps the threshold (both read 0.05 — see note); remove + Undo restores it drawn (`b05-heatmaps/violin_plot_render-9-duplicate.png`) |
| 10 | Save and reopen | PASS | Reopened: label, threshold, background kept (`b05-heatmaps/violin_plot_render-10-reopened.png`); **cleanup DELETE answered 500** — `audit-b05-heatmaps-synthetic` (id `08756e390bce…`) may still exist; delete it when the API answers |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at 1440×900 and 1024×768 (`b05-heatmaps/violin_plot_render-12-layout-<width>-<tab>.png`) |

Findings:
- **F5 (Nexo gap, open):** the Violin View card ignores Team's plot height (`violin_zoom_pct`). Team gives the plot
  up to 3000 px of height in a scrolling, resizable box; Nexo draws it into the 620×720 card, so with the default
  selection it is unreadable. Possible fixes (not done this round, no time left for test-first): the card's render
  height follows `violin_zoom_pct` (catalog `defaultSize` or the card size request), or the card shows Team's height
  with a scroll. Needs a decision with the designer.
- Note: after the invalid −3 the script restored 0.01, yet #9 read 0.05 on both original and duplicate; round 2 to
  check whether the refused value resets the field to the catalog default instead of the last good value.

Auditor (Opus 5.5): OPEN – F5 (unreadable at card size, Team's plot height ignored); #8 not concluded (API failing)

### Round 2 (2026-11-08)

Runs: `node tests/dual-ui/chart-audit/audit_b05-heatmaps.cjs violin_plot_render`, three times (script `2eef476c` and the
round-2 changes after it: refusal message waited for up to 10 s, every Team download tried before #7 fails, toasts
read from the click on). Last run: 10 PASS / 1 FAIL (#7, Team behaviour) / #11 PASS; raw
`b05-heatmaps/results-violin_plot_render.json`. The first round-2 run said the same for #7 and #8.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | as round 1 (`b05-heatmaps/violin_plot_render-1-draws.png`) |
| 2 | Matches Team | **FAIL (Nexo gap F5, open — decision below)** | same as round 1: the module's plot squeezed into 620×720; Team draws it at `violin_zoom_pct` = 3000 px (`b05-heatmaps/violin_plot_render-F5-today.png`) |
| 3 | Size | PASS | 620→780→390 px, redrawn |
| 4 | Data tab | PASS | 0.05→0.01 redrew; **−3 refused**: PATCH 400, the card goes to its error state without redrawing and the toast "Could not update the plot: Invalid value for violin_sig_threshold: below the minimum 1e-04" shows **0.5 s** after the value (`b05-heatmaps/violin_plot_render-4-data-invalid.png`; the field keeps showing "−3", marked invalid by its `min`, until a valid value is typed). **Threshold after the refusal:** 0.01 typed again → field 0.01; after re-selecting the card 0.01; #9 duplicate 0.01 and #10 reopened 0.01. Round 1's "0.05 on both" is not reproduced: the field is **not** reset to the catalog default (round 1's restore PATCH ran while the API was failing). DE scope "Differential Expression Filtered Lipids (Menu 3 DE)" redrew, back redrew (`-4-significant.png`) |
| 5 | Appearance | PASS | as round 1 |
| 6 | Statistics | PASS | as round 1 (bars off/on, numeric p-values, baseline Control/Treatment) |
| 7 | Export | **FAIL (Team behaviour)**, Nexo's part PASS | card PNG 861 KB, SVG disabled with its reason, card PDF; Team **"Export Data" downloaded** (1 s); Team **"Export PDF" → `http 500 GET …/downloads/download_violin_pdf` after 12 s** (21 s on the previous run), and **Nexo shows "Could not download the file: Request failed (500)" at once** (12.0 s / 21.5 s after the click; `b05-heatmaps/violin_plot_render-7-download-0-toast.png`). See F6 |
| 8 | Finish | **PASS** | snapshot 423×498 in a 421×460 body; Edit figure → live PNG (`b05-heatmaps/violin_plot_render-8-finished.png`). Round 1's "stayed Up to date for 180 s" was the API outage, not a Nexo bug (`-8-finish-failed.png` is round 1's evidence) |
| 9 | Duplicate / remove / undo | PASS | duplicate keeps `violin_sig_threshold=0.01` |
| 10 | Save and reopen | PASS | reopened with 0.01, label, background; checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at 1440×900 and 1024×768 (`b05-heatmaps/violin_plot_render-12-layout-<width>-<tab>.png`); mock sweep PASS |

Findings:
- **F6 (Team behaviour, recorded):** Team's violin PDF handler (`R/modules/4_heatmap_module.R:1092-1100`) saves with
  `ggsave(width = 11, height = max(6, ceiling(min(n, 60) / 3) * 3), device = "pdf")`: with the default selection
  (60+ lipids) that is 60 in, above ggsave's 50 in `limitsize` guard, so the handler errors and the API answers 500
  (it succeeds only up to 48 lipids, i.e. ≤ 48 in). Not fixed (module code; inferred from the code — no R on the M1
  to print the condition). Nexo reports the failure (toast, button stays usable).
- **F5 decision options (not implemented, for the designer/coordinator).** Team: `plotOutput(height =
  violin_zoom_pct)` inside a resizable box, default `min(max(400, ceil(min(n,60)/3)·260), 3000)` px (module l.698-703,
  720, 727-728); the user's "Plot Height (px)" slider (300–5000) is already in Nexo's Data tab but only reaches the
  module, not the card size. Nexo today: catalog `defaultSize` 620×720 for this output (`R/frontends/api/catalog.R:93-97`,
  `roomy` excludes the violin), and the card renders at its own size. Screenshots are DOM mocks made by
  `tests/dual-ui/chart-audit/b05_violin_height_options.cjs` with the module's own render at 620×3000 from the audit API:
  - **Today:** `b05-heatmaps/violin_plot_render-F5-today.png` — 60+ facets in 620×720, unreadable.
  - **A — the card's height follows `violin_zoom_pct`:** the card is 620×(3000 + header) and renders at Team's
    height (`b05-heatmaps/violin_plot_render-F5-option-A-tall-card.png`, at 100 %: readable, the rest is below the
    fold). Pros: one image = the whole plot; Finish/figure page/export get Team's full plot; the slider acts on the
    card like in Team. Cons: a 3000 px card dominates the canvas and Fit; changing the slider must resize the card
    (canvas undo, overlap with neighbours via Tidy up); a very tall PNG per render (cache/memory).
  - **B — the card keeps its size and the plot scrolls inside it:** the body is 620×(card) and shows the 620×3000
    render with a vertical scrollbar (`b05-heatmaps/violin_plot_render-F5-option-B-scroll.png`, mid-scroll). Pros: the
    canvas layout is unchanged; matches Team's scrolling page feel. Cons: a scroll area inside a pannable/zoomable
    canvas (wheel conflicts with canvas pan/zoom); the card's thumbnail/frozen tier and a finished figure show only
    a cut-out unless they keep the full image; the card's own resize no longer changes the plot height.
  - Either way the render request must carry Team's height (the module draws at whatever height it is asked), and
    the figure-page/export path must use the same height. Recommendation (auditor): **A** — it keeps "the card *is*
    the figure", which Finish and the figure page rely on; B needs a scroll exception in the canvas.
- **F5 Fix (option A, designer's decision; branch router/20261108-073844-0d8ea8):** the API reports the module's own
  height as `plotHeight` on card create and PATCH: the settled instance value of `violin_zoom_pct` (seeded by the
  module's renderUI), never recomputed (`api_card_plot_height`, `R/frontends/api/cards.R`; catalog flag
  `heightInput = "violin_zoom_pct"` on this output only, `R/frontends/api/catalog.R`). Nexo sizes the card
  `plotHeight + CARD_CHROME` (38 px) on add, follows the Data-tab Plot Height (one undo step with the input), writes a
  hand resize back to `violin_zoom_pct` (stepped 50, clamped 300-5000, card snapped to it), renders the PNG at the
  plot height, and on reopen keeps a disagreeing stored geometry and writes it back to the input
  (`frontends/nexo/src/canvas/plotHeight.ts`, `canvas.ts`). Card heights stay within Team's canvas limit (4000 px):
  a slider value above 3962 leaves the card at 4000 and the plot drawn at 3962. Evidence and test outputs:
  `docs/integration/nexo-phase1-evidence/h9/violin-height/` (R test `tests/dual-ui/test_api_violin_height.R` not run
  on the M1: no R).

Auditor (Opus 5.5), round 2: OPEN – F5 (#2: Team's plot height not followed; options A/B above, decision pending);
#7 FAIL is Team's PDF handler (F6, recorded); #8 resolved (PASS)

Adversary (Astra): —

## filteredHeatmapPlot · Filtered average heatmap (png, 1000×1100; catalog `needs: "de"`)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | After the study design is confirmed in the Library (Animal, independent): `b05-heatmaps/filteredHeatmapPlot-1-draws.png`, `b05-heatmaps/filteredHeatmapPlot-1-zoomed-out.png` (frozen tier image). **Sharp at 100 %:** 1000×1100 drawn at 965×1062 (dpr 1) = 1.04 image px per screen px (`b05-heatmaps/filteredHeatmapPlot-1-sharp-100.png`); Retina: F2 |
| 2 | Matches Team | PASS | Module's own render 620×680 PNG (64 KB); card 1000×1100 at 998×1062, nothing cropped; card inputs = catalog defaults |
| 3 | Size | PASS | 655→815→422 px wide, redrawn: `b05-heatmaps/filteredHeatmapPlot-3-larger.png`, `b05-heatmaps/filteredHeatmapPlot-3-smaller.png` |
| 4 | Data tab | partial | Controls as heatmapPlot; "Hide Row Names" → redrew (`b05-heatmaps/filteredHeatmapPlot-4-data-changed.png`). **Significant filter:** Analysis settings › Differential Expression › "Threshold <" 0.05 → 0.001, Apply: the card redrew and its title changed from "Filtered Heatmap (60 Lipids | |L2FC| ≥ 1, P < 0.05)" to "… P < 0.001)" (`b05-heatmaps/filteredHeatmapPlot-4-significant.png`, `-4-de-settings.png`); still 60 lipids — in the synthetic data all 60 also pass at 0.001, so a removal of rows was not shown. Team: same source `shared_data$significant_lipids()` (module l.2049-2063). The script then failed to restore the threshold (its "Close" locator also matched the toast's Close, so the sheet stayed open and blocked every later click) — fixed in the script (`0a1cd01f`); re-run impossible this round (API down, see below) |
| 5–10 | Appearance … Save and reopen | not concluded | Blocked by the open Analysis settings sheet (script defect above), not by Nexo. Re-run in round 2 |
| 6 | Statistics | N/A (expected) | Team has no statistics for the heatmap |
| 11 | Console | PASS | 0 console errors in the run |
| 12 | Layout | not concluded | Mock sweep for this source PASS, 0 offenders (top of this report); live check blocked as 5–10 |

Findings:
- **F3 (Nexo bug, fixed):** the "Analysis settings applied" toast inside the Analysis settings sheet showed two
  **blank white buttons** (Undo and Close): `b05-heatmaps/filteredHeatmapPlot-4-toast-before-fix.png`. Root cause:
  the toast is mounted inside the `<dialog>`, where `dialog button{background:var(--paper)}` paints the buttons
  paper while `.toast button{color:var(--paper)}` makes their text paper. Fix in `frontends/nexo/src/ui/shell.css`
  (`dialog .toast button`: no border, transparent background, paper text; hover accent). Red `4e958ece`
  (`AssertionError: expected '' to match /background:\s*transparent/`, `Tests 2 failed (2)`), green `2a48156f`
  (vitest `Test Files 106 passed (106)`, `Tests 482 passed (482)`; `tsc --noEmit` clean; `test_nexo_inspector.cjs`
  42 PASS / 0 FAIL, `test_nexo_card_chrome.cjs` 29 PASS / 0 FAIL). Not yet re-seen live (API down).
- The run left the session's DE threshold at 0.001 (restore failed). Sessions are in memory; autosave writes new
  checkpoint ids, `nexo-complete-synthetic` itself is not overwritten.

Auditor (Opus 5.5): OPEN – checks 4 (restore) to 10 and 12 not concluded (script defect, fixed; API down for the re-run)

### Round 2 (2026-11-08, after `git merge nexo/phase1` — already up to date; audit API back, still aad45f68)

Run: `NEXO_AUDIT_BASE=http://127.0.0.1:5285 node tests/dual-ui/chart-audit/audit_b05-heatmaps.cjs filteredHeatmapPlot filteredHeatmapSDPlot`
→ `AUDIT OK: 24 checks, 0 failed` (raw: `b05-heatmaps/results-filteredHeatmapPlot_filteredHeatmapSDPlot.json`).
The first round-2 attempt failed #4 again on the sheet's close button: since nexo/phase1 its accessible name is "×"
(`frontends/nexo/src/ui/strings.ts:30`, `close: '×'`), no longer "Close". Script fixed (`40044837`, matches
`/^(Close|×)$/` inside the sheet header); then the run above.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | as round 1 (re-run, same numbers): `b05-heatmaps/filteredHeatmapPlot-1-draws.png`, `-1-zoomed-out.png`, `-1-sharp-100.png` (1.04 image px per screen px) |
| 2 | Matches Team | PASS | module render 620×680; card 1000×1100 at 998×1062 |
| 3 | Size | PASS | 655→815→422 px, redrawn: `b05-heatmaps/filteredHeatmapPlot-3-larger.png`, `-3-smaller.png` |
| 4 | Data tab | PASS | 29 Team controls + 5 renderUI present; "Hide Row Names" redrew (`b05-heatmaps/filteredHeatmapPlot-4-data-changed.png`). **Significant filter:** Analysis settings › Differential Expression "Threshold <" 0.05→0.001, Apply → redrew (title "… P < 0.001)", `b05-heatmaps/filteredHeatmapPlot-4-significant.png`, `-4-de-settings.png`); **restored 0.05 → redrew**. The "Analysis settings applied" toast now shows at the bottom of the canvas with readable Undo/× (F3 no longer reproducible in this place) |
| 5 | Appearance | PASS | Label renames the card, Background `rgb(255, 244, 224)`, canvas Undo/Redo of the label; image plot, no Plotly-only control (`b05-heatmaps/filteredHeatmapPlot-5-appearance.png`) |
| 6 | Statistics | N/A | Team has no statistics for the heatmap; tab says "Statistics are available for independent violin copies." |
| 7 | Export | PASS | card PNG 390 KB; Team Data `Filtered_Heatmap_Data_….xlsx` 5.4 KB, Team PDF `Filtered_Heatmap_….pdf` 8.2 KB; card PDF 295 KB; SVG disabled with "This figure is a raster image; SVG is not available." (`b05-heatmaps/filteredHeatmapPlot-7-export-dialog.png`) |
| 8 | Finish | PASS | snapshot 698×761 in a 658×684 body; Edit figure → live PNG (`b05-heatmaps/filteredHeatmapPlot-8-finished.png`) |
| 9 | Duplicate / remove / undo | PASS | duplicate keeps the Data change; remove + Undo restores it drawn (`b05-heatmaps/filteredHeatmapPlot-9-duplicate.png`) |
| 10 | Save and reopen | PASS | reopened: label, Data change, background kept (`b05-heatmaps/filteredHeatmapPlot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at 1440×900 and 1024×768, tabs Data/Appearance/Statistics/Export with every section open, 1 slider inside the Inspector (`b05-heatmaps/filteredHeatmapPlot-12-layout-<width>-<tab>.png`); mock sweep PASS (Status) |

Note: in the synthetic data the DE list has 60 lipids at P < 0.05 and at P < 0.001 alike, so the stricter threshold
changes the title but removes no rows; the redraw follows the same `shared_data$significant_lipids()` as Team.

Auditor (Opus 5.5), round 2: AGREE

Adversary (Astra): —

## filteredHeatmapSDPlot · Filtered variability heatmap (png, 1000×1100; catalog `needs: "de"`)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | After the study design is confirmed in the Library (Animal, independent): `b05-heatmaps/filteredHeatmapSDPlot-1-draws.png`, `b05-heatmaps/filteredHeatmapSDPlot-1-zoomed-out.png` (frozen tier image). **Sharp at 100 %:** 1000×1100 drawn at 965×1062 (dpr 1) = 1.04 image px per screen px (`b05-heatmaps/filteredHeatmapSDPlot-1-sharp-100.png`); Retina: F2 |
| 2 | Matches Team | PASS | Module's own render 620×680 PNG (34 KB); card 1000×1100 at 998×1062, nothing cropped; card inputs = catalog defaults |
| 3 | Size | PASS | 655→815→422 px wide, redrawn: `b05-heatmaps/filteredHeatmapSDPlot-3-larger.png`, `b05-heatmaps/filteredHeatmapSDPlot-3-smaller.png` |
| 4 | Data tab | partial | Controls as heatmapPlot; "Show Grid" → redrew (`b05-heatmaps/filteredHeatmapSDPlot-4-data-changed.png`). **Significant filter:** DE "Threshold <" made stricter in Analysis settings, Apply → the card redrew (`b05-heatmaps/filteredHeatmapSDPlot-4-significant.png`, `-4-de-settings.png`). Then the same script defect as filteredHeatmapPlot (restore step blocked by the open sheet). The script then failed to restore the threshold (its "Close" locator also matched the toast's Close, so the sheet stayed open and blocked every later click) — fixed in the script (`0a1cd01f`); re-run impossible this round (API down, see below) |
| 5–10 | Appearance … Save and reopen | not concluded | Blocked by the open Analysis settings sheet (script defect above), not by Nexo. Re-run in round 2 |
| 6 | Statistics | N/A (expected) | Team has no statistics for the heatmap |
| 11 | Console | PASS | 0 console errors in the run |
| 12 | Layout | not concluded | Mock sweep for this source PASS, 0 offenders (top of this report); live check blocked as 5–10 |

Auditor (Opus 5.5): OPEN – checks 4–10 and 12 not concluded (same script defect; API down for the re-run)

### Round 2 (2026-11-08, after `git merge nexo/phase1` — already up to date; audit API back, still aad45f68)

Run: `NEXO_AUDIT_BASE=http://127.0.0.1:5285 node tests/dual-ui/chart-audit/audit_b05-heatmaps.cjs filteredHeatmapPlot filteredHeatmapSDPlot`
→ `AUDIT OK: 24 checks, 0 failed` (raw: `b05-heatmaps/results-filteredHeatmapPlot_filteredHeatmapSDPlot.json`).
The first round-2 attempt failed #4 again on the sheet's close button: since nexo/phase1 its accessible name is "×"
(`frontends/nexo/src/ui/strings.ts:30`, `close: '×'`), no longer "Close". Script fixed (`40044837`, matches
`/^(Close|×)$/` inside the sheet header); then the run above.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | as round 1 (re-run, same numbers): `b05-heatmaps/filteredHeatmapSDPlot-1-draws.png`, `-1-zoomed-out.png`, `-1-sharp-100.png` (1.04 image px per screen px) |
| 2 | Matches Team | PASS | module render 620×680; card 1000×1100 at 998×1062 |
| 3 | Size | PASS | 655→815→422 px, redrawn: `b05-heatmaps/filteredHeatmapSDPlot-3-larger.png`, `-3-smaller.png` |
| 4 | Data tab | PASS | 29 Team controls + 5 renderUI present; "Show Grid" redrew (`b05-heatmaps/filteredHeatmapSDPlot-4-data-changed.png`). **Significant filter:** Analysis settings › Differential Expression "Threshold <" 0.05→0.001, Apply → redrew (title "… P < 0.001)", `b05-heatmaps/filteredHeatmapSDPlot-4-significant.png`, `-4-de-settings.png`); **restored 0.05 → redrew**. The "Analysis settings applied" toast now shows at the bottom of the canvas with readable Undo/× (F3 no longer reproducible in this place) |
| 5 | Appearance | PASS | Label renames the card, Background `rgb(255, 244, 224)`, canvas Undo/Redo of the label; image plot, no Plotly-only control (`b05-heatmaps/filteredHeatmapSDPlot-5-appearance.png`) |
| 6 | Statistics | N/A | Team has no statistics for the heatmap; tab says "Statistics are available for independent violin copies." |
| 7 | Export | PASS | card PNG 433 KB; Team Data `Filtered_Heatmap_SD_Variance_Data_….csv` 15.4 KB, Team PDF `Filtered_Heatmap_SD_….pdf` 6.3 KB; card PDF 341 KB; SVG disabled with "This figure is a raster image; SVG is not available." (`b05-heatmaps/filteredHeatmapSDPlot-7-export-dialog.png`) |
| 8 | Finish | PASS | snapshot 698×761 in a 658×684 body; Edit figure → live PNG (`b05-heatmaps/filteredHeatmapSDPlot-8-finished.png`) |
| 9 | Duplicate / remove / undo | PASS | duplicate keeps the Data change; remove + Undo restores it drawn (`b05-heatmaps/filteredHeatmapSDPlot-9-duplicate.png`) |
| 10 | Save and reopen | PASS | reopened: label, Data change, background kept (`b05-heatmaps/filteredHeatmapSDPlot-10-reopened.png`); checkpoint deleted (200) |
| 11 | Console | PASS | 0 console errors |
| 12 | Layout | PASS | 0 offenders at 1440×900 and 1024×768, tabs Data/Appearance/Statistics/Export with every section open, 1 slider inside the Inspector (`b05-heatmaps/filteredHeatmapSDPlot-12-layout-<width>-<tab>.png`); mock sweep PASS (Status) |

Note: in the synthetic data the DE list has 60 lipids at P < 0.05 and at P < 0.001 alike, so the stricter threshold
changes the title but removes no rows; the redraw follows the same `shared_data$significant_lipids()` as Team.

Auditor (Opus 5.5), round 2: AGREE

Adversary (Astra): —
