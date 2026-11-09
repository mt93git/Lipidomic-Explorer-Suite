# Astra review fixes (Nexo Phase 1 close), 2026-11-08

Implementer: Opus 5.5. Branch `router/20261108-150605-920cc2`, based on `nexo/phase1` `37174c8b`. Review:
`docs/integration/chart-audit/astra-adversarial-review.md` (P1 table).

**What ran where.** The M1 has no R install. R code was checked in a throwaway local `r-base` Docker image (R 4.6,
Debian packages shiny 1.13.0, bslib, plotly 4.12.1, xml2, htmltools; not Team's full package set): parse checks,
the synthetic parts of the new R tests, and a before/after comparison over Team's real static module markup. Every
part that needs a live Team session (R/global.R + checkpoint) is **unrun**; the coordinator runs it on the RTX (list
at the end). Nexo: vitest, tsc and the mock Playwright suites ran on the M1.

## 1. Downloads owned by another plot (b07 F5) — done (R part 2 unrun)

Red `14cd4ad5` → green `d4502c2b`.

- Rule (`R/frontends/api/export.R`, `api_nearest_download_links`): a download button belongs to the plot(s) in the
  smallest container around it that holds a plot output (Shiny plot/image output, htmlwidget output, the card's own
  anchor, the family's other catalog outputs and their renderUI wrappers, and renderUI carriers that draw a plot).
  The card keeps a button only when that container also holds its own plot; buttons in another tab pane stay
  excluded; the walk goes on to the module root, nearest first.
- Red (`item1-red.txt`): `FAIL b07 F5: the network card lists another plot's downloads: downloadPropCSV, downloadPropPDF`.
- Green (`item1-2-green.txt`): the 4 synthetic checks of `tests/dual-ui/test_api_download_ownership.R` part 1 and the
  existing `tests/dual-ui/test_api_download_labels.R` pass.
- Before/after over **all 55 static catalog anchors** of Team's real markup (`item1-2-static-compare.txt`, script
  `item1-2-static-compare.R`; the structural proportions carrier simulated as in a live session): only 3 change —
  `structural_tab-networkPlot` (CSV/PDF of the proportions panel → nothing), `logratio_tab-logratioPlot` (item 2) and
  `pathway_tab-pathwayPlot` (gains `download_config`, which `api_config_download_links` already appended: the final
  list is unchanged). Dashboard violin `dl_violin`, bar chart unfiltered, structural grid, group comparison,
  QC, FLA, longitudinal, cellular and cell plots are unchanged.

## 2. Logratio batch exports (b06 row 7) — done (R part 2 unrun)

Same commits. Why they were missed: the violin plot sits in a renderUI wrapper (`scrollable_plot_ui`, the card's
static anchor); the walk stopped at the card body holding "Export PDF"/"Export Data"; the four batch buttons are in
the module's sidebar (`R/modules/9_logratio_module.R` l.86-92). Now the card lists `downloadPlot`, `downloadCSV`,
`downloadAllMacroZip`, `downloadAllMacroCsv`, `downloadAllSubclassZip`, `downloadAllSubclassCsv`; the shared labels
carry their heading ("Download All PDFs (ZIP) · Batch Exports: Lipid Category", …) through
`api_qualify_download_labels`. Caution for the live re-run: "Download All PDFs (ZIP)" builds many PDFs in Team's
handler and holds the single R engine while it runs (see item 4).

## 3. Plotly click bridge (b12 cell_class_plot, cell_comparison_plot) — done (R part 2 unrun)

Commits: API red `7c88c346` (+ evidence `ac4f026d`) → green `084168da`; client red `6a1331ea` → green `8ea7f408`;
follow-up red `d6323cbe` → green `febbb97a`.

- Team (checked in the installed plotly 4.12.1): the htmlwidget sends `Shiny.setInputValue("plotly_click-" +
  x.source, JSON.stringify(eventDataWithKey(d)), {priority: "event"})`; `plotly::event_data` reads
  `session$rootScope()$input[["plotly_click-<source>"]]` and parses it with `jsonlite::parse_json(simplifyVector =
  TRUE)`; `lipidomic_plotly_event` (`R/utils_plot_events.R`) wraps it. A canvas copy observes the private sources
  `<ns>-cell_class_profile` / `<ns>-cell_comparison_points` (`R/frontends/team/plot_instances.R` l.55-62).
- Route choice: **`POST /api/v1/sessions/<id>/cards/<instanceId>/events`** `{event: "plotly_click", source, points}`,
  not PATCH: the event input is a root input outside the card's namespace, PATCH accepts only the card's
  `allowedInputs` (which exclude `plotly_` inputs on purpose), and a click is an event (priority "event"), not a
  value to save. The API sets `plotly_click-<instanceId>-<source>` to the JSON plotly would send (a repeated identical
  click is reset to NULL first), flushes, and answers `{settled, inputs, changed}`. Changed inputs count as an edit:
  session dirty, recorded with the card's explicit inputs (disk cache key, render-worker copies), card epoch bumped.
- Sources: only `cell_class_plot → cell_class_profile` and `cell_comparison_plot → cell_comparison_points`
  (`api_card_click_sources`, catalog field `clickSource`). The R test checks in Team's code that each one is
  registered with `event_register("plotly_click")` and observed on a canvas copy. Checked and **not forwarded**: the
  dashboard (`rd_<chart>`, `R/results_dashboard.R` l.441-458) and Guided QC (`guided_qc_points`,
  `R/modules/2_qc_boxplot_module.R` l.1239-1250) also register clicks, but their effect is a Team side panel outside
  the plot (sample card, exclusion popover) that a Nexo card does not show — open item below.
- Client (`frontends/nexo/src/plotlyClick.ts`): `plotlyClickPoints` mirrors plotly's `eventDataWithKey`
  (curveNumber, pointNumber, x, y, z/customdata only when present, key); `bindPlotClick` binds only when the figure's
  source is an instance's private source for the card's `clickSource` (the card's own instance, or a render worker /
  disk-cache copy `tcinstance_pool<hash>-<source>`; the event always goes to the card's own instance). The changed
  inputs go through `handle.updateCardInputs` (one undo step, saved with the card) and the card draws again; read-only
  viewers do not forward.
- Mechanism probe (`item3-api-green.txt`, `item3-mock-click-probe.R`): in a `MockShinySession`, setting the root input
  reaches a module observer through `lipidomic_plotly_event` with `hit$y == "PC"` (data.frame, as in Team).
- Red: `item3-api-red.txt` (`FAIL the API has no plotly_click bridge`), `item3-client-red.txt` (module missing),
  `item3-pool-source-red.txt` (worker-drawn figure not bound). Green: `item3-client-green.txt` — vitest
  `src/plotlyClick.test.ts` 9/9; `node tests/dual-ui/test_nexo_plotly_click.cjs` (mock, Chromium + WebKit, a real mouse
  click on a bar / a point: event body, `cell_class = PE` / `cell_sample = S03`, redraw, one Undo step, no forwarding on
  the dashboard PCA) 10 PASS, stable over 5 consecutive runs after the test waits for Plotly's hover label before
  clicking (one earlier run clicked while the card was still being redrawn).

## 4. logratioPlot Finish never finishes (b06 row 8) — not reproduced, no fix

- Read the finish path (`frontends/nexo/src/cards.ts` `finish()`, `liveImage()`, `src/ui/Dialogs/ExportDialog.tsx`
  `plotImage`). The audit's final state "updating" with no message at 180 s matches `finish()` waiting 10 s for a
  render still in flight (`rendering > 0`), then throwing "Wait for preparation and this plot to finish updating…"
  before its `finally` (the toast had disappeared by 180 s). So a render of that card stayed in flight. The export
  path itself is client-side (no render). The API renders the module at the card size (the logratio `renderPlot`
  has no fixed height), so a "tall plot" is not drawn by the API.
- Mock: `tests/dual-ui/test_nexo_finish_after_export.cjs` replays the audit's checks 7 and 8 (Download PNG, every
  module download, the Export dialog's PDF, then Finish): **finished within 20 s** (`item4-mock-finish-after-export.txt`).
  The client alone does not reproduce it.
- Hypothesis (not verified): Nexo's request queue (`src/prefetch.ts`) runs a non-shared request (module downloads,
  PATCH, save) alone, and the R engine serves one request at a time; a request that does not answer (a long Team
  download handler, a lost/evicted session, a render-worker promise that never resolves) keeps the card's render
  waiting. The b06 runs also saw session evictions by a parallel auditor. With item 2 the violin card now also offers
  "Download All PDFs (ZIP)", which makes a long engine hold more likely during an export check.
- **Coordinator, live (RTX), with the API to itself:**
  1. Start the API with `NEXO_API_DEBUG=1` and keep its stderr (one `render <instance> …` line per render, with
     phases and `where=`), the app from this branch, and no other auditor on that API.
  2. `NEXO_AUDIT_BASE=<app url> node tests/dual-ui/chart-audit/audit_b06-differential.cjs logratioPlot` (the script
     takes plot outputs as arguments).
  3. If check 8 fails: from the API log, note the last request before Finish and whether a render of that card's
     instance started without a matching `render …` line (in flight), and any `session_lost`/409. The script's
     `logratioPlot-8-finish-failed.png` and its results JSON give the card state at the timeout.
  4. Also run once with check 7 skipped (comment out the "More downloads" loop) to tell a download hold from a render
     hang. Report which request stayed open; that decides between an API fix (e.g. a long download outside the
     engine lock) and a client fix (e.g. let Finish take the drawn image when only the pixel ratio is being refreshed).

## 5. summaryPlot textSize 14 at 390 px (b07 F2) — test written, unrun

`tests/dual-ui/test_api_summary_textsize.R` (`5af981c2`): structural summaryPlot, design confirmed, `runAnalysis`
pressed, draws at 620×720; `textSize 5` refused (400) and `textSize 14` applied as in the audit; render 390×520 must
either draw (prints NOTE: not reproduced) or be a 422 whose message is "Team's module could not draw this plot: <the
module's R error>" — checked through `api_card_render` and through the HTTP route (never a 500); then it draws again
at 620×720 with textSize 14 and at 390×520 with textSize 10. Parsed in Docker only.

## 6. Report bookkeeping — done

`23645e12`: check 3 of b01 `dist` (clips below 300 px card height), b04 `donutPlotUnfiltered` (both rounds; below
620 px), b08 `diffAllPlot` (both rounds; below 620 px), b09 `logratioPlot` (below 620 px) and b12
`cell_comparison_plot` (below ≈ 430 px) now say "PASS (Team module clips below <N> px, same PNG as Team)" — "same
figure as Team" for the two Plotly cards (dist, cell_comparison), whose evidence is a figure, not a PNG. N is the
smallest tested size without the clip. b01 design: Okabe–Ito orange 2.25:1 and sky blue 2.31:1 against white (below
3:1), about 1.6× the pastels, kept for colour-vision safety. b07 F3 marked fixed by the module actions replay. Each
changed report ends with an "Astra review 2026-11-08" line. No other row was changed.

## App rule (last app commit `febbb97a`)

`cd frontends/nexo && npx vitest run` — 126 files, 594 tests passed; `npx tsc --noEmit -p .` — clean;
`node tests/dual-ui/test_nexo_inspector.cjs` — exit 0, 44 PASS; `node tests/dual-ui/test_nexo_card_chrome.cjs` —
exit 0, 29 PASS; `node tests/dual-ui/test_nexo_plotly_click.cjs` — exit 0, 10 PASS. No evidence file outside this
folder changed (nothing to check out). Plotly for the builds: `NEXO_PLOTLY_JS` set to the vendored `plotly.min.js`.

## R tests for the coordinator (RTX)

| Test | What | Status here |
|---|---|---|
| `Rscript tests/dual-ui/test_api_download_ownership.R` | items 1-2, part 2 live: network lists nothing, propPlotPlot unchanged, logratio + 4 batch (qualified labels, one batch CSV served), GC / dashboard violin / bar / grid diffAll unchanged | part 1 green in Docker |
| `Rscript tests/dual-ui/test_api_download_labels.R` | must stay green | green in Docker |
| `Rscript tests/dual-ui/test_api_export.R` | must stay green (violin `dl_violin`, bar CSV/PDF, legacy PCA) | unrun |
| `Rscript tests/dual-ui/test_api_pathway_layout_json.R` | download_config still listed | unrun |
| `Rscript tests/dual-ui/test_api_plotly_click.R` | item 3, part 2 live: catalog clickSource, class click → cell_class, comparison click → cell_sample, refusals, HTTP route | part 1 green in Docker |
| `Rscript tests/dual-ui/test_api_summary_textsize.R` | item 5 | parsed only |
| `Rscript tests/dual-ui/test_api_catalog.R` | catalog entries gained `clickSource` on the two cell plots | unrun |

Note for those runs: several tests print SKIP and exit 0 when Team's packages are missing; keep the output and check
that the PASS lines of part 2 are there.
