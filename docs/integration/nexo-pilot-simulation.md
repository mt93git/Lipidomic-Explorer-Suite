# Nexo phase 1 — simulated pilot (Paula rebuilds Figure 1, Steph reviews)

The phase 1 close called for Paula to rebuild Figure 1 in Nexo and Steph to review it. Neither can take part, so
the pilot is simulated. `tests/dual-ui/pilot/pilot_figure1.cjs` plays both personas end to end in a real browser
and writes a log a person can judge. It is a stand-in for the human pilot, not a replacement: it shows that the
whole job can be done and where it takes effort. It cannot say whether a scientist finds the result good.

## What it does

The script acts only through what a user sees: roles, labels and visible text. It reads `data-id` and the DOM only
to check state. Each step is timed, its clicks are counted, and console errors and error toasts are recorded. Each
step leaves a screenshot. A failed step does not stop the run.

| Step | Persona | Action |
|---|---|---|
| 1 | Paula | Open the checkpoint from the start screen |
| 2 | Paula | Confirm the study design (unit, relationship) when the library asks |
| 3a–d | Paula | Add PCA scores · 2D, Feature distributions (violin), Differential volcano, Composition · unfiltered; wait for each to draw |
| 4 | Paula | Change a Data input of the PCA (correlation method) and see it redraw |
| 5 | Paula | Restyle the violin: title, font size 14, Okabe–Ito palette |
| 6 | Paula | Violin statistics: Wilcoxon + Benjamini–Hochberg, review, confirm, results table, Statistics CSV |
| 7 | Paula | Resize with the handle, drag a card, Tidy up, Undo (⌘/Ctrl+Z), Redo |
| 8 | Paula | Add an illustration (serum vial) and a text on the Figure page |
| 9 | Paula | Finish PCA, violin and volcano; Figure page, Letter paper, Figure 1 layout |
| 10 | Paula | Export dialog: Nature preset, SVG + PDF bundle; one "More downloads from this analysis" file from the unfinished composition card |
| 11 | Paula | Save a named checkpoint |
| 12 | Steph | New browser context: reopen it and check cards, finished plots, violin title and statistics, illustration, text, paper and layout |
| 13 | Steph | Open it on a phone (375×812): view-only notice, no enabled editing control, chrome text ≥ 12 px, no sideways scroll |

## How to run it

```bash
node tests/dual-ui/pilot/pilot_figure1.cjs
```

```bash
NEXO_LIVE_BASE=http://localhost:5173 NEXO_LIVE_ENGINES=chromium,webkit node tests/dual-ui/pilot/pilot_figure1.cjs
```

The first command uses the mock build: it builds it, serves it on a free local port and opens the mock's first
checkpoint. The second runs against the real API: the app at `/nexo/` and the API at `/api/v1`, here Vite dev with
the tunnel to the RTX. The live run opens `NEXO_LIVE_CHECKPOINT` (default `nexo-complete-synthetic`) and refuses
any checkpoint whose name lacks "synthetic". It deletes only the checkpoint it saved. Set
`NEXO_LIVE_USER`/`NEXO_LIVE_PASS` for the nginx-protected build. Output goes to `NEXO_PILOT_OUT` (default
`/tmp/nexo-pilot`): `pilot-log.json` and one PNG per step.

## Result

Both modes pass all steps in Chromium and WebKit: 16 steps × 2 engines, 32 of 32, 0 console errors. Evidence is in
`docs/integration/nexo-phase1-evidence/h8/pilot-simulation/`. The live timings come from the complete synthetic
checkpoint on the RTX through the tunnel. Opening takes about 4 s. Each add-and-draw, Data change, restyle,
statistics run, finish-and-page step, export and save takes 0.5–1.7 s. The Tidy up round trip takes 3.5 s and
Steph's reopen 2.5 s.

## Findings

The first runs failed in several places. Each failure was traced to either the script or the app; only the app
findings are listed. Severity: P1 blocks the job, P2 wrong or misleading, P3 friction.

