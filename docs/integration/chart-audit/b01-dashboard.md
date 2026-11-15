# Chart audit · b01-dashboard (Dashboard: PCA, violin, signal distribution, composition, heatmap)

Auditor: Opus 5.5 (claude-b), Chromium 1440×900, audit API 127.0.0.1:3961, checkpoint `nexo-complete-synthetic`.
Script: `node tests/dual-ui/chart-audit/audit_b01-dashboard.cjs [pca,violin,dist,comp,heat]` prints PASS/FAIL/N/A per plot
and check (`NEXO_AUDIT_CHECKS=4,9` runs only those checks after check 1; full results also in
`/tmp/nexo-audit-b01-downloads/results-<plots>.json`). Screenshots: `docs/integration/chart-audit/b01-dashboard/`.

**Vite port.** Batch port 5181 was held by a 2.5-hour-old Vite started from another worktree
(`router-20261106-215239-34cb7a`, not mine, left running), and 5281 by another; this run served Nexo from this branch on
**:5481** (`NEXO_AUDIT_BASE=http://127.0.0.1:5481`). The API is the same audit API at 127.0.0.1:3961.

**Status (run 5, closing round, 2026-11-07, wave 1 UI):** PCA check 7 re-run PASS (PNG 161 778 B, SVG 15 948 B,
PDF 91 006 B tab / 69 301 B dialog, CSV 3 562 B, 0 console errors; `b01-dashboard/results-pca-check7-run5.json`) → PCA AGREE.
Heat: OPEN. Script adjusted for wave 1 (`f048cef`); heat check 3 drag-resize redrew larger (`heat-3-size-larger.png`) but the
run read the old "Size" group (now "Size & position", fixed in the script after the run, not re-run); checks 8 and 9 timed out
waiting for the card's Edit / Duplicate buttons on the wave 1 card (not diagnosed: script or Nexo); 10 not reached in the 30 min limit.

**Status (run 3, 2026-11-07):** all five plots audited. Signed AGREE: violin, dist, comp. PCA: OPEN only for the
SVG/PDF re-check of check 7 (fixes committed; violin/dist/comp/heat show the PDF working). Heat: OPEN, checks 3 and 8–10
not concluded (the re-run lost its API session to another agent at 01:2x).

### Summary

| Plot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| pca | PASS | PASS | PASS | FAIL→fixed | PASS | N/A | FAIL→fixed (PDF), PASS run 5 | PASS | FAIL→fixed | PASS | PASS |
| violin | PASS | PASS | PASS | PASS | PASS | N/A (Team: synthetic) | PASS | PASS | PASS | PASS | PASS |
| dist | FAIL→fixed (unpack) | PASS | PASS | PASS | PASS | N/A | PASS | PASS | PASS | PASS | PASS |
| comp | PASS | PASS | PASS | PASS | PASS (palette = Team) | N/A | PASS | PASS | PASS | PASS | PASS |
| heat | PASS | PASS | not concluded | PASS | PASS (run 3) | N/A | PASS | not concluded | not concluded | not concluded | FAIL (deliberate 400) |

Nexo bugs fixed (red → green): packed Signal distribution payload `0342ade`→`3c7e7ba`; dashboard Data tab shows only
the plot's inputs `4b07a5f`→`fbb53c9`; Duplicate copy hidden under the original `d180a3a`→`ab53927`; card PDF export
`b9e8267`→`9d7ef98`. Run 1: one-condition editor crash `2dfb186`→`2d3eef8`.

Team behaviours recorded: palette does not recolour Composition's class bars (only study conditions); Healthy in
grey only for `healthy*` groups; violin statistics blocked on synthetic samples.

### Open questions (Gerardo / coordinator)

1. API: `POST /canvas/validate` answered plumber's generic 500 (not `409 session_lost`) ~100 times after our session
   was evicted, and Nexo's autosave retries non-busy errors every 5 s forever. Needs the RTX API log; should autosave
   stop and offer "Reopen" instead?