| Step | Persona | Severity | What happened | Fix |
|---|---|---|---|---|
| 9 | Paula | P2 | Figure page selects showed internal values (`free`, `pages`, `arrangement`, `figure1`, `portrait`) where Team shows labels | Fixed: Free / One per page / Arrangement / Figure 1, Portrait / Landscape (`FigurePage.tsx`) |
| 9 | Paula | P2 | Figure 1 panel B said "Finish a 2D PCA in Draft" next to her finished 2D PCA: the template only knows the dashboard PCA and the fixed `qc_pca_tab-pca2dPlot` id, so a library copy never fills B. Team has the same trap | Fixed in Nexo: when neither fixed card is on the canvas, a copy of the same source fills B (`figure/layout.ts`, red then green in `layout.test.ts`) |
| 11 | Paula | P2 (mock only) | In the mock, saving after violin statistics failed with "Invalid saved violin statistics.": the mock's fingerprints were not 64-hex, which the canvas validator requires as Team's does. The real API sends sha256, and the live save was always fine | Fixed: the mock derives 64-hex prints (`mock/statistics.ts`, red then green in `mock/statistics.test.ts`; `test_nexo_statistics.cjs` updated) |
| 13 | Steph | P3 | On a phone, card states, counts and the statistics marker were 11 px (Team's `--font-label`) | Fixed: 12 px on screens ≤ 480 px; desktop keeps Team's 11 px. Asserted in `test_nexo_access.cjs` |
| 9 | Paula | P3 | The Figure 1 template hides free text and shapes without saying so. They are kept, and the Free layout shows them. Same in Team | Fixed: the Figure page panel says "1 text or shape hidden by this layout. Free shows it." on any template layout (`hiddenByLayout` in `figure/layout.ts`; red then green in `layout.test.ts` and `test_nexo_figure_page.cjs`) |
| 5 | Paula | P3 | Choosing a palette marks the swatch as selected, but the plot changes only on "Apply palette". Same in Team | Fixed: choosing a palette or toggling "Healthy in grey" applies it at once; the Apply palette button is gone (one undo step per choice). Red then green in `PlotEditor.test.ts` and `test_nexo_inspector.cjs` |
| 8 | Paula | P3 | On a full page, "Add text" refuses with "No free space is left on the page", as Team does | None: Team behaviour |

Click counts above six (restyle 8, statistics 7, illustration + text 8, finish + page 11, export 13) are logged as
friction by rule. Each is a multi-control task that needs no detour, so none is a finding.

## What it does not cover

Round 1 list; see Round 2 below for the current one.

- Paula's real checkpoint and her real Figure 1 panels. Only synthetic checkpoints are used; the real data stays on
  the RTX.
- Judgement: whether the figure is publishable, the statistics are the right ones, or the layout reads well. That
  needs Paula and Steph.
- Team's own canvas: the round trip into Team is covered by `test_api_roundtrip.R`, not by this script.

## Round 2 (2026-11-08, tip 8c2690cc)

Round 2 adds what H9 brought (tall violin card, computed controls, module actions replayed, heatmap significance
note, FLA index picker, retina PNG cards, session reopen, warm worker) and the Team round trip of the checkpoint the
pilot itself saves. Paula now works on a Retina screen (device scale 2; screenshots are kept at CSS size). Steph's
desk and phone are unchanged.

### Steps

New steps are in bold. The other steps are as in round 1.

| Step | Persona | Action |
|---|---|---|
| 1, 2 | Paula | Open the checkpoint; confirm the study design |
| 3a–d | Paula | Add PCA, violin, volcano, composition. **Each add logs the time from the click to the drawn plot** (`metrics.clickToDrawnSeconds`; live also logs the create and first-render `Server-Timing`) |
| **3e** | Paula | **Add "Selected-feature distributions": card height = the Data tab's Plot Height (px) + 38, capped at 4000; image drawn at the plot height** |
| 4 | Paula | Change a PCA Data input |
| **4b** | Paula | **Phase 1 close (F1): rail Palettes opens Team's session palette; she sets the Control group's colour (Group 1) to `#aa3300`; the PCA, and the other group-coloured cards on the board, redraw; the PCA's pixels show that colour. Logged as `metrics.sessionPalette`.** (Round 2 used the PCA's own "Override sample colors" pickers, which never reach a canvas copy's plot: finding F1) |
| **4c** | Paula | **Add "Structural remodeling shifts" (Team's placeholder), press "Initiate Structural Analysis" in the Data tab; the card draws the analysis** |
| **4d** | Paula | **Add "Abundance heatmap" and read the "Significant only" note: when disabled it must give Team's reason; when allowed, choosing it must show Team's "Showing N significant lipids: …"** |
| **4e** | Paula | **Add "Functional ratio distributions", tick one more index in an "Indices to Plot" category; the card redraws** |
| 5, 6, 7 | Paula | Restyle the violin; violin statistics; resize, drag, Tidy up, Undo, Redo. **Phase 1 close (F2): when the composition card is a thumbnail (< 20 %, its header hidden) she drags the thumbnail itself** |
| **7b** | Paula | **Zoom to ≥ 150 % with "Zoom in"; the PCA's `<img>` naturalWidth is about 2× its CSS width; the dpr its renders asked for is logged** |
| **7c** | Paula | **The API loses the session (live: the page's own session is DELETEd, its id read from the page's own requests; mock: the mock's `evict(409)`), then she sets the Control colour to `#0055aa` in the session palette (phase 1 close; round 2: the PCA's own picker): the app reconnects by itself, the PCA shows the new colour, the violin title, FLA pick and structural drawing are kept, no error stays** |
| 8, 9 | Paula | Illustration and text; finish and Figure page |
| 10 | Paula | Export dialog, Nature preset: SVG + PDF bundle, **with R script and Data (CSV) ticked (Steph's review, step 10), members listed in the log (`metrics.bundle`)**; one "More downloads" file of the composition card |
| **10b** | Paula | **Steph's review, step 10: Figure page → Page tab → Export PDF and Export SVG of the composed page. Logged (`metrics.pageExport`): file names, sizes, page size in pt and mm, PDF pages and page images, SVG slots and the panels holding a finished plot or illustration. Fails when a file is empty or holds fewer panels (or pages) than the page shows. Files kept as `<out>/<engine>-figure-page.pdf` / `.svg`** |
| 11 | Paula | Save |
| **11b** | Paula | **Checkpoints dialog → Download: the ZIP goes to `NEXO_PILOT_OUT/pilot-saved.zip` (`pilot-saved-<engine>.zip` with two engines; `pilot-saved.zip` is then the first engine's), sha256 and counts logged; the ZIP's canvas must match the screen (cards, finished plots, statistics) Team's `state.json` `color_shape` must hold the session colour (phase 1 close; round 2: Nexo's member) and Nexo's member the pressed `runAnalysis` and the FLA pick** |
| 12 | Steph | Reopen and check (phase 1 close: the violin's statistics marker is read with `textContent`, a state check, since her fitted view shows it as a thumbnail), **plus: the PCA's pixels show Paula's last colour; the structural card draws without pressing Initiate again (after the design confirmation Team asks for on any reopen, see findings); the FLA index is still ticked**; **Steph's review, rows 2/12: Paula's confirmed design is kept in Nexo's member; the reopen opens Confirm study design at once, prefilled with it and saying "Saved with this design by the author; confirm to enable differential plots.", and Steph confirms with one click; the save pill must not say "Unsaved changes" on open nor after she only looked (the Free layout she checks is undone)** |
| 13 | Steph | Phone: view only and legible. **The inspector check now taps the violin or the first plot card on screen and says which; round 1 ignored a failed tap** |

### How to run it

Same commands as round 1. `NEXO_LIVE_ENGINES` also selects the engines in mock mode. Without R on the machine, set
`NEXO_PLOTLY_JS` to a `plotly.min.js` for `scripts/vendor-plotly.sh`.

Team round trip of the saved ZIP (R, from the repository root, with `pilot-log.json` beside the ZIP):

```bash
Rscript tests/dual-ui/pilot/pilot_team_roundtrip.R /tmp/nexo-pilot-live/pilot-saved.zip
```

It prints PASS/FAIL lines and exits 1 on any FAIL. (i) `read_session_archive(include_team_canvas = TRUE)` reads the
ZIP. (ii) `team_canvas_validate(archive$canvas)` equals the archive canvas (canonical JSON). (iii) Team's restore,
through `shared_data_server` and `team_canvas_server` in the API engine's headless Team session
(`api_session_open`), emits `team-canvas-restore` with that state. Each saved plot is then created through
`team_canvas_instance_create`, as `canvas.js` asks after a restore, and none may raise `team-canvas-instance-error`.
(iv) Every plot instance passes `team_plot_instance_validate`. (v) The counts match the pilot log's step 11b. **The
script was written on the M1, which has no R, and has never been run.**

### Mock results

Mock build, tip 8c2690cc: **48 of 48** (24 steps × Chromium, WebKit), 0 console errors. One earlier run failed step 7 in Chromium:
its resize drag landed during a camera glide. That was a script race; the script now waits for the camera to stop.
The three runs since then, the evidence run included, passed 48/48. Seconds and clicks per engine; click→drawn for the add steps (mock renders are local,
so these times say nothing about the API; the live run is what shows the warm-worker gain).

| Step | Chromium | WebKit | click→drawn (s) C / W |
|---|---|---|---|
| 1 | PASS 1.0 s · 1 | PASS 1.0 s · 1 | |
| 2 | PASS 0.5 s · 6 | PASS 0.3 s · 6 | |
| 3a | PASS 0.2 s · 2 | PASS 0.2 s · 2 | 0.2 / 0.1 |
| 3b | PASS 0.2 s · 2 | PASS 0.2 s · 2 | 0.2 / 0.1 |
| 3c | PASS 0.2 s · 2 | PASS 0.1 s · 2 | 0.2 / 0.1 |
| 3d | PASS 0.4 s · 2 | PASS 0.1 s · 2 | 0.3 / 0.1 |
| 3e | PASS 2.9 s · 3 | PASS 2.6 s · 3 | 0.7 / 0.3 |
| 4 | PASS 2.2 s · 2 (skipped in the mock) | PASS 2.2 s · 2 (skipped in the mock) | |
| 4b | PASS 2.7 s · 3 | PASS 2.1 s · 3 | |
| 4c | PASS 2.9 s · 5 | PASS 2.7 s · 5 | 0.2 / 0.1 |
| 4d | PASS 2.7 s · 5 | PASS 2.5 s · 5 | 0.3 / 0.2 |
| 4e | PASS 2.4 s · 5 | PASS 2.1 s · 5 | 0.3 / 0.1 |
| 5 | PASS 2.8 s · 7 | PASS 2.5 s · 7 | |
| 6 | PASS 3.7 s · 7 | PASS 3.4 s · 7 | |
| 7 | PASS 7.5 s · 7 | PASS 6.0 s · 7 | |
| 7b | PASS 3.0 s · 4 | PASS 2.6 s · 4 | |
| 7c | PASS 8.3 s · 4 | PASS 8.1 s · 4 | |
| 8 | PASS 1.2 s · 7 | PASS 0.6 s · 7 | |
| 9 | PASS 7.2 s · 14 | PASS 6.8 s · 14 | |
| 10 | PASS 3.7 s · 14 | PASS 2.8 s · 14 | |
| 11 | PASS 0.7 s · 4 | PASS 0.3 s · 4 | |
| 11b | PASS 0.4 s · 3 | PASS 0.1 s · 3 | |
| 12 | PASS 6.6 s · 10 | PASS 6.0 s · 10 | |
| 13 | PASS 0.5 s · 2 | PASS 0.7 s · 2 | |

What the mock steps observed:

- 3e: Plot Height 2340 → card 2378 px (2340 + 38), image 440×2340. The slider handle sits at 2350 while the printed
  value is 2340: Team's off-step default, already noted in `h9/violin-height/README.md`.
- 4: still skipped in the mock. The mock PCA offers no select with a second choice; the live run covers this step.
- 4b: "Colour for Control" → `#aa3300`; the redrawn PCA shows it.
- 4c: the placeholder "Click 'Initiate Structural Analysis' in the left sidebar", then the analysis.
- 4d: allowed in the mock, because step 2 confirmed an independent design. Choosing it shows "Showing 12 significant
  lipids: …". **The disabled case is not reached in the mock run**; the live synthetic checkpoint may reach it,
  depending on Team's guard. `test_nexo_heat_significance.cjs` covers it in the mock.
- 4e: "Structural: SM/PC" ticked; the drawing lists 4 indices.
- 7b: at 156 % the PCA image is 880×660 for a 438×292 CSS box (×2.01, `object-fit: contain`). Its mock renders asked
  for dpr 2 and dpr 1.
- 7c: "Reconnecting to the analysis…" → "Analysis reconnected. Your plots were restored.", one reopen, `#0055aa`
  shown, earlier edits kept.
- 11b: `pilot-saved-chromium.zip` is 94 933 B, sha256 `adae14e9…61a14fd`; `pilot-saved-webkit.zip` has sha256
  `c1ba77c3…e95dd50`. **The mock ZIP is a placeholder for the round trip**: it is the mock's canvas-only archive
  (`src/mock/archive.ts`: `team-canvas-v1.json` + `nexo-canvas-v1.json`, no Team session), which
  `pilot_team_roundtrip.R` cannot open. Counts: nodes 12, tabs 0 (single tab, no tabs member), finished plots 3,
  statistics 1, illustrations 2, texts 0. The screen agreed.
- 12: Steph confirms the design the reopened structural card asks for. The card then draws the analysis without
  Initiate, and the PCA shows `#0055aa`.
- 13: on the phone the overview is limited to 10 %, and cards show as labels. The inspector check ran on the first
  plot card on screen (the structural summary in Chromium, the volcano in WebKit), not on the violin.

Evidence: `docs/integration/nexo-phase1-evidence/h9/pilot-simulation/mock/` holds `pilot-log.json` and
`pilot-mock.txt` (paths as `<tmp>`/`<repo>`), every Chromium step PNG, and the WebKit PNGs of the new steps. Each
PNG is under 400 KB. The red/green outputs of the two fixes are one level up.

### Findings

As in round 1, only app findings are listed; script problems are not.

| Step | Persona | Severity | What happened | Fix |
|---|---|---|---|---|
| 4b | Paula | P2 | Ticking "Override sample colors" on the PCA never brought the per-group colours into the Data tab, not even after selecting the card again. Team builds `customCol_<group>` only once the box is ticked (`R/modules/2_qc_boxplot_module.R:809-818`). The API serves them on the next schema read, but the Data tab re-read the schema only after a control with options changed (`SchemaForm.tsx:55`), and nothing cleared its schema cache. The mock did not show it: its PCA had no such box, and its boxplot served the colours without one | Fixed: `schemaRefreshNeeded` (`ui/forms/schemaForm.ts`) also re-reads after a checkbox. Red `c954bc0f` (mock PCA made faithful to Team, `schemaForm.test.ts`, `test_nexo_inspector.cjs` R2), green `edf177de`. Outputs: `red-custom-colours.txt`, `green-custom-colours.txt` |
| 9 | Paula | P3 | On a Retina screen, "Finish plot" pressed right after selecting a card said "Plot is not ready." Clicking a card focuses it at 100 %, which asks for its 2x image. `liveImage()` put the new `<img>` in and ended the render before the image had decoded, so `finish()` saw `img.complete === false` (`cards.ts:328`). A second press worked | Fixed: `imageReady` (`src/imageReady.ts`): `finish()` waits for the image to decode, up to 5 s. Red `c9dde303` (`imageReady.test.ts`; `test_nexo_retina.cjs` section 4, a race: red in WebKit on run 1, green on run 2), green `769090a4`. Outputs: `red-finish-retina.txt`, `green-finish-retina.txt` |
| 12 | Steph | P3 | The reopened checkpoint asks for the study design again before an unfinished differential card (the structural summary) draws | None: Team behaviour. Design approval is session-local and never rehydrated from an archive (`R/modules/1_shared_data_module.R:5906-5910`) |
| 8 | Paula | P3 | "Add text" still refuses on a full page | None: Team behaviour (round 1) |
| 4b (live) | Paula | P2 | **F1.** Per-card group colours/shapes do nothing. On a `qc_pca_tab-pca2dPlot` card, `useCustomColors = TRUE` then `customCol_Control = "#aa3300"`: the session input is set but every render (after a cache clear, at another size) still draws Control in `#E41A1C`. Cause, in Team's own code: a canvas copy takes its colour map from the session (`plot_instances.R` `global_color_map <- shared_data$color_maps()`; the PCA builds with `global_color_map()[[colorMap_key]]` and `shared_data$shape_maps()`); the copy's `customCol_*`/`customShape_*` only feed its return value, which only Team's main QC tab bridges (`R/server.R` `qc_settings_bridge`). They are dead in Team's canvas too. The mock faked a redraw | Fixed. API: QC copies no longer offer `customCol_*`/`customShape_*` (old values are dropped, not refused); the cellular organization polar map keeps its own, which do reach its plot; the schema says `sessionPalette`. New route `GET/PATCH /sessions/<id>/palette` (`R/frontends/api/palette.R`) drives Team's data hub editor (`palette_choice` + `palette_use`; `colorEditMode` + every `globalGroupCol_*` + `btn_apply_colors`; undo through Team's `set_palette_settings`); it is in the disk-cache key and the render workers' state; Team's export saves it and Team's import restores it. Client: rail Palettes opens the session palette (Team's palette names, per-group colours; Team's editor has no shapes), one undo step per change, every card redraws; the Data tab says the colours follow the session palette and opens it; the mock is session-wide as Team. Red `b0d863d5` (R), green `02c2dca0` (API) + `caf7d633` (test adjustments; R run green on the M1 in a local Docker R 4.6 image, still to be run on the RTX), client `62a0b5b2`. Evidence: `h9/session-palette/README.md` |
| 7 (live) | Paula | P3 | **F2.** Cards cannot be moved at the thumb tier. Below 20 % the header is 0 px and inert, and the canvas started a move only from the header. With Team's plot heights Fit lands at ~14 %, so the whole board could not be rearranged | Fixed: at the thumb tier a press on the card body that leaves the 4 px click threshold drags the card (same snapping, settle, single undo as a header drag); a press within it still focuses the card. Red/green in `07792004` (`thumbDrag.test.ts`, `test_nexo_thumb_drag.cjs`). Evidence: `h9/session-palette/README.md` |

Click counts above six (restyle, statistics, arrange, illustration + text, finish + page, export, Steph's review with
the new checks) are logged as friction by rule, as in round 1.

### Phase 1 close: the live run and its two findings (2026-11-08)

The coordinator ran `pilot_figure1.cjs` live (real API, synthetic checkpoint `nexo-complete-synthetic`): **20 of 24**
steps passed. The Team round trip of the saved ZIP (`pilot_team_roundtrip.R`) was all PASS. Facts the coordinator
verified on the real API:

- F1 (step 4b and what follows from it, 7c and Steph's 12): the QC PCA copy's own `customCol_Control` is set in the
  session, but no render (cache cleared, another size) changes Control's `#E41A1C`. The copy's map is the session's
  (`global_color_map`); its pickers only feed the module's return value (Team's main QC tab bridges it). What Team
  offers for group colours is the session palette in the data hub (`R/modules/1_shared_data_module.R`, "Colors &
  palettes": `palette_choice` + `palette_use`, per-group colours through `color_settings_val`/`masterColorMaps`,
  `palette_save`, `palette_upload`; saved in and restored from the checkpoint).
- F2 (step 7): with Team's plot heights Fit lands at ~14 %; cards there are thumbnails with a 0 px, inert header, and
  the canvas moved a card only from its header.
- Step 12: the violin's statistics marker read with `innerText` was `""` because Steph's view is at the thumb tier.

The script now follows the fixes: 4b and 7c use the session palette (rail Palettes) and keep the pixel check; 7 drags a
thumbnail by its body; 11b reads the colour in Team's `state.json` `color_shape`; 12 reads the statistics marker with
`textContent`; `pilot_team_roundtrip.R` (vi) checks the logged colour in Team's archive reader and after Team's
restore. Mock run of this tip: **48 of 48** (Chromium, WebKit); details and the one WebKit script fix (a far-out
card clicked through the minimap, also failing on the base tip) are in `h9/session-palette/README.md`. The Live
section below is the coordinator's.

### Live

Run by the coordinator on 2026-11-08 at tip a3bcf1ad, against the real API code of that tip (a temporary API on the
RTX with 3 render workers and its own storage holding only `nexo-complete-synthetic`), through Vite dev
(`tests/dual-ui/chart-audit/vite.audit.config.mjs` proxy) and an SSH tunnel. Evidence: `h9/pilot-simulation/live/`
(`chromium/`, `webkit/`: step PNGs, `pilot-log.json`, `pilot-output.txt`, `team-roundtrip.txt`).

| Engine | Steps | Team round trip of the saved ZIP |
|---|---|---|
| Chromium | 24 / 24 PASS, 0 console errors | all PASS: (i) read, (ii) validate equals, (iii) restore + 8 plots created, no instance error, (iv) catalog + inputs, (v) counts, (vi) session colour Control #0055AA read and restored |
| WebKit | 24 / 24 PASS, 0 console errors | all PASS (same checks) |

Earlier live runs on the same day found F1 and F2 (above, fixed) and three script problems: titles out of reach at
the thumb tier (the script now clicks the thumbnail first), the statistics marker read with innerText at the thumb
tier, and the layout read mid-settle around Tidy up (the script now waits for the settle and the camera).

What the live log shows (Chromium; WebKit within 0.3 s):

- Add-and-draw, click to drawn plot: PCA 2.0 s, violin 1.0 s, volcano 0.8 s, composition 0.7 s, structural summary
  1.9 s (placeholder), heatmap 1.1 s, FLA 1.7 s. First renders come from the worker that warmed the card
  (`pool` ~3 ms, no `open`).
- **3e Selected-feature distributions: 36 s.** Team's default Plot Height is 3000 px; the create spends 23 s in the
  module's first flush and 12.5 s seeding its inputs (Server-Timing in the log). This is Team's module computing a
  620×3000 figure; it is the slowest card of the catalog and the next speed target.
- 4b: the session palette set Control to #aa3300 and the PCA drew it; 7c: the session was deleted (HTTP 200), the
  app reconnected (s5 → s6) and kept the palette (#0055aa), the violin title, the FLA pick and the structural drawing.
- 4d: "Significant only" was allowed (the design was confirmed in step 2); its note reads Team's wording.
- 7b: at 181 % the PCA image is 1240×1440 for 618×682 CSS px (dpr 2 asked).
- 7: at 14 % the composition card is a thumbnail and moves by its body; Tidy up, Undo and Redo behave.
- 12: Steph's reopen restores cards, finished snapshots, statistics marker, illustration, text, paper and layout; the
  structural card is drawn again by replaying Initiate once.

### What it does not cover (round 2)

- In the mock: the disabled "Significant only" case (step 2 confirms the design first); a real session DELETE (the
  mock drops its session with `evict(409)`); Server-Timing; the PCA's real Data inputs (step 4).
- One canvas tab only. Tab counts are logged (0 in the ZIP, 1 on screen), but nothing moves cards between tabs.
- Non-Retina desktop for Paula (Steph's desk is 1×). In live, Paula's renders at ≥ 100 % ask for dpr 2, which costs
  more than round 1's 1× renders. Timings are not directly comparable.
- Paula's real checkpoint and her real Figure 1 panels: synthetic checkpoints only. Judgement still needs Paula and
  Steph.

## Steph's review fixes (2026-11-08)

Steph's simulated review (`nexo-steph-review.md`) asked for five P2 fixes. The pilot steps they change are in the
round 2 step list above (10, 10b, 12; step 4b's logged toasts now give the redraw count). What the app does now:

- **Session palette (review 7c).** Two groups of one grouping that are hard to tell apart get an inline warning naming
  both ("Control and Treatment are hard to tell apart…"); the change is still applied. Criterion: CIEDE2000 < 20, or hue
  within 25° with both CIELAB chroma > 20 (`src/palette/groupContrast.ts`). Team's own presets give two groups their
  first two swatches, so Ocean & Coral (#155E75/#0E7490) and Earth & Garden (#365314/#65A30D) warn for two groups;
  Default, Tableau Classic and Colorblind Friendly do not.
- **Palette wording (review 4b).** The colours apply to the plots that follow the session palette. The palette
  response does not say which cards follow it, so Nexo compares each plot card's drawing before the change with the
  redraw it starts. The toast says "Session colours applied: N of M plots redrew (K not drawn yet). Plots with their own
  colour settings keep them." A card that kept its colours says "This plot uses its own colours (Appearance tab)." in
  its Data tab.
- **Study design on reopen (rows 2, 12).** The confirmed design is saved in Nexo's member (`design: {unit, type}`) and
  offered, prefilled, on reopen when the session comes back unconfirmed; it is never confirmed by itself. Against the
  live API the session already comes back confirmed (production's restore re-applies the archived design inputs:
  `POST /sessions` on the saved ZIP returns `design.confirmed = true`, Animal/independent), so nothing is asked and the
  differential plots can be added; the mock does not restore it and shows the prefilled dialog. Step 12 accepts either. Opening a checkpoint does not dirty it. The live
  "Unsaved changes" at step 12 came after the script's own Layout → Free and undo: autosave counted edits, not
  content. It now compares with the document as opened or last saved.
- **Figure page (row 9).** Besides texts and shapes, the page names the finished plots the layout leaves out ("2
  finished plots are not on this layout: Violin, Volcano. Free shows them.") and marks them in the Plots column.
- **Page export (row 10).** Step 10b above.


### Live after the fixes (2026-11-08)

Same setup as the Live section (temporary API on the test tree, isolated storage holding only the synthetic
checkpoint, production science: `scienceMatchesProduction = true`, 21 files). Evidence replaced in
`nexo-phase1-evidence/h9/pilot-simulation/live/{chromium,webkit}/`.

- Pilot: Chromium 25/25, WebKit 25/25 (friction notes 7 in each, none failing). Mock: 25/25.
- Step 10: the bundle now lists `Figure_PCA_2D_Score_Plot.pdf`, `.svg`, `_data.csv`, `reproduce_figure_pca_2d_score_plot.R`,
  `figure_provenance.json`.
- Step 10b: the composed page exports as a one-page Letter PDF (612 × 792 pt) and an SVG of the same size holding the
  2 filled panels of the Figure 1 template (A schematic, B PCA) and its PENDING slots (`<engine>-figure-page.pdf/.svg`).
- Step 12: the design came back confirmed with the checkpoint (see above); the save pill read "Autosave ready" on open
  and at the end.
- Team round trip (`pilot_team_roundtrip.R` on each saved ZIP): all PASS in both engines (8/8), counts match step 11b.