2. Violin statistics cannot be audited on the synthetic-only checkpoint (Team's policy refuses synthetic samples).
   Check 6 needs a non-synthetic test dataset or an audit-only exception: your decision.
3. Composition overview: offer the palette (as Team does) although it recolours nothing there, or hide it with
   Team's "no series a palette can recolour" note? Today Nexo = Team.
4. Number inputs: Nexo sends an out-of-range value (Most variable = 5000) to the API, which refuses it with a clear
   toast; validating `min`/`max` in the form first would avoid the round trip and the console 400. Worth doing?

## results_dashboard-plot_pca (Principal components)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | card `current` at 100 % (`pca-1-draws-100.png`); zoomed out to 41 % the card shows its image (`pca-1-draws-zoomed-out.png`) |
| 2 | Matches Team | PASS | 2 traces identical to the module's `/render` output (scatter Control 12, scatter Treatment 12); plot 620×640 in body 618×646, nothing cropped (`pca-2-matches-team.png`). Team's title is empty (module default) |
| 3 | Size | PASS | drag: 620×640 → 460×520 (`pca-3-size-smaller.png`) → 760×740 (`pca-3-size-larger.png`), no overflow. **Size section** (Appearance): typed 560 × 480 px → plot 560×400 (card minus header/footer); *Single column (89 mm)* → plot 336×400, no overflow (`pca-3-size-section.png`) |
| 4 | Data tab | FAIL → fixed (Nexo bug) | before: the PCA card showed all eleven dashboard inputs; *Choose a lipid* and *X axis* changed nothing on the plot, *Most variable* (heatmap's `top_n`) and the heatmap/composition selections neither. After the fix: Color samples by, PCA abundance scale, PCA scaling = Team's drawer (`www/team/js/canvas.js:405-409`); each redraws the plot (→ Tissue / sample type, → Log10, → Centered only); no module buttons in the schema; no number control, so no invalid-value case on this plot (`pca-4-data-tab.png`) |
| 5 | Appearance tab | PASS | title, font size 16, font colour, x/y axis titles, plot background, all six palettes, orientation (x↔y swapped and back), Undo, Redo, Reset; **presets**: Nexo (system-ui ink text, Okabe–Ito; `pca-5-preset-nexo.png`), Publication, Team original restores Team's look exactly, the active one pressed (`pca-5-appearance.png`). Not offered on this state: x grid toggle (none in the axis section), Healthy in grey and legend position (after *Color samples by → Tissue / sample type* the study has one level, one trace, no legend) |
| 6 | Statistics tab | N/A | Team has no statistics for PCA; the tab says "Statistics are available for independent violin copies." |
| 7 | Export tab | FAIL (Nexo gap) | PNG 160 195 B, CSV "Plot data (CSV)" → `results_pca_scores_20261107.csv` 3 551 B, SVG 13 211 B (run 2); **no PDF**: Team offers PNG/SVG/PDF/JPG on every Plotly plot including canvas copies (`www/team/js/plot_exports.js:151`); Nexo's Export tab and dialog offer PNG/SVG/CSV only (`pca-7-export.png`). In run 3 *Download SVG* was disabled with no title on the live card (see findings) |
| 8 | Finish | PASS | finished snapshot 618×621 shown (`pca-8-finished.png`); Edit returns to the live plot titled "Audit pca" |
| 9 | Duplicate / remove / undo | FAIL → fixed (Nexo bug) | the copy appeared **under** the original (`pca-9-duplicate-placed.png`); after the fix: the copy is on top, same inputs, Remove + Undo restores it (`pca-9-duplicate.png`) |
| 10 | Save and reopen | PASS | saved `audit-b01-dashboard-synthetic`, reopened in a new page: title "Audit pca" and every input identical (`pca-10-reopened.png`); that checkpoint deleted (HTTP 200) |
| 11 | Console | PASS | 0 console errors, 0 API errors in run 3 |

### Bug fixed: dashboard plots offered every dashboard input (check 4)

- **Symptom:** on PCA, *Choose a lipid* → PC(16:0/16:1) and *X axis* → By sample: no redraw (they drive the violin and
  the composition); *Most variable: count* and the heatmap/composition selections were also shown.
- **Root cause:** the API's catalog gives every `results_dashboard-*` card the module's eleven inputs
  (`GET /catalog` `allowedInputs` is the same list for the five plots). Team's drawer shows `color_by` plus that plot's
  keys (`www/team/js/canvas.js:405-409`); Nexo's Data tab showed the full list.
- **Fix (Nexo only):** `frontends/nexo/src/ui/forms/dashboardControls.ts` keeps per plot the inputs that plot reads in
  `R/results_dashboard.R` (PCA: color_by, pca_transform, pca_scale; violin: + violin_lipid; dist: color_by; comp: +
  comp_class_selection, comp_group_selection, comp_axis_mode; heat: + top_n, heat_group_selection,
  heat_lipid_selection, heat_significance); `DataTab.tsx` applies it. No input value, no plot output changes.
- **Commits:** red `4b07a5f`, green `fbb53c9`.
  Red: `× shows on each dashboard plot only the inputs that plot reads` — `Tests 1 failed | 1 passed (2)` (all eleven ids
  received for PCA). Green: `✓ src/ui/forms/dashboardControls.test.ts (2 tests)`; full suite `65 files, 275 tests
  passed`; `tsc --noEmit` clean.

### Bug fixed: a new copy from Duplicate was hidden under the original (check 9)

- **Symptom:** `pca-9-duplicate-placed.png`: the selected copy (blue frame) sits 24 px below/right of the original and
  under it; its header could not be clicked (Playwright: the original's plot "intercepts pointer events").
- **Root cause:** `.card:focus-within{z-index:10}` above `.card.selected{z-index:9}` (`src/ui/shell.css:35,92`): the
  original keeps focus from its own Duplicate button.
- **Fix:** `duplicate()` in `src/canvas.ts` moves focus to the new copy (focus follows the new selection).
- **Commits:** red `d180a3a` (audit check: the copy's header is the topmost element at its centre), green `ab53927`.
  Red: `FAIL pca 9-duplicate-remove-undo — the new copy is hidden under the original: its header is covered right after
  Duplicate`. Green: `PASS pca 9-duplicate-remove-undo — duplicate … has the same inputs …; Remove + Undo restored it`.

### Earlier fix (run 1): one-condition study crashed the plot editor

`teamConditionsOf` (red `2dfb186`, green `2d3eef8`, see git history). Run 3 answers that run's open question: the
one-level grouping comes from **Color samples by → Tissue / sample type** on the synthetic checkpoint (one tissue);
Appearance then works (check 5 PASS on that state).

### Script fixes (not Nexo bugs)

`/cards/<id>/schema` responses are now captured (the schema comparison was empty before); orientation is checked by the
x↔y swap (scatter has no `orientation`); Duplicate is checked after Fit (the zoom pill covered the footer when checks
3–8 were skipped); HTTP ≥ 400 API responses are logged with their message.

Run 5 (wave 1 UI): check 7 PASS: PNG 161 778 B, SVG 15 948 B, PDF 91 006 B (tab) and 69 301 B (dialog, `%PDF`), CSV
`results_pca_scores_20261107.csv` 3 562 B (`pca-7-export.png`, `b01-dashboard/results-pca-check7-run5.json`); check 11: 0 console errors.

Auditor (Opus 5.5): AGREE

## results_dashboard-plot_violin (Feature distributions)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | card `current` at 100 % (`violin-1-draws-100.png`); image at 41 % (`violin-1-draws-zoomed-out.png`) |
| 2 | Matches Team | PASS | 2 violin traces identical to `/render` (Control 12, Treatment 12); plot 620×640 in body 618×646 (`violin-2-matches-team.png`) |
| 3 | Size | PASS | drag 620×640 → 460×520 → 760×740, no overflow; Size section 560×480 → plot 560×400, Single column → 336×400 (`violin-3-size-*.png`) |
| 4 | Data tab | PASS (after the check-4 fix above) | Color samples by, Choose a lipid = Team's drawer (`color_by`, `violin_lipid`); both redraw (→ Tissue / sample type, → PC(16:0/16:1)); no module buttons (`violin-4-data-tab.png`) |
| 5 | Appearance tab | PASS | title, font size/colour, axis titles, background, all six palettes (violin fill and outline recolour), orientation, Undo/Redo/Reset, presets Nexo / Publication / Team original (restores Team's look) (`violin-5-appearance.png`, `violin-5-preset-nexo.png`). Healthy in grey: no-op on Control/Treatment in Team too (Team greys only `healthy*`, `www/team/js/plot_editor.js:169`), N/A; no legend on this plot (Team hides it), so legend position N/A |
| 6 | Statistics tab | N/A (Team behaviour) | the tab opens with Test / correction / family, but the analysis is disabled: "Statistics need a confirmed independent study design, current prepared data and **no synthetic samples**" (`violin-6-statistics.png`). Team's policy; cannot be exercised on the synthetic-only audit checkpoint (open question 2) |
| 7 | Export tab | PASS (after the PDF fix) | PNG 231 991 B, **PDF 164 163 B** (tab) and 94 936 B (dialog), CSV `results_lipid_violin_20261107.csv` 2 222 B; SVG 15 363 B in run 3. Run 4 read *Download SVG* while the tab was still busy saving the PNG (script race, fixed; re-check at the end) |
| 8 | Finish | PASS | snapshot 618×621 (`violin-8-finished.png`); Edit returns to the live plot titled "Audit violin" |
| 9 | Duplicate / remove / undo | PASS | copy on top with the same inputs and title, Remove + Undo restores it (`violin-9-duplicate.png`) |
| 10 | Save and reopen | PASS | `audit-b01-dashboard-synthetic` saved, reopened in a new page with title and inputs identical (`violin-10-reopened.png`), then deleted (HTTP 200) |
| 11 | Console | PASS | 0 console errors in the re-run (run 3's 409/500s came from the evicted session, see the API finding) |

Auditor (Opus 5.5): AGREE

## Finding for the coordinator (API, not fixed here): `/canvas/validate` answers 500 after the session is evicted

In the violin run 3, after `POST …/statistics/violin → 409 session_lost` (the other agent's session evicted ours),
every `POST /sessions/s13/canvas/validate` answered **500 `{"error":"500 - Internal server error"}`** (plumber's
default handler, not `api_error`), ~100 times in ~8 minutes: Nexo's autosave retries non-busy errors every 5 s
without limit (`frontends/nexo/src/state/autosave.ts:17`), so it never learns that the session is gone, while every
other route answers `409 session_lost`. `api_handle` maps `session_lost` to 409 (`R/frontends/api/plumber.R:10-21`),
so the 500 is raised outside it (e.g. in the `@parser json` body parse or in `api_flush` with a dead process); the
API log on the RTX is needed to find which. Not reproduced on purpose (it needs another agent to evict the session).
Open question: should autosave stop and offer "Reopen" on a 409/500 from validate instead of retrying forever?

## Bug fixed: Signal distribution drew empty axes (packed payload)

- **Symptom** (designer's `dist-before-card-100.png`): empty axes; the 24 box traces arrive as
  `x: {teamRepeat, n}`, `y: {teamFloat64}` with `teamPacked: 1` (`R/results_dashboard.R:342-360`).
- **Root cause:** Team restores the arrays in `www/team/js/plot_payload.js` before Plotly; Nexo passed the packed
  objects to Plotly.
- **Fix (Nexo only):** `frontends/nexo/src/api/plotPayload.ts` `unpackFigure` (same validation: every trace checked
  first, a damaged payload left as received), applied to every fetched card figure in `src/cards.ts`. Values are
  the exact doubles; nothing about the plot changes.
- **Commits:** red `0342ade`, green `3c7e7ba`. Red: `× restores the plain x/y arrays of a packed distribution figure` —
  `AssertionError: expected { teamRepeat: 'S1', n: 3 } to deeply equal [ 'S1', 'S1', 'S1' ]`, `Tests 1 failed | 2
  passed (3)`. Green: `✓ src/api/plotPayload.test.ts (3 tests)`; full suite 64 files, 273 tests passed; tsc clean.
  The browser check is the dist section below.

## Gap fixed: no PDF of a card (check 7, every plot)

- Team: PNG/SVG/PDF/JPG buttons on every Plotly plot, canvas copies included (`www/team/js/plot_exports.js:151`).
  Nexo: PNG/SVG/CSV only.
- **Fix:** `frontends/nexo/src/export/pngPdf.ts` (one page of the export size in points, the card's PNG filling it,
  vendored jsPDF as the figure page uses), *Download PDF* in the Export tab and in the plot scope of the export dialog.
- **Commits:** red `b9e8267` (`× wraps the plot PNG in a one-page PDF … AssertionError: expected undefined to deeply
  equal [ 'new', …(1) ]`), green `9d7ef98` (`✓ src/export/pngPdf.test.ts (1 test)`; 66 files, 276 tests; tsc clean).

## results_dashboard-plot_dist (Signal distribution)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS (after the packed-payload fix) | 24 boxes (12 Control, 12 Treatment), log10(abundance) 3–5, card `current` at 100 % (`dist-1-draws-100.png`); image at 41 % (`dist-1-draws-zoomed-out.png`). Before the fix: empty axes (designer's `dist-before-card-100.png`) |
| 2 | Matches Team | PASS | re-check: "24 trace(s) identical to the module's /render output (box:Control:76, …)" counting the packed `x: {teamRepeat, n}` as Team unpacks it (the first run compared the raw packed objects, a script defect). Plot 620×300 in its body, nothing cropped at the default size |
| 3 | Size | PASS (Team module clips below 300 px card height — y title and legend at 460×180, whole at 620×300; same figure as Team) | drag 620×300 → 460×180 → 760×400, no overflow; Size 560×480 → 560×400, Single column → 336×400 (`dist-3-size-*.png`). At the minimum height (`dist-3-size-smaller.png`) the y title is clipped ("log10(abundanc") and the legend touches "Sample": Team's fixed margins; for the designer |
| 4 | Data tab | PASS (after the check-4 fix) | Color samples by only (= Team's drawer); redraws (→ Tissue / sample type) (`dist-4-data-tab.png`) |
| 5 | Appearance tab | PASS | title, fonts, axis titles, background, six palettes, orientation, Undo/Redo/Reset, presets Nexo / Publication / Team original (`dist-5-appearance.png`, `dist-5-preset-nexo.png`). After *Tissue / sample type* (one level) no legend, so legend position N/A; Healthy in grey N/A (no `healthy*` group) |
| 6 | Statistics tab | N/A | Team has no statistics for this plot |
| 7 | Export tab | PASS | PNG 104 777 B, SVG 16 363 B, PDF 82 105 B (tab and dialog), CSV `results_log10_distribution_20261107.csv` 158 875 B (`dist-7-export.png`) |
| 8 | Finish | PASS | snapshot 618×281 (`dist-8-finished.png`); Edit returns to the live plot "Audit dist" |
| 9 | Duplicate / remove / undo | PASS | `dist-9-duplicate.png` |
| 10 | Save and reopen | PASS | saved, reopened identical, deleted (HTTP 200) (`dist-10-reopened.png`) |
| 11 | Console | PASS | 0 console errors, 0 API errors |

Auditor (Opus 5.5): AGREE

## results_dashboard-plot_comp (Composition overview)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | stacked class bars, card `current` at 100 % (`comp-1-draws-100.png`); image at 41 % (`comp-1-draws-zoomed-out.png`) |
| 2 | Matches Team | PASS | 9 bar traces (CER, LPC, LPE, PC, PE, PI, PS, SM, TG; 2 groups each) identical to `/render`; plot 620×300 in body 618×306 (`comp-2-matches-team.png`). Team's inside text labels show as smudges on thin segments (designer's note; module) |
| 3 | Size | PASS | drag 620×300 → 460×180 → 760×400, no overflow; Size 560×480 → 560×400, Single column → 336×400 (`comp-3-size-*.png`) |
| 4 | Data tab | PASS (after the check-4 fix) | Color samples by, Visible lipid classes (9), Conditions (Control, Treatment), X axis: the inputs this plot reads (Team's drawer shows `color_by`; the class/condition selections and X axis are the module's own composition controls). Color samples by → Tissue / sample type and X axis → By sample both redraw (`comp-4-data-tab.png`) |
| 5 | Appearance tab | PASS · palettes = Team behaviour | title, fonts, axis titles, background, orientation, Undo/Redo/Reset, presets Nexo / Publication / Team original. **Palettes:** the six buttons change nothing: the bars are lipid classes, not study conditions, and Team's editor also recolours only `teamConditions` series while offering the palette (`www/team/js/plot_editor.js:169,332`). Recorded as Team behaviour, not changed (`comp-5-appearance.png`). Open question 3 |
| 6 | Statistics tab | N/A | Team has no statistics for this plot |
| 7 | Export tab | PASS | PNG 443 676 B, SVG 342 986 B, PDF 354 361 B (tab and dialog), CSV `results_class_signal_composition_20261107.csv` 52 370 B (`comp-7-export.png`) |
| 8 | Finish | PASS | snapshot 618×281 (`comp-8-finished.png`); Edit returns to "Audit comp" |
| 9 | Duplicate / remove / undo | PASS | `comp-9-duplicate.png` |
| 10 | Save and reopen | PASS | saved, reopened identical, deleted (HTTP 200) (`comp-10-reopened.png`) |
| 11 | Console | PASS | 0 console errors, 0 API errors |

Auditor (Opus 5.5): AGREE

## results_dashboard-plot_heat (Abundance heatmap)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | 1 heatmap trace (30 rows × 2 groups, mean z-score ±1), card `current` at 100 % (`heat-1-draws-100.png`); image at 41 % (`heat-1-draws-zoomed-out.png`) |
| 2 | Matches Team | PASS | trace identical to `/render`; plot 1000×1020 in body 998×1026 (`heat-2-matches-team.png`). The default card (1000×1100) is taller than a 900 px viewport at 100 % and Team labels 22 of 30 rows (designer's notes) |
| 3 | Size | not concluded | run 3: the resize handle was below the viewport (script defect, Fit added); run 4 lost the API session (`POST …/render → 409 session_lost`, another agent) and every later check timed out |
| 4 | Data tab | PASS (after the check-4 fix) | Color samples by, Most variable (count), Visible sample groups, Visible lipids (+ Show, when the design allows significance) = what the heatmap reads; Team's drawer shows `color_by`, `top_n`. Color samples by → Tissue / sample type redraws (one group: mean z-score 0, white cells, consistent); Most variable 30 → 40 redraws. **Invalid value** Most variable = 5000: refused with a visible toast "Could not update the plot: Invalid value for top_n: above the maximum 500", plot unchanged (`heat-4-data-tab-changed.png`); the field keeps 5000 and the refusal comes from the API (400), which Chromium logs as a console error (see 11) |
| 5 | Appearance tab | PASS | title, fonts, axis titles, background, Undo/Redo/Reset, presets Nexo / Publication / Team original. Palette: Nexo says "This chart uses continuous or per-point colors…" (as Team, `plot_editor.js:334`); heat scale in Series. Orientation disabled for a heatmap, no legend (`heat-5-appearance.png`) |
| 6 | Statistics tab | N/A | Team has no statistics for this plot |
| 7 | Export tab | PASS | PNG 431 695 B, SVG 23 704 B, PDF 274 327 B (tab) / 163 949 B (dialog), CSV `results_top_variable_heatmap_20261107.csv` 11 023 B (`heat-7-export.png`) |
| 8–10 | | not concluded | run 3: the zoom pill covered the card's Edit button (script defect, Fit added); run 4: session evicted (409), then `/canvas/validate` 500s as in the API finding; to re-run: `NEXO_AUDIT_CHECKS=3,5,8,9,10 node tests/dual-ui/chart-audit/audit_b01-dashboard.cjs heat` |
| 11 | Console | FAIL (from check 4's deliberate invalid value) | run 3: the only error is `PATCH …/cards/… → 400 Invalid value for top_n: above the maximum 500`, the deliberate 5000 (open question 4). Run 4: 409/500 from the evicted session |

Run 5 (wave 1 UI, checks 3, 8, 9, 10): check 1 PASS at 100 % and as an image at 41 %. Check 3: click-to-focus, drag
smaller then larger redrew with no overflow (`heat-3-size-smaller.png`, `heat-3-size-larger.png`), then FAIL on the script's
old `group "Size"` locator (the section is now "Size & position" with mm|px; script fixed after the run, not re-run).
Checks 8 and 9: FAIL, `Edit` / `Duplicate` buttons not found on the card within 30 s (wave 1 card; not diagnosed whether
the buttons moved or are hidden at the fitted zoom). Check 10 not reached before the 30-minute limit.

Auditor (Opus 5.5): OPEN – heat checks 3 (Size & position section), 8, 9, 10 to re-run with the wave 1 script; diagnose the missing card Edit/Duplicate buttons. Earlier: checks 3 and 8–10 not concluded (API session evicted by another agent in the re-run); check 5's preset failures in run 4 came after the eviction, run 3 had them PASS.

## Round 6 (closing round for results_dashboard-plot_heat, 2026-11-08, aad45f68 code)

Auditor: Opus 5.5. Chromium 1440×900 (check 12 also 1024×768), audit API 127.0.0.1:3961, checkpoint
`nexo-complete-synthetic` only. **Vite port:** 5181 and 5281 were both held by Vite servers started from other worktrees
(`router-20261106-215239-34cb7a`, `router-20261106-215253-7ee423`; not mine, left running), so this round served Nexo from
this branch on **:5481** (`NEXO_AUDIT_BASE=http://127.0.0.1:5481`), same as run 5. No 409 `session_lost` this round.

Runs (all against the same audit API):
- run 6a `NEXO_AUDIT_CHECKS=3,8,9,10 … heat` → 8, 9, 10 PASS; 3 FAIL on a stale script locator (see script fixes)
  (`b01-dashboard/results-heat-run6a.json`).
- run 6b `NEXO_AUDIT_CHECKS=3,5,8,9,10 … heat` (check 5 sets the title "Audit heat" that 8–10 must carry) → 5, 8, 9, 10,
  11 PASS; 3 FAIL on a stale script expectation (`results-heat-run6b.json`).
- run 6c `NEXO_AUDIT_CHECKS=3 … heat` with both script fixes → 3 PASS, 11 PASS (`results-heat-run6c.json`).
- `node tests/dual-ui/chart-audit/probe_b01-round6.cjs` (new, `136a0b94`, `b460e6b1`, `900a6cc9`): A. the Data tab of each
  dashboard card; B. the heat card's header chrome and More card actions menu; C. check 12 layout
  (`results-round6-probe-AB.json`, `results-round6-probe-C.json`).

### results_dashboard-plot_heat: checklist (round 6 = closing)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Draws | PASS | runs 6a–6c: card `current` at 100 % and an image at 41 % (`heat-1-draws-100.png`, `heat-1-draws-zoomed-out.png`) |
| 2 | Matches Team | PASS (run 3) | unchanged; trace identical to `/render` (`heat-2-matches-team.png`) |
| 3 | Size & position | PASS (run 6c) | click-to-focus at 65 %; drag: plot 1000×1062 → smaller 756×879 (`heat-3-size-smaller.png`) → larger 1214×1215 (`heat-3-size-larger.png`), no overflow. **Size & position** (Appearance, px): typed 560 × 480 → plot 560×442 = the card body (480 − 38 px header; no footer since wave 1); journal chip *Nature 1-col 89* → plot 336×442, no overflow (`heat-3-size-section.png`). Design note: at 336 px Team's two x tick labels "Control (n=12)" / "Treatment (n=12)" run together (module labels; for the designer) |
| 4 | Data tab | PASS (run 3, re-checked round 6) | round 6 probe A: Color samples by, Most variable, Visible sample groups (Control, Treatment), Visible lipids (searchable list, 76 lipids) load (`heat-4-data-tab-legacy.png`); run 3's redraw and invalid-value results stand (`heat-4-data-tab-changed.png`) |
| 5 | Appearance tab | PASS (run 6b) | title, font colour, x/y axis titles, plot background, Undo, Redo, Reset, presets Nexo / Publication / Team original (restores Team's look) (`heat-5-appearance.png`, `heat-5-preset-nexo.png`). The script reports "font size: not offered" because it looks for the old *Chart font size* field: font size is now *Typography › Base size* (12) with per-element scale (Title 1.42×, Axis titles 1.17×, Tick labels 1×, Legend 1×), visible in `heat-5-appearance.png`; stale locator, not a gap. Palette: "This chart uses continuous or per-point colors" (as Team); orientation disabled for a heatmap; no legend |
| 6 | Statistics tab | N/A | Team has no statistics for this plot |
| 7 | Export tab | PASS (run 3) | PNG/SVG/PDF/CSV (`heat-7-export.png`) |
| 8 | Finish | PASS (run 6b) | finished snapshot 1000×1104 shown at 629×680 (`heat-8-finished.png`); the header chrome **Edit** opens it and *Edit figure* returns to the live plot titled "Audit heat" |
| 9 | Duplicate / remove / undo | PASS (run 6b) | header chrome **Duplicate**: the copy is on top (`heat-9-duplicate-placed.png`), same inputs and title "Audit heat" (`heat-9-duplicate.png`); More card actions › Remove + Undo restored it with its title |
| 10 | Save and reopen | PASS (run 6b) | saved `audit-b01-dashboard-synthetic`, reopened in a new page: title "Audit heat" and every input identical (`heat-10-reopened.png`); that checkpoint deleted (HTTP 200) |
| 11 | Console | PASS (round 6) | 0 console errors and 0 API errors ≥ 400 in runs 6a, 6b, 6c and the probe. Run 3's only error was check 4's deliberate Most variable = 5000 (API 400 with a clear toast; open question 4), not re-run |
| 12 | Layout | PASS (1440×900 live; 1024×768 mock sweep) | see "Check 12" below |

### Card actions without a footer (by design since wave 1)

Probe B, heat card selected: the header chrome shows **Edit** and **Duplicate** (opacity 1 when selected/hovered/focused,
`shell.css:538-539`); Edit opens the Inspector (Data tab present) after it was closed; header Duplicate added a copy; the
**More card actions** menu (`cards.ts:178`) Duplicate added another copy, *Data & settings* opened the Data tab, *Remove*
removed both copies (`heat-9-header-duplicate.png`). Run 5's "Edit / Duplicate not found" did not reproduce: checks 8 and 9
find them by role and name in the header in runs 6a and 6b. PASS.

### Data tab of every dashboard card (after 38f3fe5e)

`nexo-complete-synthetic` opens with **no** dashboard card on its canvas, so the legacy v0 nodes that 38f3fe5e fixed
(`tcinstance_v0_<output>`, nodes with no instance) only exist on the pilot checkpoint, which this audit must not open; that
path is covered by the R test (`test_api_legacy_cards`) and the mock inspector suite in
`docs/integration/nexo-phase1-evidence/h9/legacy-cards/green.txt`. On the synthetic checkpoint the probe added each
dashboard plot from the Library and opened its Data tab (screenshots named `*-4-data-tab-legacy.png` by the probe; they show
Library-added cards):

| Plot | Card id | Data tab | Evidence |
|---|---|---|---|
| pca | `tcinstance_…-plot_pca` | PASS: Color samples by, PCA abundance scale, PCA scaling | `pca-4-data-tab-legacy.png` |
| violin | `tcinstance_…-plot_violin` | PASS: Color samples by, Choose a lipid (searchable picker) | `violin-4-data-tab-legacy.png` |
| dist | `tcinstance_…-plot_dist` | PASS: Color samples by | `dist-4-data-tab-legacy.png` |
| comp | `tcinstance_…-plot_comp` | PASS: Color samples by, Visible lipid classes (9), Conditions (2), X axis | `comp-4-data-tab-legacy.png` |
| heat | `tcinstance_…-plot_heat` | PASS: Color samples by, Most variable, Visible sample groups (2), Visible lipids (76, with Filter) | `heat-4-data-tab-legacy.png` |

The control sets are those of the run 3 check-4 fix (`dashboardControls.ts`); 0 console errors.

### Script fixes this round (not Nexo bugs; no assertion weakened)

- `16d1d623`: check 3 clicked *Single column*, which F1/F2 replaced by journal chips (`cardSize.ts:39-45` `journalChips`,
  "Nature 1-col 89"); it now clicks *Nature 1-col* and still requires 336 px.
- `07fba814`: check 3 required the typed 560×480 card to draw a 400 px plot (480 − header − the old footer). Cards have no
  footer, so the plot now must fill the card body (±2 px) with the card at 560×480 (±2 px): the same strictness, derived from
  the card instead of a constant.
- Not changed: check 5's *Chart font size* locator (now *Typography › Base size*); recorded above.

### Check 12 "Layout"

- **Live, 1440×900** (probe C, `results-round6-probe-C.json`): heat card selected, Inspector tabs Data, Appearance,
  Statistics, Export, every `<details>` opened, then the card chrome and the opened More card actions menu; rules spill,
  overlap, escape (the sweep's) plus *clip* (ellipsis without title/tooltip): **0 offenders**
  (`heat-12-layout-1440-data.png`, `-appearance.png`, `-statistics.png`, `-export.png`, `heat-12-layout-1440-card.png`).
- **Live, 1024×768: not concluded (probe defect).** After the resize the probe's Fit put the canvas at 19 %, where cards
  draw as thumbnails with their title under the image, and it clicked the header title, which is not shown at that zoom
  (timeout). Nexo was fine on screen (Inspector open on the heat card, tabs readable); the probe should select via the card
  body at thumbnail zoom.
- **Mock layout sweep** (`NEXO_PLOTLY_JS=… NEXO_SWEEP_ONLY=<the 5 sources of b01> node tests/dual-ui/test_nexo_layout_sweep.cjs`),
  same spill/overlap/escape rules on every Inspector tab with all sections open, the card chrome and the ⋯ menu, at
  1440×900, 1024×768 and the 390×844 phone, PASS, last lines:
  ```
  PASS chromium:1024x768 results_dashboard-plot_comp
  PASS chromium:1024x768 results_dashboard-plot_heat
  PASS chromium:390x844 phone
  SUMMARY offenders=0 sources=5 engines=chromium
  ```

### Round 6 result

No Nexo bug found in this round, so no app change (vitest, tsc and the inspector and card chrome suites not required and
not run). Commits: probe `136a0b94`, `b460e6b1`, `900a6cc9`; script `16d1d623`, `07fba814`; report and evidence `b5857cb0`
and this commit.

Still open (not blocking the heat signature): the probe's 1024×768 live pass (thumbnail-zoom selection); check 5's stale
*Chart font size* locator in the script; design note on the touching x tick labels at 336 px; open questions 1–4 above
(autosave on validate 500, violin statistics on synthetic data, Composition palette, client-side min/max).

Auditor (Opus 5.5): AGREE (results_dashboard-plot_heat: checks 1–12 concluded; 12 at 1024×768 rests on the mock sweep,
the live 1024×768 probe pass is a probe defect, recorded above)

Astra review 2026-11-08: `results_dashboard-plot_dist` check 3 now reads "PASS (Team module clips below 300 px card height …)" instead of "PASS, with a design note": the clipped y title and legend at 460×180 are Team's own drawing, not a readable small size.
